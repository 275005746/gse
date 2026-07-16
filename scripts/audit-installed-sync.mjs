#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const installedRootArg = readArg('--installed-root', process.env.GSE_INSTALLED_SKILL_ROOT || null)
const installedRoot = installedRootArg ? path.resolve(installedRootArg) : null
const jsonOnly = args.includes('--json')

function run(command, commandArgs, cwd = root) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    command: [command, ...commandArgs].join(' '),
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function exists(relativePath, base = root) {
  return fs.existsSync(path.join(base, relativePath))
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function packageToTemp() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-installed-sync-'))
  const packageOut = path.join(tempRoot, 'package')
  const packageRun = run(process.execPath, [
    path.join(root, 'scripts', 'package-gse.mjs'),
    '--root',
    root,
    '--out',
    packageOut,
    '--label',
    'installed-sync',
    '--force',
    '--json',
  ])
  const manifestPath = path.join(packageOut, 'gse-package-manifest.json')
  const manifest = fs.existsSync(manifestPath) ? parseJson(fs.readFileSync(manifestPath, 'utf8')) : null
  return { tempRoot, packageOut, packageRun, manifest }
}

function compareInstalled(manifest, targetRoot) {
  if (!targetRoot) return { compared: 0, missing: [], mismatched: [] }
  const missing = []
  const mismatched = []
  const fileHashes = manifest?.fileHashes ?? {}
  for (const [relativePath, expectedHash] of Object.entries(fileHashes)) {
    const targetPath = path.join(targetRoot, relativePath)
    if (!fs.existsSync(targetPath)) {
      missing.push(relativePath)
      continue
    }
    const actualHash = sha256(targetPath)
    if (actualHash !== expectedHash) mismatched.push(relativePath)
  }
  return {
    compared: Object.keys(fileHashes).length,
    missing,
    mismatched,
  }
}

const { tempRoot, packageOut, packageRun, manifest } = packageToTemp()
const packageJson = exists('package.json') ? parseJson(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) : null
const packageCopyJson = exists('package.json', packageOut) ? parseJson(fs.readFileSync(path.join(packageOut, 'package.json'), 'utf8')) : null
const installedComparison = compareInstalled(manifest, installedRoot)
const installedCommand = installedRoot
  ? run(process.execPath, [
      path.join(installedRoot, 'scripts', 'run-gse-command.mjs'),
      '--root',
      installedRoot,
      '--target',
      installedRoot,
      '--command',
      '/gse maintenance --package-smoke --skip-release-bundle',
      '--json',
      '--compact',
    ], installedRoot)
  : null
const installedCommandData = installedCommand ? parseJson(installedCommand.stdout) : null

const requiredPackageFiles = [
  'SKILL.md',
  'package.json',
  'references/commands.md',
  'references/maintenance-cadence.md',
  'scripts/backfill-evidence-levels.mjs',
  'scripts/audit-evidence-review-queue.mjs',
  'scripts/audit-installed-sync.mjs',
  'scripts/audit-session-sync.mjs',
  'scripts/audit-maintenance-snapshot.mjs',
  'scripts/generate-maintenance-snapshot.mjs',
  'scripts/audit-maintenance-cadence.mjs',
  'scripts/record-session-sync.mjs',
  'scripts/run-gse-command.mjs',
  'scripts/validate-gse.mjs',
]

const checks = [
  check('IS01', 'package-gse creates a fresh package manifest', packageRun.status === 0 && manifest?.fileCount > 20 && Boolean(manifest?.integrity?.packageDigest), packageRun.command),
  check('IS02', 'package manifest includes installed sync entrypoint and maintenance command support', manifest?.files?.includes('scripts/audit-installed-sync.mjs') && manifest?.files?.includes('scripts/audit-maintenance-cadence.mjs') && manifest?.files?.includes('references/maintenance-cadence.md'), 'gse-package-manifest.json'),
  check('IS03', 'required package files are present in the package output', requiredPackageFiles.every((file) => exists(file, packageOut)), requiredPackageFiles.join(', ')),
  check('IS04', 'package copy preserves package metadata version', packageJson?.version && packageCopyJson?.version === packageJson.version, `source=${packageJson?.version ?? 'missing'}, package=${packageCopyJson?.version ?? 'missing'}`),
  check('IS05', 'package manifest does not expose the source root', manifest && !JSON.stringify(manifest).includes(root), 'gse-package-manifest.json'),
  installedRoot
    ? check('IS06', 'installed root exists and contains GSE entrypoint', exists('SKILL.md', installedRoot) && exists('scripts/run-gse-command.mjs', installedRoot), installedRoot)
    : check('IS06', 'installed root comparison is optional and explicit', true, 'no --installed-root supplied; package self-check only'),
  installedRoot
    ? check('IS07', 'installed root matches fresh package file hashes', installedComparison.compared > 20 && installedComparison.missing.length === 0 && installedComparison.mismatched.length === 0, `compared=${installedComparison.compared}, missing=${installedComparison.missing.length}, mismatched=${installedComparison.mismatched.length}`, 'Run the install/sync step again before claiming the installed skill is fresh.')
    : check('IS07', 'installed hash comparison skipped without installed root', true, 'supply --installed-root to compare a real installed copy'),
  installedRoot
    ? check('IS08', 'installed copy can run package-only /gse maintenance smoke', installedCommand?.status === 0 && installedCommandData?.summary?.failed === 0, installedCommand?.command ?? 'not run')
    : check('IS08', 'installed command smoke skipped without installed root', true, 'supply --installed-root to run installed command smoke'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  installedRoot,
  generatedAt: new Date().toISOString(),
  tempRoot,
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    freshPackage: packageRun.status === 0 ? 'verified' : 'failed',
    installedSync: installedRoot ? failed === 0 ? 'verified' : 'failed' : 'not-requested',
    installedCommandSmoke: installedRoot ? installedCommand?.status === 0 ? 'verified' : 'failed' : 'not-requested',
  },
  comparison: installedComparison,
  limits: [
    'Without --installed-root this audit verifies fresh package contents only.',
    'With --installed-root it compares every packaged file hash against the installed copy and runs a package-only /gse maintenance smoke from that installed copy.',
    'This audit does not publish a package, update npm, or prove native host slash-command support.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Installed Sync Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('Installed root: ' + (data.installedRoot ?? 'not provided'))
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Fresh package: ' + data.workflows.freshPackage)
  lines.push('- Installed sync: ' + data.workflows.installedSync)
  lines.push('')
  lines.push('## Checks')
  lines.push('')
  for (const item of data.checks) {
    const marker = item.status === 'passed' ? '[x]' : '[ ]'
    lines.push('- ' + marker + ' ' + item.id + ' ' + item.label + ': ' + item.evidence)
  }
  lines.push('')
  lines.push('## Limits')
  lines.push('')
  for (const item of data.limits) lines.push('- ' + item)
  return lines.join('\n') + '\n'
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(renderMarkdown(report))

fs.rmSync(tempRoot, { recursive: true, force: true })

if (failed > 0) process.exit(1)
