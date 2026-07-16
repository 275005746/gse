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
const publicationStatus = readArg('--publication-status', 'pending')
const channelType = readArg('--channel-type', 'unknown')
const channelName = readArg('--channel-name', '')
const channelUrl = readArg('--channel-url', '')
const version = readArg('--version', '')
const artifactDigest = readArg('--artifact-digest', '')
const reviewStatus = readArg('--review-status', 'pending')
const evidenceOwner = readArg('--evidence-owner', '')
const evidenceDate = readArg('--evidence-date', '')
const evidenceUrl = readArg('--evidence-url', '')
const verificationCommand = readArg('--verification-command', 'node scripts/validate-gse.mjs --root . --json')
const verificationResult = readArg('--verification-result', 'pending')
const evidenceStatus = readArg('--evidence-status', publicationStatus === 'accepted' ? 'accepted' : 'pending')
const acceptedBy = readArg('--accepted-by', '')
const acceptedAt = readArg('--accepted-at', '')
const provesRegistryPublication = readArg('--proves-registry-publication', 'unknown')
const provesMarketplaceApproval = readArg('--proves-marketplace-approval', 'unknown')
const provesChannelInstallability = readArg('--proves-channel-installability', 'unknown')
const residualRisk = readArg('--residual-risk', 'Public channel publication is not accepted until real external evidence is attached.')
const nextAction = readArg('--next-action', 'Attach public channel publication evidence and re-run final readiness.')
const out = path.resolve(readArg('--out', path.join(root, '.gse', 'releases', 'public-channel-publication-pending.md')))
const dryRun = hasArg('--dry-run')
const force = hasArg('--force')
const jsonOnly = hasArg('--json')

const validStatuses = new Set(['pending', 'accepted'])
const validChannelTypes = new Set(['github-release', 'package-registry', 'marketplace', 'catalog', 'other', 'unknown'])
const validTriState = new Set(['true', 'false', 'unknown'])
const errors = []

function requireField(value, message) {
  if (!String(value).trim()) errors.push(message)
}

if (!validStatuses.has(publicationStatus)) errors.push('--publication-status must be pending or accepted')
if (!validStatuses.has(evidenceStatus)) errors.push('--evidence-status must be pending or accepted')
if (!validChannelTypes.has(channelType)) errors.push('--channel-type must be github-release, package-registry, marketplace, catalog, other, or unknown')
for (const [value, name] of [
  [provesRegistryPublication, '--proves-registry-publication'],
  [provesMarketplaceApproval, '--proves-marketplace-approval'],
  [provesChannelInstallability, '--proves-channel-installability'],
]) {
  if (!validTriState.has(value)) errors.push(`${name} must be true, false, or unknown`)
}

if (publicationStatus === 'accepted') {
  if (channelType === 'unknown') errors.push('accepted publication requires --channel-type')
  requireField(channelName, 'accepted publication requires --channel-name')
  requireField(channelUrl, 'accepted publication requires --channel-url')
  requireField(version, 'accepted publication requires --version')
  requireField(evidenceOwner, 'accepted publication requires --evidence-owner')
  requireField(evidenceDate, 'accepted publication requires --evidence-date')
  requireField(evidenceUrl, 'accepted publication requires --evidence-url')
  requireField(acceptedBy, 'accepted publication requires --accepted-by')
  requireField(acceptedAt, 'accepted publication requires --accepted-at')
  if (evidenceStatus !== 'accepted') errors.push('accepted publication requires --evidence-status accepted')
  if (reviewStatus !== 'approved' && reviewStatus !== 'published') errors.push('accepted publication requires --review-status approved or published')
  if (!dryRun) {
    rejectPlaceholderEvidence(errors, channelName, '--channel-name')
    rejectPlaceholderEvidence(errors, channelUrl, '--channel-url')
    rejectPlaceholderEvidence(errors, evidenceOwner, '--evidence-owner')
    rejectPlaceholderEvidence(errors, evidenceUrl, '--evidence-url')
    rejectPlaceholderEvidence(errors, acceptedBy, '--accepted-by')
  }
  if (channelType === 'package-registry') {
    requireField(artifactDigest, 'accepted package-registry publication requires --artifact-digest')
    if (provesRegistryPublication !== 'true') errors.push('accepted package-registry publication requires --proves-registry-publication true')
    if (provesChannelInstallability !== 'true') errors.push('accepted package-registry publication requires --proves-channel-installability true')
  }
  if (channelType === 'marketplace' || channelType === 'catalog') {
    if (provesMarketplaceApproval !== 'true') errors.push('accepted marketplace/catalog publication requires --proves-marketplace-approval true')
    if (provesChannelInstallability !== 'true') errors.push('accepted marketplace/catalog publication requires --proves-channel-installability true')
  }
}

const lines = [
  '# Public Channel Publication Record',
  '',
  'Publication status: ' + publicationStatus,
  '',
  'Channel type: ' + channelType,
  '',
  'Channel name: ' + channelName,
  '',
  'Channel URL: ' + channelUrl,
  '',
  'Package or listing version: ' + version,
  '',
  'Artifact digest: ' + artifactDigest,
  '',
  'Review or approval status: ' + reviewStatus,
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
  '- Does this prove public registry publication? ' + provesRegistryPublication,
  '- Does this prove marketplace approval? ' + provesMarketplaceApproval,
  '- Does this prove installability from the channel? ' + provesChannelInstallability,
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
  publicationStatus,
  channelType,
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
  console.log('Public channel publication record status: ' + report.status)
  console.log('Output: ' + report.out)
  if (report.errors.length) {
    console.log('Errors:')
    for (const error of report.errors) console.log('- ' + error)
  }
}

if (report.status === 'failed' || report.status === 'exists') process.exit(1)
