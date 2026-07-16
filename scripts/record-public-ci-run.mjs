#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { rejectPlaceholderEvidence } from './lib/evidence-placeholders.mjs'

const args = process.argv.slice(2)

function readArg(name, fallback = '') {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

function hasArg(name) {
  return args.includes(name)
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const runStatus = readArg('--run-status', 'pending')
const runConclusion = readArg('--run-conclusion', 'pending')
const repositoryUrl = readArg('--repository-url', '')
const workflowName = readArg('--workflow-name', 'Validate GSE')
const workflowFile = readArg('--workflow-file', '.github/workflows/validate-gse.yml')
const runUrl = readArg('--run-url', '')
const commitSha = readArg('--commit-sha', '')
const branch = readArg('--branch', '')
const requiredChecks = readArg('--required-checks', '')
const evidenceOwner = readArg('--evidence-owner', '')
const evidenceDate = readArg('--evidence-date', '')
const evidenceUrl = readArg('--evidence-url', '')
const verificationCommand = readArg('--verification-command', 'node scripts/validate-gse.mjs --root . --json')
const verificationResult = readArg('--verification-result', 'pending')
const evidenceStatus = readArg('--evidence-status', runStatus === 'accepted' ? 'accepted' : 'pending')
const acceptedBy = readArg('--accepted-by', '')
const acceptedAt = readArg('--accepted-at', '')
const provesPublicCiRun = readArg('--proves-public-ci-run', 'unknown')
const provesRequiredChecks = readArg('--proves-required-checks', 'unknown')
const provesReleaseCommit = readArg('--proves-release-commit', 'unknown')
const residualRisk = readArg('--residual-risk', 'Public CI run is not accepted until real external run evidence is attached.')
const nextAction = readArg('--next-action', 'Attach public CI run evidence and re-run final readiness.')
const out = path.resolve(readArg('--out', path.join(root, '.gse', 'releases', 'public-ci-run-pending.md')))
const dryRun = hasArg('--dry-run')
const force = hasArg('--force')
const jsonOnly = hasArg('--json')

const validStatuses = new Set(['pending', 'accepted'])
const validConclusions = new Set(['pending', 'success', 'failure', 'cancelled', 'skipped', 'timed_out', 'unknown'])
const validTriState = new Set(['true', 'false', 'unknown'])
const errors = []

function requireField(value, message) {
  if (!String(value).trim()) errors.push(message)
}

if (!validStatuses.has(runStatus)) errors.push('--run-status must be pending or accepted')
if (!validStatuses.has(evidenceStatus)) errors.push('--evidence-status must be pending or accepted')
if (!validConclusions.has(runConclusion)) errors.push('--run-conclusion must be pending, success, failure, cancelled, skipped, timed_out, or unknown')
for (const [value, name] of [
  [provesPublicCiRun, '--proves-public-ci-run'],
  [provesRequiredChecks, '--proves-required-checks'],
  [provesReleaseCommit, '--proves-release-commit'],
]) {
  if (!validTriState.has(value)) errors.push(`${name} must be true, false, or unknown`)
}

if (runStatus === 'accepted') {
  requireField(repositoryUrl, 'accepted CI run requires --repository-url')
  requireField(workflowName, 'accepted CI run requires --workflow-name')
  requireField(workflowFile, 'accepted CI run requires --workflow-file')
  requireField(runUrl, 'accepted CI run requires --run-url')
  requireField(commitSha, 'accepted CI run requires --commit-sha')
  requireField(branch, 'accepted CI run requires --branch')
  requireField(requiredChecks, 'accepted CI run requires --required-checks')
  requireField(evidenceOwner, 'accepted CI run requires --evidence-owner')
  requireField(evidenceDate, 'accepted CI run requires --evidence-date')
  requireField(evidenceUrl, 'accepted CI run requires --evidence-url')
  requireField(acceptedBy, 'accepted CI run requires --accepted-by')
  requireField(acceptedAt, 'accepted CI run requires --accepted-at')
  if (runConclusion !== 'success') errors.push('accepted CI run requires --run-conclusion success')
  if (evidenceStatus !== 'accepted') errors.push('accepted CI run requires --evidence-status accepted')
  if (provesPublicCiRun !== 'true') errors.push('accepted CI run requires --proves-public-ci-run true')
  if (provesRequiredChecks !== 'true') errors.push('accepted CI run requires --proves-required-checks true')
  if (!dryRun) {
    rejectPlaceholderEvidence(errors, repositoryUrl, '--repository-url')
    rejectPlaceholderEvidence(errors, runUrl, '--run-url')
    rejectPlaceholderEvidence(errors, evidenceOwner, '--evidence-owner')
    rejectPlaceholderEvidence(errors, evidenceUrl, '--evidence-url')
    rejectPlaceholderEvidence(errors, acceptedBy, '--accepted-by')
  }
}

const lines = [
  '# Public CI Run Record',
  '',
  'Repository URL: ' + repositoryUrl,
  '',
  'Workflow name: ' + workflowName,
  '',
  'Workflow file: ' + workflowFile,
  '',
  'Run URL: ' + runUrl,
  '',
  'Run status: ' + runStatus,
  '',
  'Run conclusion: ' + runConclusion,
  '',
  'Commit SHA: ' + commitSha,
  '',
  'Branch: ' + branch,
  '',
  'Required checks: ' + requiredChecks,
  '',
  'Evidence owner: ' + evidenceOwner,
  '',
  'Evidence date: ' + evidenceDate,
  '',
  'Evidence URL or run id: ' + evidenceUrl,
  '',
  '## Verification',
  '',
  'Verification command: ' + verificationCommand,
  '',
  'Verification result: ' + verificationResult,
  '',
  '## Acceptance',
  '',
  'Evidence status: ' + evidenceStatus,
  '',
  'Accepted by: ' + acceptedBy,
  '',
  'Accepted at: ' + acceptedAt,
  '',
  '## Boundaries',
  '',
  '- Does this prove a public CI run? ' + provesPublicCiRun,
  '- Does this prove required checks passed? ' + provesRequiredChecks,
  '- Does this prove the current release commit? ' + provesReleaseCommit,
  '',
  '## Residual Risk',
  '',
  '- ' + residualRisk,
  '',
  '## Next Action',
  '',
  '- ' + nextAction,
  '',
]

const report = {
  root,
  out,
  dryRun,
  runStatus,
  runConclusion,
  evidenceStatus,
  status: errors.length ? 'failed' : dryRun ? 'ready' : 'written',
  errors,
}

if (!errors.length && !dryRun) {
  if (fs.existsSync(out) && !force) {
    report.status = 'exists'
    report.errors.push('output exists; use --force or choose another --out path')
  } else {
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, lines.join('\n'), 'utf8')
  }
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else {
  console.log('Public CI run record status: ' + report.status)
  console.log('Output: ' + report.out)
  if (report.errors.length) {
    console.log('Errors:')
    for (const error of report.errors) console.log('- ' + error)
  }
}

if (report.status === 'failed' || report.status === 'exists') process.exit(1)
