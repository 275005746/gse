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
const profile = readArg('--profile', 'full')
if (!['smoke', 'full'].includes(profile)) {
  console.error('Unsupported --profile. Expected smoke or full.')
  process.exit(1)
}
const smokeProfile = profile === 'smoke'

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

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function skipped(id, label, evidence, risk = '') {
  return { id, label, status: 'skipped', evidence, risk }
}

function runInstalledPackageValidation(target) {
  const validationCommands = [
    ['audit-gse.mjs', ['--root', target, '--json']],
    ['audit-project.mjs', ['--root', target, '--json']],
    ['audit-fixtures.mjs', ['--root', target, '--json']],
    ['audit-commands.mjs', ['--root', target, '--json']],
    ['audit-command-execution.mjs', ['--root', target, '--profile', 'lite', '--json']],
    ['audit-readme-docs.mjs', ['--root', target, '--json']],
    ['audit-marketplace-discovery.mjs', ['--root', target, '--json']],
    ['generate-session-prompt.mjs', ['--root', target, '--json']],
  ]
  const results = validationCommands.map(([script, commandArgs]) => {
    const result = run(process.execPath, [path.join(target, 'scripts', script), ...commandArgs], target)
    const parsed = parseJson(result.stdout)
    const failed = parsed?.summary?.failed
    const ok = result.status === 0 || failed === 0
    return {
      script,
      command: result.command,
      status: result.status,
      ok,
      summary: parsed?.summary ?? null,
      stderr: result.stderr,
    }
  })
  const passed = results.filter((item) => item.ok).length
  const failed = results.length - passed
  return {
    command: 'installed package validation: ' + validationCommands.map(([script]) => script).join(', '),
    status: failed === 0 ? 0 : 1,
    stdout: JSON.stringify({
      summary: {
        status: failed === 0 ? 'passed' : 'failed',
        passed,
        failed,
        total: results.length,
      },
      results,
      limits: [
        'Installed-package validation checks portable skill structure, bootstrap fixtures, command semantics, lite command execution, README docs, marketplace metadata, and session prompt generation.',
        'It intentionally excludes source-workspace-only roadmap, long evidence logs, repository governance files, release-bundle cache, and owner/external acceptance artifacts.',
      ],
    }),
    stderr: results.filter((item) => !item.ok).map((item) => item.script + ': ' + item.stderr).filter(Boolean).join('\n'),
  }
}

const scanExtensions = new Set(['.md', '.json', '.mjs', '.yaml', '.yml', '.txt'])
const forbiddenContentPatterns = [
  { id: 'winUserHome', pattern: new RegExp(['C:', 'Users', 'Admin'].join('[\\\\\\\\/]'), 'i') },
  { id: 'posixUserHome', pattern: new RegExp(['C:', 'Users', 'Admin'].join('/'), 'i') },
  { id: 'workspaceRoot', pattern: new RegExp(['D:', 'codex'].join('[\\\\\\\\/]'), 'i') },
  { id: 'aionWorkspace', pattern: new RegExp(['hermes', 'workspace'].join('[-_]'), 'i') },
  { id: 'museflowWorkspace', pattern: new RegExp(['node', 'banana'].join('[-_]'), 'i') },
]

function scanPackageLeaks(scanRoot) {
  const findings = []

  function visit(itemPath) {
    if (!fs.existsSync(itemPath)) return
    const stat = fs.statSync(itemPath)
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(itemPath)) visit(path.join(itemPath, child))
      return
    }
    if (!stat.isFile()) return
    const ext = path.extname(itemPath)
    if (!scanExtensions.has(ext) && path.basename(itemPath) !== 'SKILL.md') return
    const content = fs.readFileSync(itemPath, 'utf8')
    for (const item of forbiddenContentPatterns) {
      if (item.pattern.test(content)) {
        findings.push({
          file: path.relative(scanRoot, itemPath).replace(/\\/g, '/'),
          pattern: item.id,
        })
      }
    }
  }

  visit(scanRoot)
  return findings
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-distribution-'))
const packageOut = path.join(tempRoot, 'package')
const installTarget = path.join(tempRoot, 'installed-gse')

const packageRun = run(process.execPath, [
  path.join(root, 'scripts', 'package-gse.mjs'),
  '--root',
  root,
  '--out',
  packageOut,
  '--label',
  'gse-audit',
  '--json',
])
const packageData = parseJson(packageRun.stdout)
const installRun = run(process.execPath, [
  path.join(root, 'scripts', 'install-gse.mjs'),
  '--source',
  packageOut,
  '--target',
  installTarget,
  '--json',
])
const installData = parseJson(installRun.stdout)
const installedValidate = smokeProfile
  ? { status: 0, command: 'skipped by --profile smoke', stdout: '', stderr: '' }
  : runInstalledPackageValidation(installTarget)
