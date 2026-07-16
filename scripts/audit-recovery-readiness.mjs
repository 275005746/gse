#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

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

const recovery = read('references/recovery.md')
const release = read('references/release.md')
const incident = read('assets/templates/incident-review.md')
const quality = read('references/quality-gates.md')

const recoveryClasses = ['recoverable failure', 'blocked work', 'rollback required', 'handoff required', 'incident recovery']
const failedVerificationSteps = ['Preserve the failed command', 'Decide whether the failure invalidates the result', 'Fix the smallest reusable artifact', 'Re-run the same focused verification', 'mark readiness `not ready` or `result`']
const releaseRecoveryFields = ['Release scope:', 'Failed gate:', 'Release level:', 'Readiness after failure:', 'Rollback or resume decision:', 'Verification to rerun:', 'Next action:']
const continuationFields = ['Goal or spec:', 'Active slice:', 'Current evidence status:', 'Changed files:', 'Failed or unavailable tools:', 'Next verification command:', 'Next action:']
const incidentFields = ['Incident title:', 'Evidence status:', 'Affected users/systems:', 'Data/security/privacy impact:', 'Verification that stabilization worked:', 'Action Items', 'Follow-Up Evidence']

const checks = [
  check('RC01', 'recovery reference exists', exists('references/recovery.md'), 'references/recovery.md'),
  check('RC02', 'failure classes cover core recovery cases', recoveryClasses.every((item) => recovery.includes(item)), recoveryClasses.join(', ')),
  check('RC03', 'failed verification path prevents lowering acceptance', recovery.includes('do not reduce the acceptance bar') && failedVerificationSteps.every((item) => recovery.includes(item)), 'Failed Verification Path'),
  check('RC04', 'release recovery record has required fields', releaseRecoveryFields.every((item) => recovery.includes(item)), releaseRecoveryFields.join(', ')),
  check('RC05', 'release recovery routes through release gates', recovery.includes('references/release.md') && release.includes('Use references/recovery.md') && quality.includes('Use `references/recovery.md`'), 'release, recovery, and quality integration'),
  check('RC06', 'rollback rules protect user and unrelated work', recovery.includes('Do not revert user work or unrelated dirty files') && recovery.includes('references/file-ownership.md'), 'rollback ownership rules'),
  check('RC07', 'incident template includes commercial follow-up fields', incidentFields.every((item) => incident.includes(item)), incidentFields.join(', ')),
  check('RC08', 'incident follow-up distinguishes signal, stabilization, prevention, and evidence', incident.includes('Detection gap') && incident.includes('Stabilization') && incident.includes('What Prevents Recurrence') && incident.includes('Remaining risk'), 'incident-review.md sections'),
  check('RC09', 'future-agent continuation packet is defined', continuationFields.every((item) => recovery.includes(item)), continuationFields.join(', ')),
  check('RC10', 'fresh-session acceptance is not faked during handoff', recovery.includes('accepted by: fresh-session') && recovery.includes('only after a separate session actually follows the packet'), 'future-agent continuation rule'),
  check('RC11', 'recovery evidence status routes through taxonomy', recovery.includes('references/evidence-taxonomy.md') && recovery.includes('result, verified, accepted, blocked, rollback required, or not ready'), 'handoff evidence status'),
  check('RC12', 'incident review is scoped, not mandatory for every failure', recovery.includes('Do not turn every failed command into an incident'), 'incident scope rule'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { recoveryReadiness: failed === 0 ? 'verified' : 'failed' },
  limits: [
    'Recovery readiness audit verifies reusable recovery and incident workflow coverage; it does not exercise a live incident or release rollback.',
    'Production readiness still depends on project-specific monitors, release tooling, ownership, and environment evidence.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Recovery Readiness Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Recovery readiness: ' + data.workflows.recoveryReadiness)
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
