#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const jsonOnly = args.includes('--json')
const keepTemp = args.includes('--keep-temp')

function run(command, commandArgs, cwd = root) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    command: [command, ...commandArgs].join(' '),
    cwd,
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

function npm(commandArgs, cwd = root) {
  return process.platform === 'win32'
    ? run('cmd', ['/c', 'npm', ...commandArgs], cwd)
    : run('npm', commandArgs, cwd)
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function exists(filePath) {
  return fs.existsSync(filePath)
}

function safeReadJson(filePath) {
  if (!exists(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-npm-tarball-'))
const consumerRoot = path.join(tempRoot, 'consumer')
fs.mkdirSync(consumerRoot, { recursive: true })
fs.writeFileSync(
  path.join(consumerRoot, 'package.json'),
  JSON.stringify({ name: 'gse-npm-tarball-consumer', version: '0.0.0', private: true }, null, 2) + '\n',
  'utf8',
)

const packRun = npm(['pack', '--json', '--pack-destination', tempRoot])
const packData = parseJson(packRun.stdout)
const packItem = Array.isArray(packData) ? packData[0] : null
const tarballPath = packItem?.filename ? path.join(tempRoot, packItem.filename) : null
const installRun = tarballPath
  ? npm(['install', tarballPath, '--ignore-scripts', '--no-audit', '--no-fund'], consumerRoot)
  : { command: 'npm install skipped; tarball not created', cwd: consumerRoot, status: 1, stdout: '', stderr: 'tarball not created' }
const installedRoot = path.join(consumerRoot, 'node_modules', '@t275005746', 'gse')
const installedPkg = safeReadJson(path.join(installedRoot, 'package.json'))
const repositoryUrl = typeof installedPkg?.repository === 'string' ? installedPkg.repository : installedPkg?.repository?.url
const expectedRepositoryUrls = new Set([
  'git+https://github.com/275005746/gse.git',
  'https://github.com/275005746/gse.git',
  'https://github.com/275005746/gse',
])
const binPath = process.platform === 'win32'
  ? path.join(consumerRoot, 'node_modules', '.bin', 'gse.cmd')
  : path.join(consumerRoot, 'node_modules', '.bin', 'gse')
const binRun = exists(binPath)
  ? process.platform === 'win32'
    ? run('cmd', ['/c', binPath, 'status', '--target', installedRoot, '--json'], consumerRoot)
    : run(binPath, ['status', '--target', installedRoot, '--json'], consumerRoot)
  : { command: binPath + ' status --target ' + installedRoot + ' --json', cwd: consumerRoot, status: 1, stdout: '', stderr: 'bin missing' }
const binData = parseJson(binRun.stdout)
const readmeAudit = exists(path.join(installedRoot, 'scripts', 'audit-readme-docs.mjs'))
  ? run(process.execPath, [path.join(installedRoot, 'scripts', 'audit-readme-docs.mjs'), '--root', installedRoot, '--json'], consumerRoot)
  : { command: 'installed README audit skipped; script missing', cwd: consumerRoot, status: 1, stdout: '', stderr: 'script missing' }
const readmeData = parseJson(readmeAudit.stdout)
const tarballFiles = new Set((packItem?.files ?? []).map((item) => item.path))
const requiredTarballFiles = [
  'package.json',
  'SKILL.md',
  'README.md',
  'README.zh-CN.md',
  'LICENSE',
  'scripts/gse.mjs',
  'scripts/audit-readme-docs.mjs',
  'scripts/validate-gse.mjs',
  'references/commands.md',
  'references/packaging.md',
]

const checks = [
  check('NTI01', 'npm pack creates one tarball', packRun.status === 0 && Boolean(tarballPath) && exists(tarballPath), packRun.command, packRun.stderr),
  check('NTI02', 'tarball file list includes required runtime files', requiredTarballFiles.every((item) => tarballFiles.has(item)), requiredTarballFiles.filter((item) => !tarballFiles.has(item)).join(', ') || 'all required files present'),
  check('NTI03', 'tarball installs into a clean consumer project', installRun.status === 0 && exists(installedRoot), installRun.command, installRun.stderr),
  check('NTI04', 'installed package metadata is intact', installedPkg?.name === '@t275005746/gse' && installedPkg?.bin?.gse === 'scripts/gse.mjs', 'installed package.json'),
  check('NTI05', 'installed package exposes gse bin shim', exists(binPath), binPath),
  check('NTI06', 'installed gse bin runs status command', binRun.status === 0 && binData?.command === '/gse status' && binData?.project?.stateValid === true, binRun.command, binRun.stderr),
  check('NTI07', 'installed README audit passes', readmeAudit.status === 0 && readmeData?.summary?.failed === 0, readmeAudit.command, readmeAudit.stderr),
  check('NTI08', 'installed package metadata points at the public GSE repository without publishConfig overrides', !installedPkg?.publishConfig && expectedRepositoryUrls.has(repositoryUrl), 'repository=' + (repositoryUrl ?? 'missing') + ', publishConfig=' + (installedPkg?.publishConfig ? 'present' : 'absent')),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  tempRoot,
  consumerRoot,
  tarballPath,
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    npmTarballPack: packRun.status === 0 ? 'verified' : 'failed',
    npmTarballInstall: installRun.status === 0 ? 'verified' : 'failed',
    installedBin: binRun.status === 0 ? 'verified' : 'failed',
  },
  package: installedPkg
    ? {
        name: installedPkg.name,
        version: installedPkg.version,
        bin: installedPkg.bin,
        license: installedPkg.license,
      }
    : null,
  commands: [packRun.command, installRun.command, binRun.command, readmeAudit.command],
  limits: [
    'This audit verifies local npm tarball creation and installation into a clean consumer project.',
    'It does not publish GSE to npm, reserve a package name, prove public repository settings, or prove marketplace approval.',
  ],
  checks,
}

if (!keepTemp) {
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  } catch {
    report.cleanupWarning = 'failed to remove temp root: ' + tempRoot
  }
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE npm Tarball Install Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('Temp root: ' + data.tempRoot)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- npm tarball pack: ' + data.workflows.npmTarballPack)
  lines.push('- npm tarball install: ' + data.workflows.npmTarballInstall)
  lines.push('- installed bin: ' + data.workflows.installedBin)
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

if (failed > 0) process.exit(1)
