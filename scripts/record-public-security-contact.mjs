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
const contactStatus = readArg('--contact-status', 'pending')
const contactType = readArg('--contact-type', 'unknown')
const contactValue = readArg('--contact-value', '')
const policyPath = readArg('--policy-path', 'SECURITY.md')
const evidenceOwner = readArg('--evidence-owner', '')
const evidenceDate = readArg('--evidence-date', '')
const evidenceUrl = readArg('--evidence-url', '')
const isPublic = readArg('--is-public', 'unknown')
const policyUpdated = readArg('--security-policy-updated', 'unknown')
const privateFallback = readArg('--private-fallback-channel', 'owner private coordination channel')
const responseExpectation = readArg('--response-expectation', 'pending owner policy')
const disclosureNotes = readArg('--disclosure-notes', 'Do not publish exploit details until the public contact is owner-accepted.')
const verificationCommand = readArg('--verification-command', 'node scripts/audit-open-source-readiness.mjs --root . --json')
const verificationResult = readArg('--verification-result', 'pending')
const evidenceStatus = readArg('--evidence-status', contactStatus === 'accepted' ? 'accepted' : 'pending')
const acceptedBy = readArg('--accepted-by', '')
const acceptedAt = readArg('--accepted-at', '')
const residualRisk = readArg('--residual-risk', 'Public security contact is not accepted until owner evidence is attached.')
const nextAction = readArg('--next-action', 'Attach owner-approved public security contact evidence and re-run final readiness.')
const out = path.resolve(readArg('--out', path.join(root, '.gse', 'releases', 'public-security-contact-owner-required.md')))
const dryRun = hasArg('--dry-run')
const force = hasArg('--force')
const jsonOnly = hasArg('--json')

const validStatuses = new Set(['pending', 'accepted'])
const validContactTypes = new Set(['email', 'url', 'github-security-advisory', 'other', 'unknown'])
const validTriState = new Set(['true', 'false', 'unknown'])
const validEvidenceStatuses = new Set(['pending', 'accepted'])
const errors = []

function requireField(value, message) {
  if (!String(value).trim()) errors.push(message)
}

if (!validStatuses.has(contactStatus)) errors.push('--contact-status must be pending or accepted')
if (!validContactTypes.has(contactType)) errors.push('--contact-type must be email, url, github-security-advisory, other, or unknown')
if (!validTriState.has(isPublic)) errors.push('--is-public must be true, false, or unknown')
if (!validTriState.has(policyUpdated)) errors.push('--security-policy-updated must be true, false, or unknown')
if (!validEvidenceStatuses.has(evidenceStatus)) errors.push('--evidence-status must be pending or accepted')

if (contactStatus === 'accepted') {
  if (contactType === 'unknown') errors.push('accepted security contact requires --contact-type')
  requireField(contactValue, 'accepted security contact requires --contact-value')
  requireField(evidenceOwner, 'accepted security contact requires --evidence-owner')
  requireField(evidenceDate, 'accepted security contact requires --evidence-date')
  requireField(evidenceUrl, 'accepted security contact requires --evidence-url')
  requireField(acceptedBy, 'accepted security contact requires --accepted-by')
  requireField(acceptedAt, 'accepted security contact requires --accepted-at')
  if (isPublic !== 'true') errors.push('accepted security contact requires --is-public true')
  if (policyUpdated !== 'true') errors.push('accepted security contact requires --security-policy-updated true')
  if (evidenceStatus !== 'accepted') errors.push('accepted security contact requires --evidence-status accepted')
  if (!dryRun) {
    rejectPlaceholderEvidence(errors, contactValue, '--contact-value')
    rejectPlaceholderEvidence(errors, evidenceOwner, '--evidence-owner')
    rejectPlaceholderEvidence(errors, evidenceUrl, '--evidence-url')
    rejectPlaceholderEvidence(errors, acceptedBy, '--accepted-by')
  }
}

const lines = [
  '# Public Security Contact Record',
  '',
  'Contact status: ' + contactStatus,
  '',
  'Contact type: ' + contactType,
  '',
  'Contact value: ' + contactValue,
  '',
  'Policy path: `' + policyPath + '`',
  '',
  'Evidence owner: ' + evidenceOwner,
  '',
  'Evidence date: ' + evidenceDate,
  '',
  'Evidence URL or run id: ' + evidenceUrl,
  '',
  '## Public Disclosure Policy',
  '',
  '- Is this contact public? ' + isPublic,
  '- Security policy updated? ' + policyUpdated,
  '- Private fallback channel: ' + privateFallback,
  '- Response expectation: ' + responseExpectation,
  '- Embargo or disclosure notes: ' + disclosureNotes,
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
  contactStatus,
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
  console.log('Public security contact record status: ' + report.status)
  console.log('Output: ' + report.out)
  if (report.errors.length) {
    console.log('Errors:')
    for (const error of report.errors) console.log('- ' + error)
  }
}

if (report.status === 'failed' || report.status === 'exists') process.exit(1)