const installedValidateData = parseJson(installedValidate.stdout)
const installedCli = run(process.execPath, [
  path.join(installTarget, 'scripts', 'gse.mjs'),
  'status',
  '--target',
  installTarget,
  '--json',
], installTarget)
const installedCliData = parseJson(installedCli.stdout)

const manifestPath = path.join(packageOut, 'gse-package-manifest.json')
const manifestData = fs.existsSync(manifestPath) ? parseJson(fs.readFileSync(manifestPath, 'utf8')) : null
const packageLeakFindings = fs.existsSync(packageOut) ? scanPackageLeaks(packageOut) : []
const checks = [
  check('D01', 'package script exists', fs.existsSync(path.join(root, 'scripts', 'package-gse.mjs')), 'scripts/package-gse.mjs'),
  check('D02', 'install script exists', fs.existsSync(path.join(root, 'scripts', 'install-gse.mjs')), 'scripts/install-gse.mjs'),
  check('D03', 'package command succeeds', packageRun.status === 0 && packageData?.status === 'written', packageRun.command),
  check('D04', 'package manifest exists and includes core files', fs.existsSync(manifestPath) && packageData?.fileCount > 20, manifestPath),
  check('D04b', 'package manifest does not expose local source root', manifestData && !Object.hasOwn(manifestData, 'sourceRoot') && !JSON.stringify(manifestData).includes(root), 'gse-package-manifest.json'),
  check('D04c', 'package content does not expose local or pilot project paths', packageLeakFindings.length === 0, packageLeakFindings.length ? JSON.stringify(packageLeakFindings.slice(0, 10)) : 'no findings'),
  check('D05', 'install command succeeds', installRun.status === 0 && installData?.status === 'passed', installRun.command),
  check('D06', 'installed package has skill entrypoint', fs.existsSync(path.join(installTarget, 'SKILL.md')), 'installed SKILL.md'),
  check('D07', 'installed package has validation script', fs.existsSync(path.join(installTarget, 'scripts', 'validate-gse.mjs')), 'installed validate-gse.mjs'),
  smokeProfile
    ? skipped('D08', 'installed package passes install-safe validation', installedValidate.command, 'Run --profile full for installed-copy validation.')
    : check('D08', 'installed package passes install-safe validation', installedValidate.status === 0 && installedValidateData?.summary?.failed === 0, installedValidate.command),
  check('D09', 'package manifest exposes short CLI entrypoint', manifestData?.entrypoints?.cli === 'scripts/gse.mjs' && fs.existsSync(path.join(installTarget, 'scripts', 'gse.mjs')), 'gse-package-manifest.json entrypoints.cli'),
  check('D10', 'installed short CLI wrapper runs status command', installedCli.status === 0 && installedCliData?.command === '/gse status' && installedCliData?.project?.stateValid === true, installedCli.command),
  check('D11', 'package and installed copy include Node package metadata', manifestData?.entrypoints?.nodePackage === 'package.json' && manifestData?.entrypoints?.npmPackageAudit === 'scripts/audit-npm-package-metadata.mjs' && fs.existsSync(path.join(installTarget, 'package.json')), 'package.json and npm package audit entrypoint'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const skippedCount = checks.filter((item) => item.status === 'skipped').length
const failed = checks.filter((item) => item.status === 'failed').length
const report = {
  root,
  generatedAt: new Date().toISOString(),
  tempRoot,
  profile,
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, skipped: skippedCount, total: checks.length },
  workflows: {
    localPackage: packageRun.status === 0 ? 'verified' : 'failed',
    localInstall: installRun.status === 0 ? 'verified' : 'failed',
    installedValidation: smokeProfile ? 'skipped' : installedValidate.status === 0 ? 'verified' : 'failed',
  },
  commands: [packageRun.command, installRun.command, installedValidate.command, installedCli.command],
  limits: [
    'This audit verifies local file-based package, install, and installed-copy validation.',
    'Use --profile smoke for routine package/install/CLI checks; use --profile full before release or when installed-package validation matters.',
    'Installed-package validation intentionally excludes source-workspace-only roadmap, long evidence logs, release-bundle cache, and owner/external acceptance artifacts.',
    'It does not publish to a registry, verify marketplace discovery, sign artifacts, or test remote machine installation.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Distribution Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('Temp root: ' + data.tempRoot)
  lines.push('Profile: ' + data.profile)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + ' passed, ' + data.summary.failed + ' failed, ' + data.summary.skipped + ' skipped, ' + data.summary.total + ' total')
  lines.push('')
  lines.push('## Checks')
  lines.push('')
  for (const item of data.checks) {
    const marker = item.status === 'passed' ? '[x]' : item.status === 'skipped' ? '[-]' : '[ ]'
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
