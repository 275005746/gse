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
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : ''
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const skill = read('SKILL.md')
const release = read('references/release.md')
const publicRelease = read('references/public-release.md')
const releaseTrust = read('references/release-trust.md')
const marketplace = read('references/marketplace-discovery.md')
const changelog = read('CHANGELOG.md')
const template = read('assets/templates/public-release-record.md')
const validate = read('scripts/validate-gse.mjs')
const recordScript = read('scripts/record-public-release.mjs')

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

function parseJson(stdout) {
  try {
    return JSON.parse(stdout)
  } catch {
    return null
  }
}

const ownerRequiredDryRun = exists('scripts/record-public-release.mjs')
  ? run(process.execPath, [path.join(root, 'scripts', 'record-public-release.mjs'), '--root', root, '--license-status', 'owner-required', '--dry-run', '--json'])
  : null
const ownerRequiredData = ownerRequiredDryRun ? parseJson(ownerRequiredDryRun.stdout) : null
const selectedFailureRun = exists('scripts/record-public-release.mjs')
  ? run(process.execPath, [path.join(root, 'scripts', 'record-public-release.mjs'), '--root', root, '--license-status', 'selected', '--dry-run', '--json'])
  : null
const selectedFailureData = selectedFailureRun ? parseJson(selectedFailureRun.stdout) : null

const ownerLicensePending =
  publicRelease.includes('GSE must not choose a license by guessing') &&
  publicRelease.includes('owner-required') &&
  changelog.includes('Open-source license selection remains an owner decision')

const releaseRecord = read('.gse/releases/public-release-owner-required.md')
const ownerRequiredRecord =
  releaseRecord.includes('License status: owner-required') &&
  releaseRecord.includes('Evidence status: result')
const selectedAcceptedRecord =
  releaseRecord.includes('License status: selected') &&
  releaseRecord.includes('SPDX identifier: MIT') &&
  releaseRecord.includes('License file: LICENSE') &&
  releaseRecord.includes('Evidence status: accepted')
const releaseRecordStatus = selectedAcceptedRecord
  ? 'accepted-license-decision'
  : ownerRequiredRecord
    ? 'owner-required'
    : 'unknown'

const releaseRecordFields = [
  'Release name:',
  'Release version or label:',
  'Distribution channel:',
  'License status:',
  'SPDX identifier:',
  'License file:',
  'Approved by:',
  'Changelog path:',
  'Validation command:',
  'Known unsupported claims:',
  'Evidence status:',
]

const changelogTerms = [
  '# Changelog',
  '## Unreleased',
  '### Added',
  '### Verified',
  '### Not Yet Accepted',
  'Public registry publication and marketplace approval are not verified',
]

const checks = [
  check('PR01', 'public release reference exists', exists('references/public-release.md'), 'references/public-release.md'),
  check('PR02', 'public release record template exists', exists('assets/templates/public-release-record.md'), 'assets/templates/public-release-record.md'),
  check('PR03', 'changelog exists with public-release boundaries', exists('CHANGELOG.md') && changelogTerms.every((term) => changelog.includes(term)), 'CHANGELOG.md'),
  check('PR04', 'license decision is owner-gated and not guessed', ownerLicensePending, 'references/public-release.md, CHANGELOG.md'),
  check('PR05', 'public release record captures owner/license/release evidence fields', releaseRecordFields.every((field) => template.includes(field)), releaseRecordFields.join(', ')),
  check('PR06', 'release docs route to public metadata, trust, and marketplace gates', release.includes('references/public-release.md') && publicRelease.includes('references/release-trust.md') && publicRelease.includes('references/marketplace-discovery.md') && releaseTrust.includes('release-trust') && marketplace.includes('marketplace'), 'release, public-release, release-trust, marketplace references'),
  check('PR07', 'SKILL routes public release metadata reference', skill.includes('references/public-release.md'), 'SKILL.md Reference Routing'),
  check('PR08', 'validator includes public release metadata audit', validate.includes('audit-public-release-metadata.mjs'), 'scripts/validate-gse.mjs'),
  check('PR09', 'public release record command exists and is documented', exists('scripts/record-public-release.mjs') && publicRelease.includes('scripts/record-public-release.mjs') && skill.includes('record-public-release.mjs'), 'scripts/record-public-release.mjs, references/public-release.md, SKILL.md'),
  check('PR10', 'public release record command can dry-run owner-required state', ownerRequiredDryRun?.status === 0 && ownerRequiredData?.status === 'ready' && ownerRequiredData?.licenseStatus === 'owner-required', 'record-public-release owner-required dry-run'),
  check('PR11', 'selected license mode requires owner decision fields', selectedFailureRun?.status !== 0 && selectedFailureData?.status === 'failed' && selectedFailureData?.errors?.some((item) => item.includes('--spdx')) && recordScript.includes('selected license requires --approved-by'), 'record-public-release selected dry-run failure'),
  check('PR12', 'public release decision record is preserved', exists('.gse/releases/public-release-owner-required.md') && (ownerRequiredRecord || selectedAcceptedRecord), '.gse/releases/public-release-owner-required.md'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    publicReleaseMetadata: failed === 0 ? 'verified' : 'failed',
    publicReleaseAcceptance: releaseRecordStatus,
  },
  limits: [
    'This audit verifies public-release metadata structure, changelog policy, owner-gated license decision, and routing.',
    'It does not choose a license, publish to GitHub, approve a marketplace listing, or certify legal suitability.',
    'Accepted public release still requires public repository, CI, security contact, channel publication, and host-runtime evidence when those claims are made.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Public Release Metadata Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Public release metadata: ' + data.workflows.publicReleaseMetadata)
  lines.push('- Public release acceptance: ' + data.workflows.publicReleaseAcceptance)
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
