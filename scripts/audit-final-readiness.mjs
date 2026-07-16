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
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function listMarkdown(relativeDir) {
  const fullDir = path.join(root, relativeDir)
  if (!fs.existsSync(fullDir)) return []
  return fs.readdirSync(fullDir)
    .filter((item) => item.endsWith('.md'))
    .map((item) => path.join(fullDir, item))
}

function relative(filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/')
}

function parseRecord(filePath, label) {
  const text = fs.readFileSync(filePath, 'utf8')
  const prefix = label.endsWith('?') ? '- ' + label + ' ' : '- ' + label + ':'
  const line = text.split(/\r?\n/).find((item) => item.trimStart().startsWith(prefix))
  return line ? line.slice(line.indexOf(prefix) + prefix.length).trim() : ''
}

function recordText(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function hasRecordLine(text, label, value) {
  const prefix = label.endsWith('?') ? '- ' + label + ' ' : label + ':'
  return text.split(/\r?\n/).some((line) => {
    const trimmed = line.trim()
    const unlisted = trimmed.startsWith('- ') ? trimmed.slice(2).trim() : trimmed
    return trimmed === `${prefix} ${value}` ||
      trimmed === `${prefix}${value}` ||
      unlisted === `${prefix} ${value}` ||
      unlisted === `${prefix}${value}`
  })
}

function findReleaseRecord(predicate) {
  return releaseRecords.find((record) => predicate(record.text))
}

const finalReadiness = read('references/final-readiness.md')
const validate = read('scripts/validate-gse.mjs')
const completion = read('scripts/audit-completion-readiness.mjs')
const roadmap = read('scripts/audit-roadmap-consistency.mjs')
const state = read('.gse/state.json')
const goalMap = read('.gse/goal-map.md')
const publicReleaseRecord = read('.gse/releases/public-release-owner-required.md')
const publicSecurityContactRecord = read('.gse/releases/public-security-contact-owner-required.md')
const security = read('SECURITY.md')
const marketplace = read('references/marketplace-discovery.md')
const distributionAudit = read('scripts/audit-distribution.mjs')
const remoteDistributionAudit = read('scripts/audit-remote-distribution.mjs')
const npmTarballInstallAudit = read('scripts/audit-npm-tarball-install.mjs')
const npmPublishDryRunAudit = read('scripts/audit-npm-publish-dry-run.mjs')
const releaseRecords = listMarkdown(path.join('.gse', 'releases')).map((filePath) => ({ filePath, text: recordText(filePath) }))
const acceptedLicenseRecord = findReleaseRecord((text) =>
  (hasRecordLine(text, 'License status', 'selected') || hasRecordLine(text, 'License status', 'not-public')) &&
  hasRecordLine(text, 'Evidence status', 'accepted') &&
  Boolean(text.match(/^Accepted by:\s+\S/m)),
)
const acceptedSecurityContactRecord = findReleaseRecord((text) =>
  hasRecordLine(text, 'Contact status', 'accepted') &&
  hasRecordLine(text, 'Evidence status', 'accepted'),
)
const acceptedPublicCiRunRecord = findReleaseRecord((text) =>
  hasRecordLine(text, 'Run status', 'accepted') &&
  hasRecordLine(text, 'Run conclusion', 'success') &&
  hasRecordLine(text, 'Evidence status', 'accepted') &&
  hasRecordLine(text, 'Does this prove a public CI run?', 'true') &&
  hasRecordLine(text, 'Does this prove required checks passed?', 'true'),
)
const acceptedRepositorySettingsRecord = findReleaseRecord((text) =>
  hasRecordLine(text, 'Settings status', 'accepted') &&
  hasRecordLine(text, 'Evidence status', 'accepted'),
)
const acceptedRegistryPublicationRecord = findReleaseRecord((text) =>
  hasRecordLine(text, 'Publication status', 'accepted') &&
  hasRecordLine(text, 'Channel type', 'package-registry') &&
  hasRecordLine(text, 'Evidence status', 'accepted') &&
  hasRecordLine(text, 'Does this prove public registry publication?', 'true'),
)
const acceptedMarketplaceApprovalRecord = findReleaseRecord((text) =>
  hasRecordLine(text, 'Publication status', 'accepted') &&
  (hasRecordLine(text, 'Channel type', 'marketplace') || hasRecordLine(text, 'Channel type', 'catalog')) &&
  hasRecordLine(text, 'Evidence status', 'accepted') &&
  hasRecordLine(text, 'Does this prove marketplace approval?', 'true'),
)
const hostRecords = listMarkdown(path.join('.gse', 'evidence', 'host-invocations'))
const closeableHostRecords = hostRecords.filter((record) => ['verified', 'accepted'].includes(parseRecord(record, 'Status')))
const nativeHostRecords = closeableHostRecords.filter((record) => parseRecord(record, 'Does this prove native slash-command support?') === 'true')
const portableHostRecords = closeableHostRecords.filter((record) => parseRecord(record, 'Does this prove portable text-command routing only?') === 'true')
const otherHostRuntimeRecords = closeableHostRecords.filter((record) =>
  parseRecord(record, 'Does this prove portable text-command routing only?') !== 'true' &&
  parseRecord(record, 'Does this rely on a generated pointer file?') !== 'true'
)

const matrix = [
  { area: 'Skill structure', status: exists('SKILL.md') && exists('scripts/validate-gse.mjs') ? 'verified' : 'missing', evidence: 'SKILL.md, scripts/validate-gse.mjs' },
  { area: 'Project scaffold', status: exists('scripts/init-project.mjs') && exists('scripts/audit-target-project.mjs') && exists('scripts/audit-close-gate.mjs') ? 'verified' : 'missing', evidence: 'init/project doctor/close gate scripts' },
  { area: 'Local install', status: exists('scripts/package-gse.mjs') && exists('scripts/install-gse.mjs') && exists('scripts/audit-distribution.mjs') && distributionAudit.includes('installed short CLI wrapper runs status command') && distributionAudit.includes('entrypoints?.cli') ? 'verified' : 'missing', evidence: 'scripts/audit-distribution.mjs verifies package/install, installed validation, entrypoints.cli, and installed gse.mjs status' },
  { area: 'npm tarball install', status: exists('package.json') && exists('scripts/audit-npm-tarball-install.mjs') && npmTarballInstallAudit.includes('npm pack creates one tarball') && npmTarballInstallAudit.includes('installed gse bin runs status command') && npmTarballInstallAudit.includes('installed README audit passes') ? 'verified' : 'missing', evidence: 'scripts/audit-npm-tarball-install.mjs verifies npm tarball creation, clean consumer install, installed bin execution, and installed README audit' },
  { area: 'npm publish dry-run', status: exists('package.json') && exists('scripts/audit-npm-publish-dry-run.mjs') && npmPublishDryRunAudit.includes('npm publish dry-run command succeeds') && npmPublishDryRunAudit.includes('publish dry-run preserves CLI package metadata before publication') && npmPublishDryRunAudit.includes('publish dry-run does not auto-correct or remove package metadata') ? 'verified' : 'missing', evidence: 'scripts/audit-npm-publish-dry-run.mjs verifies publish dry-run metadata, CLI bin preservation, required files, and integrity fields' },
  { area: 'URL install', status: exists('scripts/audit-remote-distribution.mjs') && remoteDistributionAudit.includes('remote installed short CLI wrapper runs status command') && remoteDistributionAudit.includes('tampered remote package fails integrity gate') ? 'verified' : 'missing', evidence: 'scripts/audit-remote-distribution.mjs verifies URL install, installed validation, installed gse.mjs status, and tamper rejection' },
  { area: 'Signing', status: exists('scripts/audit-signing.mjs') && exists('scripts/sign-gse-package.mjs') && exists('scripts/verify-gse-package.mjs') ? 'verified' : 'missing', evidence: 'sign/verify/audit scripts' },
  { area: 'Open-source collaboration', status: exists('CONTRIBUTING.md') && exists('SECURITY.md') && exists('SUPPORT.md') && exists('scripts/audit-open-source-readiness.mjs') ? 'verified' : 'missing', evidence: 'CONTRIBUTING.md, SECURITY.md, SUPPORT.md' },
  { area: 'CI workflow template', status: exists('.github/workflows/validate-gse.yml') && exists('scripts/audit-ci-readiness.mjs') ? 'verified' : 'missing', evidence: '.github/workflows/validate-gse.yml, scripts/audit-ci-readiness.mjs' },
  { area: 'Public CI run record', status: exists('scripts/record-public-ci-run.mjs') && exists('scripts/audit-public-ci-run.mjs') && exists('assets/templates/public-ci-run-record.md') ? 'verified' : 'missing', evidence: 'record/audit public CI run scripts and template' },
  { area: 'Public collaboration templates', status: exists('.github/PULL_REQUEST_TEMPLATE.md') && exists('.github/ISSUE_TEMPLATE/bug_report.yml') && exists('.github/ISSUE_TEMPLATE/change_request.yml') && exists('scripts/audit-public-collaboration-templates.mjs') ? 'verified' : 'missing', evidence: '.github/PULL_REQUEST_TEMPLATE.md, .github/ISSUE_TEMPLATE/, scripts/audit-public-collaboration-templates.mjs' },
  { area: 'Public repository settings record', status: exists('scripts/record-public-repository-settings.mjs') && exists('scripts/audit-public-repository-settings.mjs') && exists('assets/templates/public-repository-settings-record.md') ? 'verified' : 'missing', evidence: 'record/audit public repository settings scripts and template' },
  { area: 'Public CI run', status: acceptedPublicCiRunRecord ? 'verified' : 'external-required', evidence: acceptedPublicCiRunRecord ? relative(acceptedPublicCiRunRecord.filePath) : 'no public GitHub Actions run is claimed' },
  { area: 'Public repository settings', status: acceptedRepositorySettingsRecord ? 'verified' : 'external-required', evidence: acceptedRepositorySettingsRecord ? relative(acceptedRepositorySettingsRecord.filePath) : 'no real public repository settings evidence is claimed' },
  { area: 'License decision', status: acceptedLicenseRecord ? 'verified' : publicReleaseRecord.includes('License status: owner-required') ? 'owner-required' : publicReleaseRecord.includes('License status: selected') ? 'verified' : 'missing', evidence: acceptedLicenseRecord ? relative(acceptedLicenseRecord.filePath) : '.gse/releases/public-release-owner-required.md' },
  { area: 'Public security contact record', status: exists('scripts/record-public-security-contact.mjs') && exists('scripts/audit-public-security-contact.mjs') && exists('assets/templates/public-security-contact-record.md') ? 'verified' : 'missing', evidence: 'record/audit public security contact scripts and template' },
  { area: 'Public security contact', status: acceptedSecurityContactRecord ? 'verified' : security.includes('No public vulnerability disclosure address has been owner-approved yet') ? 'owner-required' : 'verified', evidence: acceptedSecurityContactRecord ? relative(acceptedSecurityContactRecord.filePath) : publicSecurityContactRecord ? '.gse/releases/public-security-contact-owner-required.md' : 'SECURITY.md' },
  { area: 'Public channel publication record', status: exists('scripts/record-public-channel-publication.mjs') && exists('scripts/audit-public-channel-publication.mjs') && exists('assets/templates/public-channel-publication-record.md') ? 'verified' : 'missing', evidence: 'record/audit public channel publication scripts and template' },
  { area: 'Public registry publication', status: acceptedRegistryPublicationRecord ? 'verified' : 'external-required', evidence: acceptedRegistryPublicationRecord ? relative(acceptedRegistryPublicationRecord.filePath) : 'no public registry publication record is claimed' },
  { area: 'Marketplace approval', status: acceptedMarketplaceApprovalRecord ? 'verified' : 'external-required', evidence: acceptedMarketplaceApprovalRecord ? relative(acceptedMarketplaceApprovalRecord.filePath) : 'references/marketplace-discovery.md' },
  { area: 'Portable command execution', status: exists('scripts/audit-command-execution.mjs') && exists('scripts/run-gse-command.mjs') ? 'verified' : 'missing', evidence: 'run-gse-command and audit-command-execution' },
  { area: 'Host adapters', status: exists('scripts/generate-command-adapter.mjs') && exists('scripts/audit-command-adapters.mjs') ? 'verified' : 'missing', evidence: 'command adapter generator and audit' },
  { area: 'Native slash command', status: nativeHostRecords.length > 0 ? 'verified' : 'not-claimed', evidence: nativeHostRecords.length > 0 ? nativeHostRecords.map(relative).join(', ') : 'optional host-native adapter claim; GSE core uses portable command execution' },
  { area: 'Other host runtime invocation', status: otherHostRuntimeRecords.length > 0 ? 'verified' : 'external-required', evidence: otherHostRuntimeRecords.length > 0 ? otherHostRuntimeRecords.map(relative).join(', ') : `${closeableHostRecords.length} verified/accepted host record(s), ${portableHostRecords.length} portable text record(s)` },
]

const allowedStatuses = new Set(['verified', 'owner-required', 'external-required', 'not-claimed'])
const matrixStatusesHonest = matrix.every((item) => allowedStatuses.has(item.status))
const verifiedRowsHaveEvidence = matrix.filter((item) => item.status === 'verified').every((item) => item.evidence && item.evidence !== '0')
const publicAccepted = matrix.every((item) => item.status === 'verified' || item.status === 'not-claimed')
const ownerAndExternalRowsRemainExplicit = publicAccepted || matrix.some((item) => item.status === 'owner-required' || item.status === 'external-required')
const finalReadinessUsesStatusSourceBoundary = finalReadiness.includes('Status source / baseline') &&
  finalReadiness.includes('current truth is computed by `scripts/audit-final-readiness.mjs`') &&
  finalReadiness.includes('record-driven owner gate') &&
  finalReadiness.includes('record-driven external gate') &&
  finalReadiness.includes('Do not read the baseline column as live status')

const checks = [
  check('FR01', 'final readiness reference exists', exists('references/final-readiness.md'), 'references/final-readiness.md'),
  check('FR02', 'final readiness matrix covers key final-state areas', ['npm tarball install', 'npm publish dry-run', 'CI workflow template', 'Public CI run record', 'Public collaboration templates', 'Public repository settings record', 'Public CI run', 'Public repository settings', 'License decision', 'Public security contact record', 'Public security contact', 'Public channel publication record', 'Public registry publication', 'Marketplace approval', 'Native slash command', 'Other host runtime invocation'].every((term) => finalReadiness.includes(term)), 'references/final-readiness.md'),
  check('FR03', 'final readiness audit is wired into validator and completion audits', validate.includes('audit-final-readiness.mjs') && completion.includes('audit-final-readiness.mjs') && roadmap.includes('audit-final-readiness.mjs'), 'validate, completion, roadmap audits'),
  check('FR04', 'readiness matrix uses honest statuses only', matrixStatusesHonest, matrix.map((item) => `${item.area}:${item.status}`).join(', ')),
  check('FR05', 'verified readiness rows have evidence labels', verifiedRowsHaveEvidence, matrix.filter((item) => item.status === 'verified').map((item) => item.area).join(', ')),
  check('FR06', 'owner and external gates remain explicit until accepted records promote them', ownerAndExternalRowsRemainExplicit && (publicAccepted || goalMap.includes('Final-form gaps')), publicAccepted ? 'all final rows promoted by accepted records' : 'goal map, final readiness matrix'),
  check('FR07', 'install and publish rows include CLI proof boundaries', finalReadiness.includes('installed short CLI status command') && finalReadiness.includes('installed `gse` bin execution') && finalReadiness.includes('CLI bin metadata') && finalReadiness.includes('URL-installed short CLI status command') && distributionAudit.includes('installed short CLI wrapper runs status command') && npmTarballInstallAudit.includes('installed gse bin runs status command') && npmPublishDryRunAudit.includes('publish dry-run preserves CLI package metadata before publication') && remoteDistributionAudit.includes('remote installed short CLI wrapper runs status command'), 'references/final-readiness.md, distribution audits, publish dry-run audit'),
  check('FR08', 'final readiness reference separates baseline from live record-driven status', finalReadinessUsesStatusSourceBoundary, 'references/final-readiness.md, audit-final-readiness.mjs'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    finalReadinessMatrix: failed === 0 ? 'verified' : 'failed',
    publicAccepted: publicAccepted ? 'verified' : 'not-accepted',
  },
  matrix,
  limits: [
    'This audit verifies that GSE has an honest final-readiness matrix.',
    'It may pass while owner-required or external-required rows remain incomplete.',
    'It does not prove native slash-command support; that remains a per-host optional adapter claim.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Final Readiness Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Final readiness matrix: ' + data.workflows.finalReadinessMatrix)
  lines.push('- Public accepted: ' + data.workflows.publicAccepted)
  lines.push('')
  lines.push('## Matrix')
  lines.push('')
  for (const item of data.matrix) lines.push('- ' + item.area + ': ' + item.status + ' (' + item.evidence + ')')
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
