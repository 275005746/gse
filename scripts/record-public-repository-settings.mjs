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
const repositoryUrl = readArg('--repository-url', 'owner-required')
const defaultBranch = readArg('--default-branch', 'main')
const visibility = readArg('--visibility', 'unknown')
const settingsStatus = readArg('--settings-status', 'pending')
const evidenceOwner = readArg('--evidence-owner', '')
const evidenceDate = readArg('--evidence-date', '')
const evidenceUrl = readArg('--evidence-url', '')
const issuesEnabled = readArg('--issues-enabled', 'unknown')
const pullRequestsEnabled = readArg('--pull-requests-enabled', 'unknown')
const discussionsEnabled = readArg('--discussions-enabled', 'unknown')
const securityPolicyVisible = readArg('--security-policy-visible', 'unknown')
const branchProtectionEnabled = readArg('--branch-protection-enabled', 'unknown')
const requiredStatusChecksEnabled = readArg('--required-status-checks-enabled', 'unknown')
const requiredChecks = readArg('--required-checks', '')
const requireReview = readArg('--require-review-before-merge', 'unknown')
const requireConversationResolution = readArg('--require-conversation-resolution', 'unknown')
const restrictForcePushes = readArg('--restrict-force-pushes', 'unknown')
const restrictDeletions = readArg('--restrict-deletions', 'unknown')
const verificationCommand = readArg('--verification-command', 'node scripts/validate-gse.mjs --root . --json')
const verificationResult = readArg('--verification-result', 'pending')
const evidenceStatus = readArg('--evidence-status', settingsStatus === 'accepted' ? 'accepted' : settingsStatus === 'verified' ? 'verified' : 'pending')
const acceptedBy = readArg('--accepted-by', '')
const acceptedAt = readArg('--accepted-at', '')
const residualRisk = readArg('--residual-risk', 'Public repository settings are not verified until owner/external evidence is attached.')
const nextAction = readArg('--next-action', 'Attach public repository settings evidence and re-run repository settings audit.')
const out = path.resolve(readArg('--out', path.join(root, '.gse', 'releases', 'public-repository-settings-owner-required.md')))
const dryRun = hasArg('--dry-run')
const force = hasArg('--force')
const jsonOnly = hasArg('--json')

const validStatuses = new Set(['pending', 'verified', 'accepted'])
const validVisibility = new Set(['public', 'private', 'internal', 'unknown'])
const validTriState = new Set(['true', 'false', 'unknown'])
const errors = []

function requireField(value, message) {
  if (!String(value).trim()) errors.push(message)
}

function requireTriState(value, name) {
  if (!validTriState.has(value)) errors.push(`${name} must be true, false, or unknown`)
}

if (!validStatuses.has(settingsStatus)) errors.push('--settings-status must be pending, verified, or accepted')
if (!validStatuses.has(evidenceStatus)) errors.push('--evidence-status must be pending, verified, or accepted')
if (!validVisibility.has(visibility)) errors.push('--visibility must be public, private, internal, or unknown')
for (const [value, name] of [
  [issuesEnabled, '--issues-enabled'],
  [pullRequestsEnabled, '--pull-requests-enabled'],
  [discussionsEnabled, '--discussions-enabled'],
  [securityPolicyVisible, '--security-policy-visible'],
  [branchProtectionEnabled, '--branch-protection-enabled'],
  [requiredStatusChecksEnabled, '--required-status-checks-enabled'],
  [requireReview, '--require-review-before-merge'],
  [requireConversationResolution, '--require-conversation-resolution'],
  [restrictForcePushes, '--restrict-force-pushes'],
  [restrictDeletions, '--restrict-deletions'],
]) {
  requireTriState(value, name)
}

