#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const jsonOnly = args.includes('--json')

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function read(relativePath) {
  const fullPath = path.join(root, relativePath)
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : ''
}

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

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'gse-release-bundle-v1.0.0-'))
const bundlePath = path.join(tempRoot, 'bundle')
const bundle = run(process.execPath, [
  path.join(root, 'scripts', 'generate-release-bundle.mjs'),
  '--root', root,
  '--label', 'gse-release-bundle-v1.0.0',
  '--out', bundlePath,
  '--force',
  '--json',
])
const bundleData = parseJson(bundle.stdout)
function readBundle(fileName) {
  const fullPath = path.join(bundlePath, fileName)
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : ''
}
const summary = readBundle('release-summary.md')
const manifest = readBundle('bundle-manifest.json')
const checklist = readBundle('validation-checklist.md')
const record = readBundle('public-release-record.md')
const handoff = readBundle('public-acceptance-handoff.md')
const hostHandoff = readBundle('host-runtime-evidence-handoff.md')
const releaseStatusManifest = readBundle('release-status-manifest.json')
const releaseOwnerActionPlan = readBundle('release-owner-action-plan.md')
const publicReleaseChecklist = readBundle('public-release-checklist.md')
const ownerExternalGateKitReadme = readBundle('owner-external-gate-kit/README.md')
const ownerExternalGateKitManifest = readBundle('owner-external-gate-kit/kit-manifest.json')
const ownerExternalGateKitReleaseOwnerActionPlan = readBundle('owner-external-gate-kit/release-owner-action-plan.md')
const ownerExternalGateKitRecordCommands = readBundle('owner-external-gate-kit/record-commands.md')
const ownerExternalGateKitVerificationCommands = readBundle('owner-external-gate-kit/verification-commands.md')
const installablePackageManifest = readBundle('installable-package/gse-package-manifest.json')
const provenance = readBundle('provenance.json')
const checksums = readBundle('checksums.sha256')
const releaseStatusData = parseJson(releaseStatusManifest)
const pendingGates = releaseStatusData?.publicAcceptance?.pendingGates ?? []
const pendingAreas = pendingGates.map((gate) => gate.area)
const hasPendingGates = pendingGates.length > 0
const publicAcceptedStatus = releaseStatusData?.publicAcceptance?.publicAccepted ?? releaseStatusData?.claimBoundary?.publicAccepted ?? 'unknown'
const hasPendingRegistryPublication = pendingAreas.includes('Public registry publication')
const bundleManifestData = parseJson(manifest)
const ownerExternalGateKitData = parseJson(ownerExternalGateKitManifest)
const installablePackageManifestData = parseJson(installablePackageManifest)
const provenanceData = parseJson(provenance)
const validate = read('scripts/validate-gse.mjs')
const packaging = read('references/packaging.md')
const installedFromBundlePath = path.join(tempRoot, 'installed-from-bundle')
const installFromBundle = fs.existsSync(path.join(bundlePath, 'installable-package', 'gse-package-manifest.json'))
  ? run(process.execPath, [
      path.join(root, 'scripts', 'install-gse.mjs'),
      '--source',
      path.join(bundlePath, 'installable-package'),
      '--target',
      installedFromBundlePath,
      '--json',
    ])
  : { status: 1, stdout: '', stderr: 'installable package missing' }
const installFromBundleData = parseJson(installFromBundle.stdout)
const installedFromBundleCli = fs.existsSync(path.join(installedFromBundlePath, 'scripts', 'gse.mjs'))
  ? run(process.execPath, [
      path.join(installedFromBundlePath, 'scripts', 'gse.mjs'),
      'status',
      '--target',
      installedFromBundlePath,
      '--json',
    ])
  : { status: 1, stdout: '', stderr: 'installed gse cli missing' }
const installedFromBundleCliData = parseJson(installedFromBundleCli.stdout)

function planMatchesManifestCounts(plan, data) {
  if (!plan || !data) return false
  const verifiedRows = data.readiness?.verified?.length ?? 0
  const ownerRequiredRows = data.readiness?.ownerRequired?.length ?? 0
  const externalRequiredRows = data.readiness?.externalRequired?.length ?? 0
  const publicAccepted = data.publicAcceptance?.publicAccepted ?? data.claimBoundary?.publicAccepted ?? 'unknown'
  const pendingGates = data.publicAcceptance?.pendingGates ?? []
  return plan.includes('- Public accepted: ' + publicAccepted) &&
    plan.includes('- Verified rows: ' + verifiedRows) &&
    plan.includes('- Owner-required rows: ' + ownerRequiredRows) &&
    plan.includes('- External-required rows: ' + externalRequiredRows) &&
    pendingGates.every((gate) => plan.includes('#### ' + gate.area)) &&
    !plan.includes('#### License decision')
}

