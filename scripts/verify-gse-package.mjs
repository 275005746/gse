#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const packageDir = path.resolve(readArg('--package', process.cwd()))
const publicKeyPath = path.resolve(readArg('--public-key', path.join(packageDir, 'gse-signing-public.pem')))
const signaturePath = path.resolve(readArg('--signature', path.join(packageDir, 'gse-package-signature.json')))
const jsonOnly = args.includes('--json')

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function fingerprint(pem) {
  return crypto.createHash('sha256').update(pem).digest('hex')
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

const manifestPath = path.join(packageDir, 'gse-package-manifest.json')
const manifest = readJson(manifestPath)
const signatureRecord = readJson(signaturePath)
const publicKeyPem = fs.existsSync(publicKeyPath) ? fs.readFileSync(publicKeyPath, 'utf8') : ''

const files = manifest?.files ?? []
const hashMismatches = []
for (const relativePath of files) {
  const fullPath = path.join(packageDir, relativePath)
  const expected = manifest?.fileHashes?.[relativePath]
  const actual = fs.existsSync(fullPath) ? sha256(fullPath) : null
  if (!expected || actual !== expected) hashMismatches.push({ relativePath, expected, actual })
}
const recomputedDigest = manifest
  ? crypto.createHash('sha256').update(JSON.stringify({ files: manifest.files, fileHashes: manifest.fileHashes })).digest('hex')
  : null
const payloadText = signatureRecord?.payload ? JSON.stringify(signatureRecord.payload) : ''
let signatureOk = false
try {
  signatureOk = Boolean(publicKeyPem && signatureRecord?.signature && crypto.verify(null, Buffer.from(payloadText), publicKeyPem, Buffer.from(signatureRecord.signature, 'base64')))
} catch {
  signatureOk = false
}

const checks = [
  check('SIG01', 'manifest exists', Boolean(manifest), manifestPath),
  check('SIG02', 'signature record exists', Boolean(signatureRecord), signaturePath),
  check('SIG03', 'public key exists', Boolean(publicKeyPem), publicKeyPath),
  check('SIG04', 'all file hashes match manifest', hashMismatches.length === 0, hashMismatches.length ? JSON.stringify(hashMismatches.slice(0, 5)) : 'all files'),
  check('SIG05', 'manifest package digest matches file hash table', Boolean(manifest?.integrity?.packageDigest && recomputedDigest === manifest.integrity.packageDigest), 'integrity.packageDigest'),
  check('SIG06', 'signature payload matches manifest digest', Boolean(signatureRecord?.payload?.packageDigest && signatureRecord.payload.packageDigest === manifest?.integrity?.packageDigest), 'signature payload packageDigest'),
  check('SIG07', 'signature verifies with public key', signatureOk, 'ed25519 signature'),
  check('SIG08', 'public key fingerprint matches signature record', Boolean(publicKeyPem && signatureRecord?.publicKeyFingerprint === fingerprint(publicKeyPem)), 'public key fingerprint'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  packageDir,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { packageSignature: failed === 0 ? 'verified' : 'failed' },
  checks,
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))

if (failed > 0) process.exit(1)

