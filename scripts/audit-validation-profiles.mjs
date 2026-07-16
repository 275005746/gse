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

function read(relativePath) {
  const fullPath = path.join(root, relativePath)
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function run(commandArgs) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'run-validation-profile.mjs'), ...commandArgs], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  let parsed = null
  try {
    parsed = JSON.parse((result.stdout ?? '').trim())
  } catch {
    parsed = null
  }
  return {
    command: [process.execPath, path.join(root, 'scripts', 'run-validation-profile.mjs'), ...commandArgs].join(' '),
    status: result.status ?? 1,
    parsed,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const runnerSource = read('scripts/run-validation-profile.mjs')
const validateSource = read('scripts/validate-gse.mjs')
const packageJson = read('package.json')
const ciWorkflow = read('.github/workflows/validate-gse.yml')
const skill = read('SKILL.md')
const commands = read('references/commands.md')
const qualityGates = read('references/quality-gates.md')
const lite = run(['--root', root, '--target', root, '--profile', 'lite', '--json'])
const standard = run(['--root', root, '--target', root, '--profile', 'standard', '--json'])
const liteScripts = new Set((lite.parsed?.results ?? []).map((item) => item.script))
const standardScripts = new Set((standard.parsed?.results ?? []).map((item) => item.script))
const releaseProfileScripts = [
  'audit-command-execution.mjs',
  'audit-npm-package-metadata.mjs',
  'audit-npm-tarball-install.mjs',
  'audit-signing.mjs',
  'audit-release-bundle.mjs',
  'audit-distribution.mjs',
  'audit-remote-distribution.mjs',
  'audit-public-acceptance-readiness.mjs',
  'audit-final-readiness.mjs',
  'audit-final-acceptance-packet.mjs',
  'audit-owner-external-gate-kit.mjs',
]

const checks = [
  check('VP01', 'validation profile runner exists', fs.existsSync(path.join(root, 'scripts', 'run-validation-profile.mjs')), 'scripts/run-validation-profile.mjs'),
  check('VP02', 'runner defines lite, standard, enterprise, and release profiles', ['lite', 'standard', 'enterprise', 'release'].every((item) => runnerSource.includes(`'${item}'`)), 'profile names'),
  check('VP03', 'lite profile avoids release/distribution heavy gates', lite.status === 0 && lite.parsed?.summary?.status === 'passed' && !liteScripts.has('audit-distribution.mjs') && !liteScripts.has('audit-release-bundle.mjs'), 'lite profile output'),
  check('VP04', 'standard profile passes without forcing close gate during in-progress work', standard.status === 0 && standard.parsed?.summary?.status === 'passed' && !standardScripts.has('audit-close-gate.mjs') && !standardScripts.has('audit-distribution.mjs'), 'standard profile output'),
  check('VP05', 'quality gates document full validation as enterprise/release-grade work', qualityGates.includes('Full validation belongs here, not on every small product slice') && qualityGates.includes('Use the lightest gate profile'), 'references/quality-gates.md'),
  check('VP06', 'skill exposes validation profile runner', skill.includes('run-validation-profile.mjs'), 'SKILL.md'),
  check('VP07', 'command docs expose profile-based verify', commands.includes('/gse verify --profile lite') && commands.includes('run-validation-profile.mjs'), 'references/commands.md'),
  check('VP08', 'release profile includes install, signing, bundle, final readiness, and owner handoff gates', releaseProfileScripts.every((item) => runnerSource.includes(item)) && runnerSource.includes("--profile', 'full'"), releaseProfileScripts.join(', ')),
  check('VP09', 'validate-gse supports profile delegation while preserving full default', validateSource.includes("readArg('--profile', 'full')") && validateSource.includes("delegatedTo: 'scripts/run-validation-profile.mjs'") && validateSource.includes("Use --profile full, or omit --profile"), 'scripts/validate-gse.mjs --profile'),
  check('VP10', 'profile runner reports duration and slowest checks', runnerSource.includes('durationMs') && runnerSource.includes('slowestChecks') && runnerSource.includes('--max-command-ms'), 'run-validation-profile performance telemetry'),
  check('VP11', 'package exposes daily and release validation scripts', packageJson.includes('"validate:lite"') && packageJson.includes('"validate:release"'), 'package.json scripts'),
  check('VP12', 'CI uses lite validation profile instead of full consolidated validator', ciWorkflow.includes('node scripts/validate-gse.mjs --root . --profile lite --json'), '.github/workflows/validate-gse.yml'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    validationProfiles: failed === 0 ? 'verified' : 'failed',
    liteChecks: lite.parsed?.summary ?? null,
    standardChecks: standard.parsed?.summary ?? null,
  },
  limits: [
    'This audit verifies validation profile routing and fast profile behavior.',
    'It does not run the release profile because that profile is intentionally heavy and should be selected only for release/install claims.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Validation Profiles Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Validation profiles: ' + data.workflows.validationProfiles)
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
