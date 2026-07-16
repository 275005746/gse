#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const sourceArg = readArg('--source', null)
const sourceUrlArg = readArg('--source-url', null)
const manifestUrlArg = readArg('--manifest-url', null)
const publicKeyArg = readArg('--public-key', null)
const skipIntegrity = args.includes('--skip-integrity')
const skipSignature = args.includes('--skip-signature')
let materializedRemote = null
let source = path.resolve(sourceArg ?? path.join(import.meta.dirname, '..'))
const target = path.resolve(readArg('--target', ''))
const force = args.includes('--force')
const dryRun = args.includes('--dry-run')
const jsonOnly = args.includes('--json')

const defaultInclude = [
  'package.json',
  'SKILL.md',
  'README.md',
  'README.zh-CN.md',
  'agents',
  'assets',
  'examples',
  'references',
  'scripts',
  '.gse',
]

function joinUrl(base, relativePath) {
  const cleanBase = base.endsWith('/') ? base : base + '/'
  return new URL(relativePath.split('/').map(encodeURIComponent).join('/'), cleanBase).toString()
}

async function fetchText(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  return await response.text()
}

async function fetchBytes(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  return Buffer.from(await response.arrayBuffer())
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function fingerprint(pem) {
  return crypto.createHash('sha256').update(pem).digest('hex')
}

function verifyPackageSignature(packageDir, publicKeyPath) {
  const signaturePath = path.join(packageDir, 'gse-package-signature.json')
  if (!publicKeyPath) return { status: 'not-requested' }
  if (!fs.existsSync(publicKeyPath)) return { status: 'failed', error: 'public key does not exist', publicKey: publicKeyPath }
  if (!fs.existsSync(signaturePath)) return { status: 'failed', error: 'signature file does not exist', signaturePath }
  try {
    const signatureRecord = JSON.parse(fs.readFileSync(signaturePath, 'utf8').replace(/^\uFEFF/, ''))
    const publicKeyPem = fs.readFileSync(publicKeyPath, 'utf8')
    const manifestPath = path.join(packageDir, 'gse-package-manifest.json')
    const localManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''))
    const payloadText = JSON.stringify(signatureRecord.payload)
    const signatureOk = crypto.verify(null, Buffer.from(payloadText), publicKeyPem, Buffer.from(signatureRecord.signature, 'base64'))
    const digestOk = signatureRecord.payload?.packageDigest === localManifest.integrity?.packageDigest
    const fingerprintOk = signatureRecord.publicKeyFingerprint === fingerprint(publicKeyPem)
    return signatureOk && digestOk && fingerprintOk
      ? { status: 'verified', algorithm: signatureRecord.algorithm, publicKeyFingerprint: signatureRecord.publicKeyFingerprint }
      : { status: 'failed', error: 'signature, digest, or public key fingerprint mismatch' }
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}

async function resolveSource() {
  if (!sourceUrlArg && !manifestUrlArg) return { source, sourceMode: 'path', remoteBaseUrl: null }
  const urlText = sourceUrlArg ?? manifestUrlArg
  const parsed = new URL(urlText)
  if (parsed.protocol === 'file:') {
    const resolved = fileURLToPath(parsed)
    const stat = fs.existsSync(resolved) ? fs.statSync(resolved) : null
    if (stat?.isFile()) return { source: path.dirname(resolved), sourceMode: 'file-url', remoteBaseUrl: null }
    return { source: resolved, sourceMode: 'file-url', remoteBaseUrl: null }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Unsupported --source-url protocol. Expected file:, http:, or https:.')
  }

  const manifestUrl = manifestUrlArg ?? joinUrl(sourceUrlArg, 'gse-package-manifest.json')
  const manifestText = await fetchText(manifestUrl)
  const manifest = JSON.parse(manifestText.replace(/^\uFEFF/, ''))
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-remote-install-'))
  materializedRemote = tempRoot
  fs.writeFileSync(path.join(tempRoot, 'gse-package-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  const baseUrl = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1)
  try {
    const signatureText = await fetchText(joinUrl(baseUrl, 'gse-package-signature.json'))
    fs.writeFileSync(path.join(tempRoot, 'gse-package-signature.json'), signatureText, 'utf8')
  } catch {
    // Signature is optional unless --public-key is supplied.
  }
  for (const relativePath of manifest.files ?? []) {
    const fileUrl = joinUrl(baseUrl, relativePath)
    const bytes = await fetchBytes(fileUrl)
    const targetPath = path.join(tempRoot, relativePath)
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.writeFileSync(targetPath, bytes)
  }
  return { source: tempRoot, sourceMode: 'http-url', remoteBaseUrl: baseUrl }
}

let sourceInfo
try {
  sourceInfo = await resolveSource()
  source = sourceInfo.source
} catch (error) {
  const report = {
    source: sourceArg,
    sourceUrl: sourceUrlArg,
    manifestUrl: manifestUrlArg,
    target,
    status: 'failed',
    error: error instanceof Error ? error.message : String(error),
  }
  console.log(JSON.stringify(report, null, 2))
  process.exit(1)
}

const manifestPath = path.join(source, 'gse-package-manifest.json')
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''))
  : null

