#!/usr/bin/env node
import fs from 'node:fs'
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

function readJson(relativePath) {
  const fullPath = path.join(root, relativePath)
  if (!fs.existsSync(fullPath)) return null
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
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

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const pkg = readJson('package.json')
const packRun = process.platform === 'win32'
  ? run('cmd', ['/c', 'npm', 'pack', '--dry-run', '--json'])
  : run('npm', ['pack', '--dry-run', '--json'])
const packData = parseJson(packRun.stdout)
const packFiles = new Set((Array.isArray(packData) ? packData[0]?.files : []).map((item) => item.path))
const packageFiles = new Set(pkg?.files ?? [])
const repositoryUrl = typeof pkg?.repository === 'string' ? pkg.repository : pkg?.repository?.url
const expectedRepositoryUrls = new Set([
  'git+https://github.com/275005746/gse.git',
  'https://github.com/275005746/gse.git',
  'https://github.com/275005746/gse',
])
const requiredPackageFiles = [
  'SKILL.md',
  'README.md',
  'README.zh-CN.md',
  'LICENSE',
  'package.json',
  'scripts/gse.mjs',
  'scripts/audit-npm-tarball-install.mjs',
  'scripts/validate-gse.mjs',
  'scripts/run-gse-command.mjs',
  'references/commands.md',
  'references/packaging.md',
]
const requiredFilesWhitelist = [
  'SKILL.md',
  'README.md',
  'README.zh-CN.md',
  'LICENSE',
  'scripts',
  'references',
]

const checks = [
  check('NPM01', 'package.json exists and parses', Boolean(pkg), 'package.json'),
  check('NPM02', 'package uses the accepted MIT license', pkg?.license === 'MIT' && exists('LICENSE'), 'license=' + (pkg?.license ?? 'missing')),
  check('NPM03', 'package declares ESM and Node runtime floor', pkg?.type === 'module' && /^>=18\b/.test(pkg?.engines?.node ?? ''), 'type=' + (pkg?.type ?? 'missing') + ', node=' + (pkg?.engines?.node ?? 'missing')),
  check('NPM04', 'package exposes gse CLI bin entrypoint', pkg?.bin?.gse === 'scripts/gse.mjs' && exists('scripts/gse.mjs'), 'bin.gse=' + (pkg?.bin?.gse ?? 'missing')),
  check('NPM05', 'package exposes validation and npm audit scripts', pkg?.scripts?.validate?.includes('validate-gse.mjs') && pkg?.scripts?.['audit:npm']?.includes('audit-npm-package-metadata.mjs') && pkg?.scripts?.['audit:npm-install']?.includes('audit-npm-tarball-install.mjs'), 'scripts.validate, scripts.audit:npm, and scripts.audit:npm-install'),
  check('NPM06', 'files whitelist includes core skill content', requiredFilesWhitelist.every((item) => packageFiles.has(item)), requiredFilesWhitelist.join(', ')),
  check('NPM07', 'npm pack dry-run succeeds', packRun.status === 0 && Array.isArray(packData) && packData.length === 1, packRun.command, packRun.stderr),
  check('NPM08', 'npm pack dry-run includes required runtime files', requiredPackageFiles.every((item) => packFiles.has(item)), requiredPackageFiles.filter((item) => !packFiles.has(item)).join(', ') || 'all required files present'),
  check('NPM09', 'npm package metadata points at the public GSE repository without publishConfig overrides', !pkg?.publishConfig && expectedRepositoryUrls.has(repositoryUrl), 'repository=' + (repositoryUrl ?? 'missing') + ', publishConfig=' + (pkg?.publishConfig ? 'present' : 'absent')),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    npmPackageMetadata: failed === 0 ? 'verified' : 'failed',
    npmPackDryRun: packRun.status === 0 ? 'verified' : 'failed',
  },
  package: pkg
    ? {
        name: pkg.name,
        version: pkg.version,
        bin: pkg.bin,
        license: pkg.license,
        files: pkg.files?.length ?? 0,
      }
    : null,
  commands: [packRun.command],
  limits: [
    'This audit verifies Node package metadata and npm pack dry-run only.',
    'It does not publish GSE to npm, prove package name ownership, prove public repository settings, or prove marketplace approval.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE npm Package Metadata Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- npm package metadata: ' + data.workflows.npmPackageMetadata)
  lines.push('- npm pack dry-run: ' + data.workflows.npmPackDryRun)
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
