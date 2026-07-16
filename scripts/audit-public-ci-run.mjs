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

function read(relativePath) {
  const fullPath = path.join(root, relativePath)
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : ''
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function run(command, commandArgs, cwd = root) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    command: [command, ...commandArgs].join(' '),
  }
}

function parseJson(stdout) {
  try {
    return JSON.parse(stdout)
  } catch {
    return null
  }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function createFixture() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-public-ci-run-'))
  fs.mkdirSync(path.join(fixture, '.gse', 'releases'), { recursive: true })
  fs.mkdirSync(path.join(fixture, '.github', 'workflows'), { recursive: true })
  fs.writeFileSync(path.join(fixture, '.github', 'workflows', 'validate-gse.yml'), 'name: Validate GSE\n', 'utf8')
  return fixture
}

const recordScript = path.join(root, 'scripts', 'record-public-ci-run.mjs')
const template = read('assets/templates/public-ci-run-record.md')
const publicRelease = read('references/public-release.md')
const finalReadiness = read('references/final-readiness.md')
const validate = read('scripts/validate-gse.mjs')

const fixture = exists('scripts/record-public-ci-run.mjs') ? createFixture() : null
const pending = fixture ? run(process.execPath, [recordScript, '--root', fixture, '--run-status', 'pending', '--dry-run', '--json']) : null
const acceptedOk = fixture ? run(process.execPath, [
  recordScript,
  '--root', fixture,
  '--run-status', 'accepted',
  '--run-conclusion', 'success',
  '--repository-url', 'https://github.com/example/gse',
  '--workflow-name', 'Validate GSE',
  '--workflow-file', '.github/workflows/validate-gse.yml',
  '--run-url', 'https://github.com/example/gse/actions/runs/123',
  '--commit-sha', '0123456789abcdef0123456789abcdef01234567',
  '--branch', 'main',
  '--required-checks', 'Validate GSE',
  '--evidence-owner', 'fixture-owner',
  '--evidence-date', '2026-07-06',
  '--evidence-url', 'https://github.com/example/gse/actions/runs/123',
  '--evidence-status', 'accepted',
  '--accepted-by', 'fixture-owner',
  '--accepted-at', '2026-07-06',
  '--proves-public-ci-run', 'true',
  '--proves-required-checks', 'true',
  '--proves-release-commit', 'true',
  '--dry-run',
  '--json',
]) : null
const acceptedMissing = fixture ? run(process.execPath, [recordScript, '--root', fixture, '--run-status', 'accepted', '--run-conclusion', 'failure', '--evidence-status', 'pending', '--dry-run', '--json']) : null
const acceptedPlaceholderWrite = fixture ? run(process.execPath, [
  recordScript,
  '--root', fixture,
  '--run-status', 'accepted',
  '--run-conclusion', 'success',
  '--repository-url', 'https://github.com/example/gse',
  '--workflow-name', 'Validate GSE',
  '--workflow-file', '.github/workflows/validate-gse.yml',
  '--run-url', 'https://github.com/example/gse/actions/runs/123',
  '--commit-sha', '0123456789abcdef0123456789abcdef01234567',
  '--branch', 'main',
  '--required-checks', 'Validate GSE',
  '--evidence-owner', 'fixture-owner',
  '--evidence-date', '2026-07-06',
  '--evidence-url', 'https://github.com/example/gse/actions/runs/123',
  '--evidence-status', 'accepted',
  '--accepted-by', 'fixture-owner',
  '--accepted-at', '2026-07-06',
  '--proves-public-ci-run', 'true',
  '--proves-required-checks', 'true',
  '--proves-release-commit', 'true',
  '--json',
]) : null

const pendingData = pending ? parseJson(pending.stdout) : null
const acceptedOkData = acceptedOk ? parseJson(acceptedOk.stdout) : null
const acceptedMissingData = acceptedMissing ? parseJson(acceptedMissing.stdout) : null
const acceptedPlaceholderWriteData = acceptedPlaceholderWrite ? parseJson(acceptedPlaceholderWrite.stdout) : null

const checks = [
  check('PCR01', 'public CI run record command exists', exists('scripts/record-public-ci-run.mjs'), 'scripts/record-public-ci-run.mjs'),
  check('PCR02', 'public CI run template exists', exists('assets/templates/public-ci-run-record.md') && template.includes('Run URL') && template.includes('Does this prove a public CI run?'), 'assets/templates/public-ci-run-record.md'),
  check('PCR03', 'pending CI run path remains writable without external proof', pending?.status === 0 && pendingData?.status === 'ready' && pendingData?.runStatus === 'pending' && pendingData?.evidenceStatus === 'pending', 'record-public-ci-run pending dry-run'),
  check('PCR04', 'accepted CI run path accepts complete public run evidence', acceptedOk?.status === 0 && acceptedOkData?.status === 'ready' && acceptedOkData?.runStatus === 'accepted' && acceptedOkData?.runConclusion === 'success' && acceptedOkData?.evidenceStatus === 'accepted', 'record-public-ci-run accepted dry-run'),
  check('PCR05', 'accepted CI run rejects missing external evidence or failed conclusion', acceptedMissing?.status !== 0 && acceptedMissingData?.status === 'failed' && acceptedMissingData?.errors?.some((item) => item.includes('--run-url')) && acceptedMissingData?.errors?.some((item) => item.includes('--run-conclusion success')) && acceptedMissingData?.errors?.some((item) => item.includes('--evidence-status accepted')), 'record-public-ci-run accepted missing-fields dry-run'),
  check('PCR06', 'accepted CI run real write rejects placeholder or example evidence', acceptedPlaceholderWrite?.status !== 0 && acceptedPlaceholderWriteData?.status === 'failed' && acceptedPlaceholderWriteData?.errors?.some((item) => item.includes('not a placeholder')), 'record-public-ci-run accepted placeholder write'),
  check('PCR07', 'public release docs reference public CI run evidence', publicRelease.includes('Public CI run') && publicRelease.includes('record-public-ci-run.mjs'), 'references/public-release.md'),
  check('PCR08', 'final readiness matrix includes public CI run record and external CI run gate', finalReadiness.includes('Public CI run record') && finalReadiness.includes('Public CI run'), 'references/final-readiness.md'),
  check('PCR09', 'consolidated validator includes public CI run audit', validate.includes('audit-public-ci-run.mjs'), 'scripts/validate-gse.mjs'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  fixtureRoot: fixture,
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    publicCiRunRecord: failed === 0 ? 'verified' : 'failed',
    acceptedPublicCiRun: acceptedOkData?.status === 'ready' ? 'fixture-verified' : 'not-verified',
  },
  limits: [
    'This audit verifies record mechanics and guardrails for public CI run evidence.',
    'It does not run GitHub Actions, configure required checks, or prove a real public CI run.',
    'Accepted public CI still requires real external evidence from the public repository.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Public CI Run Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Public CI run record: ' + data.workflows.publicCiRunRecord)
  lines.push('- Accepted public CI run path: ' + data.workflows.acceptedPublicCiRun)
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