function walk(itemPath, rootPath = source) {
  const entries = []
  if (!fs.existsSync(itemPath)) return entries
  const stat = fs.statSync(itemPath)
  if (stat.isFile()) {
    entries.push(path.relative(rootPath, itemPath).replace(/\\/g, '/'))
    return entries
  }
  for (const child of fs.readdirSync(itemPath, { withFileTypes: true })) {
    const fullPath = path.join(itemPath, child.name)
    if (child.name === 'node_modules' || child.name === '.git') continue
    if (child.isDirectory()) entries.push(...walk(fullPath, rootPath))
    else if (child.isFile()) entries.push(path.relative(rootPath, fullPath).replace(/\\/g, '/'))
  }
  return entries
}

function sourceFiles() {
  if (manifest?.files?.length) return manifest.files
  return defaultInclude.flatMap((item) => walk(path.join(source, item)))
}

function copy(relativePath) {
  const from = path.join(source, relativePath)
  const to = path.join(target, relativePath)
  if (!fs.existsSync(from)) return { relativePath, status: 'missing-source' }
  if (!skipIntegrity && manifest?.fileHashes?.[relativePath]) {
    const actualHash = sha256(from)
    if (actualHash !== manifest.fileHashes[relativePath]) {
      return { relativePath, status: 'integrity-failed', expected: manifest.fileHashes[relativePath], actual: actualHash }
    }
  }
  if (!force && fs.existsSync(to)) return { relativePath, status: 'skipped' }
  if (!dryRun) {
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(from, to)
  }
  return { relativePath, status: dryRun ? 'would-write' : 'written' }
}

const files = sourceFiles()
const signatureStatus = skipSignature ? { status: 'skipped' } : verifyPackageSignature(source, publicKeyArg ? path.resolve(publicKeyArg) : null)
const report = {
  source,
  sourceUrl: sourceUrlArg,
  manifestUrl: manifestUrlArg,
  sourceMode: sourceInfo.sourceMode,
  target,
  dryRun,
  force,
  integrity: manifest?.integrity ? { algorithm: manifest.integrity.algorithm, packageDigest: manifest.integrity.packageDigest, skipped: skipIntegrity } : null,
  signature: signatureStatus,
  manifest: manifest ? { label: manifest.label, fileCount: manifest.fileCount } : null,
  status: 'passed',
  results: [],
  summary: { written: 0, skipped: 0, missingSource: 0, integrityFailed: 0, total: files.length },
}

if (!target) {
  report.status = 'failed'
  report.error = 'Missing --target <install-skill-dir>.'
} else if (!fs.existsSync(source)) {
  report.status = 'failed'
  report.error = 'Source does not exist.'
} else if (signatureStatus.status === 'failed') {
  report.status = 'failed'
  report.error = 'Package signature verification failed.'
} else {
  for (const file of files) report.results.push(copy(file))
  report.summary.written = report.results.filter((item) => item.status === 'written' || item.status === 'would-write').length
  report.summary.skipped = report.results.filter((item) => item.status === 'skipped').length
  report.summary.missingSource = report.results.filter((item) => item.status === 'missing-source').length
  report.summary.integrityFailed = report.results.filter((item) => item.status === 'integrity-failed').length
  if (report.summary.missingSource > 0 || report.summary.integrityFailed > 0) report.status = 'failed'
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else {
  console.log('GSE install status: ' + report.status)
  console.log('Source: ' + report.source)
  if (report.sourceUrl) console.log('Source URL: ' + report.sourceUrl)
  console.log('Target: ' + report.target)
  if (report.error) console.log('Error: ' + report.error)
  console.log('Written: ' + report.summary.written + ', skipped: ' + report.summary.skipped + ', missing source: ' + report.summary.missingSource + ', integrity failed: ' + report.summary.integrityFailed)
}

if (report.status !== 'passed') process.exit(1)