function hasLocalPathLeak(text) {
  const escapedRoot = root.replace(/\\/g, '\\\\')
  const forwardRoot = root.replace(/\\/g, '/')
  const escapedForwardRoot = forwardRoot.replace(/\//g, '\\/')
  return text.includes(root) ||
    text.includes(escapedRoot) ||
    text.includes(forwardRoot) ||
    text.includes(escapedForwardRoot) ||
    /C:\\\\Program Files\\\\nodejs\\\\node\.exe/i.test(text) ||
    /C:\\Program Files\\nodejs\\node\.exe/i.test(text)
}

function verifyChecksumFile() {
  if (!checksums.trim()) return false
  const rows = checksums.trim().split(/\r?\n/)
  return rows.every((row) => {
    const match = row.match(/^([a-f0-9]{64})  (.+)$/)
    if (!match) return false
    const [, hash, relativePath] = match
    const fullPath = path.join(bundlePath, relativePath)
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) return false
    return sha256File(fullPath) === hash
  }) && rows.some((row) => row.endsWith('installable-package/gse-package-manifest.json'))
}

const checks = [
  check('RB01', 'release bundle generator exists', exists('scripts/generate-release-bundle.mjs'), 'scripts/generate-release-bundle.mjs'),
  check('RB02', 'release bundle generation succeeds', bundle.status === 0 && bundleData?.status === 'written', 'generate-release-bundle audit run'),
  check('RB03', 'bundle includes required handoff files', ['release-summary.md', 'install-commands.md', 'validation-checklist.md', 'public-release-record.md', 'public-acceptance-handoff.md', 'host-runtime-evidence-handoff.md', 'release-status-manifest.json', 'release-owner-action-plan.md', 'public-release-checklist.md', 'owner-external-gate-kit/README.md', 'owner-external-gate-kit/kit-manifest.json', 'installable-package/gse-package-manifest.json', 'provenance.json', 'checksums.sha256', 'bundle-manifest.json'].every((item) => fs.existsSync(path.join(bundlePath, item))), bundlePath),
  check('RB04', 'bundle preserves license decision and public release boundary', summary.includes('Accepted public release: not accepted') && record.includes('License status: selected') && record.includes('SPDX identifier: MIT') && record.includes('Evidence status: accepted'), 'release-summary.md, public-release-record.md'),
  check('RB05', 'bundle includes install, validation, and installed CLI commands', summary.includes('installable-package/') && summary.includes('install-gse.mjs') && summary.includes('validate-gse.mjs') && summary.includes('scripts/gse.mjs status') && checklist.includes('audit-remote-distribution.mjs'), 'release-summary.md, validation-checklist.md'),
  check('RB05b', 'bundle includes host runtime drill before cross-host handoff', summary.includes('audit-host-runtime-invocation-drill.mjs') && checklist.includes('audit-host-runtime-invocation-drill.mjs'), 'release-summary.md, validation-checklist.md'),
  check('RB06', 'bundle manifest records validation and limits', manifest.includes('"validation"') && manifest.includes('Bundle does not choose a license') && bundleManifestData?.publicReleaseAcceptance === publicAcceptedStatus && bundleManifestData?.licenseDecision === 'accepted' && manifest.includes('"publicAcceptanceHandoff": "included"') && manifest.includes('"hostRuntimeEvidenceHandoff": "included"') && manifest.includes('"releaseStatusManifest": "included"') && manifest.includes('"releaseOwnerActionPlan": "included"'), 'bundle-manifest.json'),
  check('RB06v', 'bundle manifest records every successful standard validation command', Array.isArray(bundleManifestData?.validationChecks) && bundleManifestData.validationChecks.length === bundleManifestData?.validation?.total && bundleManifestData.validationChecks.every((item) => item.status === 'passed' && item.command?.includes(item.id)), 'bundle-manifest.json, release-summary.md'),
  check('RB06v2', 'bundle validation details match the current standard precheck total', bundleManifestData?.validation?.status === 'passed' && bundleManifestData?.validation?.failed === 0 && bundleManifestData?.validationChecks?.length === bundleManifestData?.validation?.passed && summary.includes('Validation manifest detail'), 'bundle-manifest.json, release-summary.md'),
  check('RB06v3', 'bundle manifest records installable package snapshot', bundleManifestData?.installablePackage?.path === 'installable-package/' && bundleManifestData?.installablePackage?.manifest === 'installable-package/gse-package-manifest.json' && bundleManifestData?.installablePackage?.algorithm === 'sha256' && bundleManifestData?.installablePackage?.cli === 'scripts/gse.mjs', 'bundle-manifest.json installablePackage'),
  check('RB06v4', 'bundle installable package manifest is valid', installablePackageManifestData?.integrity?.algorithm === 'sha256' && installablePackageManifestData?.entrypoints?.cli === 'scripts/gse.mjs' && installablePackageManifestData?.fileHashes?.['SKILL.md'], 'installable-package/gse-package-manifest.json'),
  check('RB06v5', 'bundle installable package installs and installed CLI runs', installFromBundle.status === 0 && installFromBundleData?.status === 'passed' && installFromBundleData?.summary?.integrityFailed === 0 && installedFromBundleCli.status === 0 && installedFromBundleCliData?.command === '/gse status' && installedFromBundleCliData?.project?.stateValid === true, 'installable-package install and gse status'),
  check('RB06v6', 'bundle provenance records local generation boundaries', provenanceData?.generator === 'scripts/generate-release-bundle.mjs' && provenanceData?.installablePackage?.packageDigest === installablePackageManifestData?.integrity?.packageDigest && provenanceData?.publicAcceptance?.status === publicAcceptedStatus && Array.isArray(provenanceData?.claimBoundaries) && provenanceData.claimBoundaries.some((item) => item.includes('not a registry attestation')), 'provenance.json'),
  check('RB06v7', 'bundle checksums verify installable package files', verifyChecksumFile(), 'checksums.sha256'),
  check('RB06v8', 'bundle provenance and checksums do not expose local paths', !hasLocalPathLeak(provenance) && !hasLocalPathLeak(checksums), 'provenance.json, checksums.sha256'),
  check('RB06a', 'bundle manifest does not expose local source root or Node install path', bundleManifestData && !Object.hasOwn(bundleManifestData, 'sourceRoot') && !hasLocalPathLeak(manifest), 'bundle-manifest.json'),
  check('RB06b', 'bundle includes public acceptance handoff boundaries', handoff.includes('GSE Public Acceptance Handoff') && handoff.includes('Public accepted: ' + publicAcceptedStatus) && handoff.includes('Do not claim public release acceptance'), 'public-acceptance-handoff.md'),
  check('RB06b2', 'bundle public acceptance handoff uses current registry publication CLI flag when pending', !hasPendingRegistryPublication || (handoff.includes('--proves-registry-publication true') && !handoff.includes('--proves-public-registry-publication')), 'public-acceptance-handoff.md'),
  check('RB06b3', 'bundle public acceptance handoff includes dry-run preflight commands', hasPendingGates ? (handoff.includes('Preflight command') && handoff.includes('--dry-run --json')) : handoff.includes('No owner/external acceptance gate is pending'), 'public-acceptance-handoff.md'),
  check('RB06c', 'bundle includes host runtime evidence handoff boundaries', hostHandoff.includes('GSE Host Runtime Evidence Handoff') && hostHandoff.includes('Do not claim native slash-command support') && hostHandoff.includes('record-host-invocation.mjs'), 'host-runtime-evidence-handoff.md'),
  check('RB06d', 'bundle includes machine-readable release status manifest', releaseStatusData?.claimBoundary?.publicAccepted === publicAcceptedStatus && releaseStatusManifest.includes('"releaseStatusManifest"') && releaseStatusManifest.includes('"localInstalledCli": "verified"') && releaseStatusManifest.includes('"remoteInstalledCli": "verified"') && releaseStatusManifest.includes('"nativeSlashCommandRecords": 0') && releaseStatusManifest.includes('"fixtureDrill": "verified"') && releaseStatusManifest.includes('"fixtureEvidenceIsPersistent": false'), 'release-status-manifest.json'),
  check('RB06d2', 'bundle release status manifest includes dry-run preflight commands', (releaseStatusData?.publicAcceptance?.nextPreflightCommands?.length ?? 0) === (releaseStatusData?.publicAcceptance?.pendingGates?.length ?? -1) && releaseStatusData.publicAcceptance.nextPreflightCommands.every((command) => command.includes('--dry-run --json')), 'release-status-manifest.json'),
  check('RB06d3', 'bundle release status manifest includes preflight command drill', releaseStatusData?.verificationCommands?.some((command) => command.includes('audit-public-acceptance-command-dry-run-drill.mjs')), 'release-status-manifest.json'),
  check('RB06e', 'bundle includes owner-facing release action plan', releaseOwnerActionPlan.includes('GSE Release Owner Action Plan') && pendingGates.every((gate) => releaseOwnerActionPlan.includes('#### ' + gate.area)) && !releaseOwnerActionPlan.includes('record-public-release.mjs') && releaseOwnerActionPlan.includes('Local validation does not mean public acceptance'), 'release-owner-action-plan.md'),
  check('RB06e2', 'bundle owner action plan includes dry-run preflight commands and drill', (hasPendingGates ? (releaseOwnerActionPlan.includes('Preflight command') && releaseOwnerActionPlan.includes('--dry-run --json')) : releaseOwnerActionPlan.includes('No pending owner or external gates were reported by the manifest.')) && releaseOwnerActionPlan.includes('audit-public-acceptance-command-dry-run-drill.mjs'), 'release-owner-action-plan.md'),
  check('RB06e3', 'generated release bundle owner action plans match generated manifest counts and pending gates', planMatchesManifestCounts(releaseOwnerActionPlan, releaseStatusData) && planMatchesManifestCounts(ownerExternalGateKitReleaseOwnerActionPlan, releaseStatusData), 'release-owner-action-plan.md, owner-external-gate-kit/release-owner-action-plan.md'),
  check('RB06e4', 'bundle includes linear public release checklist', publicReleaseChecklist.includes('GSE Public Release Checklist') && publicReleaseChecklist.includes('01. Prepare the release bundle') && publicReleaseChecklist.includes('08. Record other host runtime invocation evidence') && publicReleaseChecklist.includes('Public accepted: ' + publicAcceptedStatus) && publicReleaseChecklist.includes('/gse release --execute --out <bundle>'), 'public-release-checklist.md'),
  check('RB06e5', 'generated release bundle checklist matches generated pending gate count', publicReleaseChecklist.includes('GSE Public Release Checklist') && publicReleaseChecklist.includes('Pending owner/external gates: ' + pendingGates.length), 'public-release-checklist.md'),
  check('RB06f', 'bundle includes owner/external gate execution kit', ownerExternalGateKitReadme.includes('GSE Owner / External Gate Kit') && ownerExternalGateKitData?.pendingGateCount === releaseStatusData?.publicAcceptance?.pendingGates?.length && ownerExternalGateKitData?.generatedFresh?.finalAcceptancePacket === true && !ownerExternalGateKitRecordCommands.includes('record-public-release.mjs'), 'owner-external-gate-kit/'),
  check('RB06f2', 'bundle owner/external gate kit includes dry-run preflight commands', hasPendingGates ? (ownerExternalGateKitRecordCommands.includes('Preflight command') && ownerExternalGateKitRecordCommands.includes('--dry-run --json')) : ownerExternalGateKitData?.pendingGateCount === 0, 'owner-external-gate-kit/record-commands.md'),
  check('RB06f3', 'bundle owner/external gate kit includes preflight command drill', ownerExternalGateKitVerificationCommands.includes('audit-public-acceptance-command-dry-run-drill.mjs'), 'owner-external-gate-kit/verification-commands.md'),
  check('RB07', 'validator includes release bundle audit', validate.includes('audit-release-bundle.mjs'), 'scripts/validate-gse.mjs'),
  check('RB08', 'packaging docs route release bundle command', packaging.includes('generate-release-bundle.mjs') && packaging.includes('audit-release-bundle.mjs'), 'references/packaging.md'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { releaseBundle: failed === 0 ? 'verified' : 'failed' },
  bundle: bundleData,
  tempRoot,
  limits: [
    'This audit verifies release bundle generation and contents.',
    'This audit writes to an isolated temporary directory and does not mutate the canonical release bundle path.',
    'It does not publish a package, approve a marketplace listing, choose a license, or prove host-native slash-command support.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Release Bundle Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Release bundle: ' + data.workflows.releaseBundle)
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

rmSync(tempRoot, { recursive: true, force: true })

if (failed > 0) process.exit(1)