if (settingsStatus === 'verified' || settingsStatus === 'accepted') {
  requireField(repositoryUrl, 'verified or accepted settings require --repository-url')
  requireField(evidenceOwner, 'verified or accepted settings require --evidence-owner')
  requireField(evidenceDate, 'verified or accepted settings require --evidence-date')
  requireField(evidenceUrl, 'verified or accepted settings require --evidence-url')
  if (visibility !== 'public') errors.push('verified or accepted public repository settings require --visibility public')
  for (const [value, name] of [
    [issuesEnabled, '--issues-enabled'],
    [pullRequestsEnabled, '--pull-requests-enabled'],
    [securityPolicyVisible, '--security-policy-visible'],
    [branchProtectionEnabled, '--branch-protection-enabled'],
    [requiredStatusChecksEnabled, '--required-status-checks-enabled'],
    [requireReview, '--require-review-before-merge'],
    [requireConversationResolution, '--require-conversation-resolution'],
    [restrictForcePushes, '--restrict-force-pushes'],
    [restrictDeletions, '--restrict-deletions'],
  ]) {
    if (value !== 'true') errors.push(`verified or accepted settings require ${name} true`)
  }
  requireField(requiredChecks, 'verified or accepted settings require --required-checks')
  if (evidenceStatus === 'pending') errors.push('verified or accepted settings require --evidence-status verified or accepted')
  if (!dryRun) {
    rejectPlaceholderEvidence(errors, repositoryUrl, '--repository-url')
    rejectPlaceholderEvidence(errors, evidenceOwner, '--evidence-owner')
    rejectPlaceholderEvidence(errors, evidenceUrl, '--evidence-url')
  }
}

if (settingsStatus === 'accepted') {
  requireField(acceptedBy, 'accepted settings require --accepted-by')
  requireField(acceptedAt, 'accepted settings require --accepted-at')
  if (evidenceStatus !== 'accepted') errors.push('accepted settings require --evidence-status accepted')
  if (!dryRun) rejectPlaceholderEvidence(errors, acceptedBy, '--accepted-by')
}

const lines = [
  '# Public Repository Settings Record',
  '',
  'Repository URL: ' + repositoryUrl,
  '',
  'Default branch: ' + defaultBranch,
  '',
  'Visibility: ' + visibility,
  '',
  'Settings status: ' + settingsStatus,
  '',
  'Evidence owner: ' + evidenceOwner,
  '',
  'Evidence date: ' + evidenceDate,
  '',
  'Evidence URL or run id: ' + evidenceUrl,
  '',
  '## Required Public Settings',
  '',
  '- Issues enabled: ' + issuesEnabled,
  '- Pull requests enabled: ' + pullRequestsEnabled,
  '- Discussions enabled: ' + discussionsEnabled,
  '- Security policy visible: ' + securityPolicyVisible,
  '- Branch protection enabled: ' + branchProtectionEnabled,
  '- Required status checks enabled: ' + requiredStatusChecksEnabled,
  '- Required checks: ' + requiredChecks,
  '- Require review before merge: ' + requireReview,
  '- Require conversation resolution: ' + requireConversationResolution,
  '- Restrict force pushes: ' + restrictForcePushes,
  '- Restrict deletions: ' + restrictDeletions,
  '',
  '## GSE-Specific Checks',
  '',
  '- CI workflow path: `.github/workflows/validate-gse.yml`',
  '- PR template path: `.github/PULL_REQUEST_TEMPLATE.md`',
  '- Issue templates path: `.github/ISSUE_TEMPLATE/`',
  '- Public release record path: `.gse/releases/public-release-owner-required.md`',
  '- Final acceptance packet path: `.gse/acceptance/final-acceptance-packet.md`',
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
  repositoryUrl,
  settingsStatus,
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
  console.log('Public repository settings record status: ' + report.status)
  console.log('Output: ' + report.out)
  if (report.errors.length) {
    console.log('Errors:')
    for (const error of report.errors) console.log('- ' + error)
  }
}

if (report.status === 'failed' || report.status === 'exists') process.exit(1)
