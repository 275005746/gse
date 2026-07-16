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

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
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

function createReleaseFixture() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-public-release-decision-'))
  fs.mkdirSync(path.join(fixture, '.gse', 'releases'), { recursive: true })
  fs.writeFileSync(path.join(fixture, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n\n- Fixture release decision.\n', 'utf8')
  fs.writeFileSync(path.join(fixture, 'LICENSE'), 'Fixture license text for audit only.\n', 'utf8')
  return fixture
}

const recordScript = path.join(root, 'scripts', 'record-public-release.mjs')
const publicRelease = read('references/public-release.md')
const validate = read('scripts/validate-gse.mjs')
const completion = read('scripts/audit-completion-readiness.mjs')
const roadmap = read('scripts/audit-roadmap-consistency.mjs')

let fixture = null
let ownerRequired = null
let selectedOk = null
let selectedMissing = null
let notPublicOk = null
let notPublicMissing = null

if (fs.existsSync(recordScript)) {
  fixture = createReleaseFixture()
  ownerRequired = run(process.execPath, [
    recordScript,
    '--root',
    fixture,
    '--license-status',
    'owner-required',
    '--dry-run',
    '--json',
  ])
  selectedOk = run(process.execPath, [
    recordScript,
    '--root',
    fixture,
    '--license-status',
    'selected',
    '--spdx',
    'MIT',
    '--license-file',
    'LICENSE',
    '--approved-by',
    'fixture-owner',
    '--decision-date',
    '2026-07-06',
    '--evidence-status',
    'accepted',
    '--dry-run',
    '--json',
  ])
  selectedMissing = run(process.execPath, [
    recordScript,
    '--root',
    fixture,
    '--license-status',
    'selected',
    '--dry-run',
    '--json',
  ])
  notPublicOk = run(process.execPath, [
    recordScript,
    '--root',
    fixture,
    '--license-status',
    'not-public',
    '--approved-by',
    'fixture-owner',
    '--decision-date',
    '2026-07-06',
    '--dry-run',
    '--json',
  ])
  notPublicMissing = run(process.execPath, [
    recordScript,
    '--root',
    fixture,
    '--license-status',
    'not-public',
    '--dry-run',
    '--json',
  ])
}

const ownerRequiredData = ownerRequired ? parseJson(ownerRequired.stdout) : null
const selectedOkData = selectedOk ? parseJson(selectedOk.stdout) : null
const selectedMissingData = selectedMissing ? parseJson(selectedMissing.stdout) : null
const notPublicOkData = notPublicOk ? parseJson(notPublicOk.stdout) : null
const notPublicMissingData = notPublicMissing ? parseJson(notPublicMissing.stdout) : null

const checks = [
  check('PD01', 'public release decision command exists', exists('scripts/record-public-release.mjs'), 'scripts/record-public-release.mjs'),
  check('PD02', 'owner-required decision path remains writable without approval fields', ownerRequired?.status === 0 && ownerRequiredData?.status === 'ready' && ownerRequiredData?.licenseStatus === 'owner-required' && ownerRequiredData?.evidenceStatus === 'result', 'record-public-release --license-status owner-required --dry-run'),
  check('PD03', 'selected-license decision path accepts complete owner evidence', selectedOk?.status === 0 && selectedOkData?.status === 'ready' && selectedOkData?.licenseStatus === 'selected' && selectedOkData?.evidenceStatus === 'accepted', 'record-public-release --license-status selected fixture dry-run'),
  check('PD04', 'selected-license decision path rejects missing owner evidence', selectedMissing?.status !== 0 && selectedMissingData?.status === 'failed' && selectedMissingData?.errors?.some((item) => item.includes('--spdx')) && selectedMissingData?.errors?.some((item) => item.includes('--approved-by')), 'record-public-release selected missing-fields dry-run'),
  check('PD05', 'not-public decision path accepts explicit owner decision', notPublicOk?.status === 0 && notPublicOkData?.status === 'ready' && notPublicOkData?.licenseStatus === 'not-public', 'record-public-release --license-status not-public fixture dry-run'),
  check('PD06', 'not-public decision path rejects missing owner decision', notPublicMissing?.status !== 0 && notPublicMissingData?.status === 'failed' && notPublicMissingData?.errors?.some((item) => item.includes('--approved-by')) && notPublicMissingData?.errors?.some((item) => item.includes('--decision-date')), 'record-public-release not-public missing-fields dry-run'),
  check('PD07', 'public release docs describe all decision states', publicRelease.includes('owner-required | selected | not-public') && publicRelease.includes('For `--license-status selected`') && publicRelease.includes('not-public'), 'references/public-release.md'),
  check('PD08', 'validator and completion audits include public decision lifecycle', validate.includes('audit-public-release-decision.mjs') && completion.includes('audit-public-release-decision.mjs') && roadmap.includes('audit-public-release-decision.mjs'), 'validate, completion, roadmap audits'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  fixtureRoot: fixture,
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    publicReleaseDecisionLifecycle: failed === 0 ? 'verified' : 'failed',
  },
  limits: [
    'This audit verifies decision-path mechanics for owner-required, selected-license, and not-public records.',
    'The selected-license path is tested with a temporary fixture license; it does not select a license for GSE.',
    'Accepted public release for GSE still requires an owner-approved real license file or explicit not-public decision record.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Public Release Decision Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Public release decision lifecycle: ' + data.workflows.publicReleaseDecisionLifecycle)
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
