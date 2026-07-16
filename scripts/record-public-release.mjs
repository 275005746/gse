#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

function hasArg(name) {
  return args.includes(name)
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const releaseName = readArg('--release-name', 'GSE')
const releaseLabel = readArg('--release-label', 'unreleased')
const releaseDate = readArg('--release-date', new Date().toISOString().slice(0, 10))
const channel = readArg('--channel', 'owner-required')
const licenseStatus = readArg('--license-status', 'owner-required')
const spdx = readArg('--spdx', '')
const licenseFile = readArg('--license-file', '')
const approvedBy = readArg('--approved-by', '')
const decisionDate = readArg('--decision-date', '')
const changelogPath = readArg('--changelog-path', 'CHANGELOG.md')
const packagePath = readArg('--package-path', '<install-skill-dir>')
const validationCommand = readArg('--validation-command', 'node scripts/validate-gse.mjs --root <skill> --json')
const evidenceStatus = readArg('--evidence-status', licenseStatus === 'selected' ? 'accepted' : 'result')
const out = path.resolve(readArg('--out', path.join(root, '.gse', 'releases', 'public-release-owner-required.md')))
const dryRun = hasArg('--dry-run')
const force = hasArg('--force')
const jsonOnly = hasArg('--json')

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function pushError(errors, condition, message) {
  if (!condition) errors.push(message)
}

const validLicenseStatuses = new Set(['owner-required', 'selected', 'not-public'])
const errors = []

pushError(errors, validLicenseStatuses.has(licenseStatus), 'license-status must be owner-required, selected, or not-public')
pushError(errors, releaseName.trim().length > 0, 'release-name is required')
pushError(errors, releaseLabel.trim().length > 0, 'release-label is required')
pushError(errors, channel.trim().length > 0, 'channel is required')
pushError(errors, exists(changelogPath), 'changelog-path must exist: ' + changelogPath)

if (licenseStatus === 'selected') {
  pushError(errors, spdx.trim().length > 0, 'selected license requires --spdx')
  pushError(errors, licenseFile.trim().length > 0, 'selected license requires --license-file')
  pushError(errors, licenseFile.trim().length > 0 && exists(licenseFile), 'selected license file must exist: ' + licenseFile)
  pushError(errors, approvedBy.trim().length > 0, 'selected license requires --approved-by')
  pushError(errors, decisionDate.trim().length > 0, 'selected license requires --decision-date')
  pushError(errors, evidenceStatus === 'accepted', 'selected license record must use --evidence-status accepted')
}

if (licenseStatus === 'not-public') {
  pushError(errors, approvedBy.trim().length > 0, 'not-public decision requires --approved-by')
  pushError(errors, decisionDate.trim().length > 0, 'not-public decision requires --decision-date')
}

const lines = [
  '# Public Release Record',
  '',
  'Release name: ' + releaseName,
  '',
  'Release version or label: ' + releaseLabel,
  '',
  'Release date: ' + releaseDate,
  '',
  'Distribution channel: ' + channel,
  '',
  'Release scope: GSE public release metadata and distribution readiness',
  '',
  '## License',
  '',
  'License status: ' + licenseStatus,
  '',
  'SPDX identifier: ' + spdx,
  '',
  'License file: ' + licenseFile,
  '',
  'Approved by: ' + approvedBy,
  '',
  'Decision date: ' + decisionDate,
  '',
  'Notes: ' + (licenseStatus === 'owner-required'
    ? 'Owner license decision is required before accepted public release.'
    : licenseStatus === 'not-public'
      ? 'Package is not approved for public open-source release.'
      : 'Owner-selected license decision recorded.'),
  '',
  '## Artifacts',
  '',
  'Package or source path: ' + packagePath,
  '',
  'Changelog path: ' + changelogPath,
  '',
  'Install/update instructions: references/packaging.md',
  '',
  'Integrity or signing record: references/release-trust.md',
  '',
  'Marketplace/catalog record: references/marketplace-discovery.md',
  '',
  '## Verification',
  '',
  'Validation command: ' + validationCommand,
  '',
  'Validation result: pending current run',
  '',
  'Focused smoke: scripts/audit-public-release-metadata.mjs',
  '',
  'Acceptance evidence: ' + (licenseStatus === 'selected' ? 'Owner license decision accepted; public release still requires remaining public and host evidence.' : 'Owner decision pending.'),
  '',
  '## Risks',
  '',
  'Known unsupported claims: public marketplace approval, public registry publication, legal suitability, and host-native slash-command runtime support are not implied by this record.',
  '',
  'Known compatibility limits: host behavior must be verified per host runtime.',
  '',
  'Rollback or unpublish path: remove public listing/package and publish corrected release record.',
  '',
  '## Acceptance',
  '',
  'Evidence status: ' + evidenceStatus,
  '',
  'Accepted by: ' + approvedBy,
  '',
  'Accepted at: ' + (evidenceStatus === 'accepted' ? decisionDate : ''),
  '',
  'Next action: ' + (licenseStatus === 'owner-required'
    ? 'Owner selects license or records not-public decision.'
    : 'Run release validation and preserve acceptance evidence.'),
  '',
]

const report = {
  root,
  out,
  dryRun,
  releaseName,
  releaseLabel,
  channel,
  licenseStatus,
  evidenceStatus,
  status: errors.length > 0 ? 'failed' : dryRun ? 'ready' : 'written',
  errors,
}

if (errors.length === 0 && !dryRun) {
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
  console.log('Public release record status: ' + report.status)
  console.log('Output: ' + report.out)
  if (report.errors.length) {
    console.log('Errors:')
    for (const error of report.errors) console.log('- ' + error)
  }
}

if (report.status === 'failed' || report.status === 'exists') process.exit(1)
