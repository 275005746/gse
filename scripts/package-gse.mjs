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

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const label = readArg('--label', 'gse-local-' + new Date().toISOString().slice(0, 10))
const out = path.resolve(readArg('--out', path.join(process.env.TEMP || process.env.TMP || root, label)))
const force = args.includes('--force')
const dryRun = args.includes('--dry-run')
const jsonOnly = args.includes('--json')

const include = [
  'package.json',
  'SKILL.md',
  'README.md',
  'README.zh-CN.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'SECURITY.md',
  'SUPPORT.md',
  '.github',
  'agents',
  'assets',
  'examples',
  'references',
  'scripts',
  '.gse',
]

const excludeNames = new Set(['.git', 'node_modules', 'dist', '.DS_Store'])
const packageGseAllowlist = new Set([
  '.gse/README.md',
  '.gse/project-profile.md',
  '.gse/quality-gates.md',
  '.gse/gse-development-protocol.md',
  '.gse/state.json',
  '.gse/releases',
  '.gse/releases/public-release-owner-required.md',
  '.gse/releases/public-security-contact-owner-required.md',
])
const excludeRelativePrefixes = [
  '.gse/evidence/',
  '.gse/benchmark-audits/',
  '.gse/acceptance/',
  '.gse/archive/',
  '.gse/changes/',
  '.gse/release-bundles/',
]

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function shouldExclude(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/')
  if (normalized.startsWith('.gse/') && !packageGseAllowlist.has(normalized)) return true
  if (excludeRelativePrefixes.some((prefix) => normalized.startsWith(prefix))) return true
  return normalized.split('/').some((part) => excludeNames.has(part))
}

function walk(sourcePath, basePath = sourcePath) {
  const entries = []
  if (!fs.existsSync(sourcePath)) return entries
  const stat = fs.statSync(sourcePath)
  if (stat.isFile()) {
    const relativePath = path.relative(root, sourcePath).replace(/\\/g, '/')
    if (!shouldExclude(relativePath)) entries.push({ sourcePath, relativePath, bytes: stat.size })
    return entries
  }
  for (const child of fs.readdirSync(sourcePath, { withFileTypes: true })) {
    const fullPath = path.join(sourcePath, child.name)
    const relativePath = path.relative(root, fullPath).replace(/\\/g, '/')
    if (shouldExclude(relativePath)) continue
    if (child.isDirectory()) entries.push(...walk(fullPath, basePath))
    else if (child.isFile()) entries.push({ sourcePath: fullPath, relativePath, bytes: fs.statSync(fullPath).size })
  }
  return entries
}

function copyFile(entry) {
  const targetPath = path.join(out, entry.relativePath)
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.copyFileSync(entry.sourcePath, targetPath)
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

const missing = include.filter((item) => !exists(item))
const files = include.flatMap((item) => walk(path.join(root, item)))
const sortedFiles = files.map((item) => item.relativePath).sort()
const fileHashes = Object.fromEntries(
  sortedFiles.map((relativePath) => [relativePath, sha256(path.join(root, relativePath))]),
)
const manifest = {
  schemaVersion: 1,
  packageName: 'gse',
  label,
  generatedAt: new Date().toISOString(),
  fileCount: files.length,
  totalBytes: files.reduce((sum, item) => sum + item.bytes, 0),
  includes: include,
  excludes: [...excludeNames, ...excludeRelativePrefixes, '.gse/* except portable package allowlist'],
  packageGseAllowlist: [...packageGseAllowlist].sort(),
  entrypoints: {
    nodePackage: 'package.json',
    skill: 'SKILL.md',
    cli: 'scripts/gse.mjs',
    validate: 'scripts/validate-gse.mjs',
    npmPackageAudit: 'scripts/audit-npm-package-metadata.mjs',
    validationProfile: 'scripts/run-validation-profile.mjs',
    install: 'scripts/install-gse.mjs',
    commands: 'references/commands.md',
  },
  integrity: {
    algorithm: 'sha256',
  },
  files: sortedFiles,
  fileHashes,
}
manifest.integrity.packageDigest = crypto
  .createHash('sha256')
  .update(JSON.stringify({ files: manifest.files, fileHashes: manifest.fileHashes }))
  .digest('hex')

const report = {
  root,
  out,
  label,
  dryRun,
  status: missing.length === 0 ? 'ready' : 'failed',
  missing,
  fileCount: files.length,
  totalBytes: manifest.totalBytes,
  manifestPath: path.join(out, 'gse-package-manifest.json'),
}

if (missing.length === 0 && !dryRun) {
  if (fs.existsSync(out)) {
    if (!force) {
      report.status = 'exists'
      report.recommendation = 'Use --force or choose another --out directory.'
    } else {
      fs.rmSync(out, { recursive: true, force: true })
    }
  }
  if (report.status === 'ready') {
    fs.mkdirSync(out, { recursive: true })
    for (const file of files) copyFile(file)
    fs.writeFileSync(path.join(out, 'gse-package-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    report.status = 'written'
  }
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else {
  console.log('GSE package status: ' + report.status)
  console.log('Output: ' + report.out)
  console.log('Files: ' + report.fileCount)
  if (report.missing.length) console.log('Missing: ' + report.missing.join(', '))
}

if (report.status === 'failed' || report.status === 'exists') process.exit(1)
