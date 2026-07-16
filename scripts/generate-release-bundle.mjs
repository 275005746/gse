#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'

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
const label = readArg('--label', 'gse-release-bundle-' + new Date().toISOString().slice(0, 10))
const out = path.resolve(readArg('--out', path.join(root, '.gse', 'release-bundles', label)))
const displayRoot = readArg('--display-root', '<gse-root>')
const dryRun = hasArg('--dry-run')
const force = hasArg('--force')
const jsonOnly = hasArg('--json')

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
    command: [command, ...commandArgs].join(' '),
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

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function collectFileHashes(baseDir) {
  const rows = []
  function visit(itemPath) {
    if (!fs.existsSync(itemPath)) return
    const stat = fs.statSync(itemPath)
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(itemPath)) visit(path.join(itemPath, child))
      return
    }
    if (!stat.isFile()) return
    const relativePath = path.relative(baseDir, itemPath).replace(/\\/g, '/')
    rows.push({
      relativePath,
      sha256: sha256File(itemPath),
      bytes: stat.size,
    })
  }
  visit(baseDir)
  rows.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  return rows
}

function portableCommand(commandLine) {
  if (!commandLine) return commandLine
  const rootForward = root.replace(/\\/g, '/')
  return commandLine
    .replaceAll(process.execPath, 'node')
    .replaceAll(root, '<gse-root>')
    .replaceAll(rootForward, '<gse-root>')
    .replace(/<gse-root>[\\/]/g, '<gse-root>/')
    .replace(/\\/g, '/')
}

const required = [
  'SKILL.md',
  'README.md',
  'README.zh-CN.md',
  'CHANGELOG.md',
  'references/packaging.md',
  'references/public-release.md',
  'references/release-trust.md',
  'references/marketplace-discovery.md',
  'scripts/validate-gse.mjs',
  'scripts/package-gse.mjs',
  'scripts/install-gse.mjs',
  'scripts/record-public-release.mjs',
  '.gse/releases/public-release-owner-required.md',
  '.gse/acceptance/public-acceptance-handoff.md',
  '.gse/acceptance/host-runtime-evidence-handoff.md',
]

const errors = []
for (const item of required) {
  if (!exists(item)) errors.push('missing required release-bundle input: ' + item)
}

const validation = errors.length === 0
  ? run(process.execPath, [path.join(root, 'scripts', 'validate-gse.mjs'), '--root', root, '--profile', 'standard', '--json'])
  : null
const validationData = validation ? parseJson(validation.stdout) : null
if (validation && validation.status !== 0) errors.push('validation command failed for release bundle readiness')
const validationChecks = Array.isArray(validationData?.checks)
  ? validationData.checks.map((item) => ({
      id: item.id,
      label: item.label,
      status: item.status,
      command: portableCommand(item.command),
      summary: item.summary ?? null,
    }))
  : Array.isArray(validationData?.results)
    ? validationData.results.map((item, index) => ({
        id: item.script ?? `profile-${index + 1}`,
        label: item.script ?? item.command ?? `profile check ${index + 1}`,
        status: item.ok ? 'passed' : 'failed',
        command: portableCommand(item.command),
        summary: item.summary ?? null,
      }))
  : []

const generatedAcceptanceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-release-bundle-acceptance-'))
const freshPublicAcceptanceHandoffPath = path.join(generatedAcceptanceRoot, 'public-acceptance-handoff.md')
const freshReleaseStatusManifestPath = path.join(generatedAcceptanceRoot, 'release-status-manifest.json')
const freshReleaseOwnerActionPlanPath = path.join(generatedAcceptanceRoot, 'release-owner-action-plan.md')
const freshPublicReleaseChecklistPath = path.join(generatedAcceptanceRoot, 'public-release-checklist.md')
const freshOwnerExternalGateKitPath = path.join(generatedAcceptanceRoot, 'owner-external-gate-kit')
const freshInstallablePackagePath = path.join(generatedAcceptanceRoot, 'installable-package')

if (errors.length === 0) {
  const publicAcceptanceHandoffGeneration = run(process.execPath, [
    path.join(root, 'scripts', 'generate-public-acceptance-handoff.mjs'),
    '--root',
    root,
    '--display-root',
    displayRoot,
    '--out',
    freshPublicAcceptanceHandoffPath,
    '--force',
    '--json',
  ])
  if (publicAcceptanceHandoffGeneration.status !== 0) {
    errors.push('public acceptance handoff generation failed for release bundle')
  }
  const manifestGeneration = run(process.execPath, [
    path.join(root, 'scripts', 'generate-release-status-manifest.mjs'),
    '--root',
    root,
    '--display-root',
    displayRoot,
    '--out',
    freshReleaseStatusManifestPath,
    '--force',
    '--json',
  ])
  if (manifestGeneration.status !== 0) {
    errors.push('release status manifest generation failed for release bundle')
  }
  const actionPlanGeneration = run(process.execPath, [
    path.join(root, 'scripts', 'generate-release-owner-action-plan.mjs'),
    '--root',
    root,
    '--manifest',
    freshReleaseStatusManifestPath,
    '--out',
    freshReleaseOwnerActionPlanPath,
    '--force',
    '--json',
  ])
  if (actionPlanGeneration.status !== 0) {
    errors.push('release owner action plan generation failed for release bundle')
  }
  const publicReleaseChecklistGeneration = run(process.execPath, [
    path.join(root, 'scripts', 'generate-public-release-checklist.mjs'),
    '--root',
    root,
    '--display-root',
    displayRoot,
    '--manifest',
    freshReleaseStatusManifestPath,
    '--out',
    freshPublicReleaseChecklistPath,
    '--force',
    '--json',
  ])
  if (publicReleaseChecklistGeneration.status !== 0) {
    errors.push('public release checklist generation failed for release bundle')
  }
  const ownerExternalGateKitGeneration = run(process.execPath, [
    path.join(root, 'scripts', 'generate-owner-external-gate-kit.mjs'),
    '--root',
    root,
    '--display-root',
    displayRoot,
    '--out',
    freshOwnerExternalGateKitPath,
    '--force',
    '--json',
  ])
  if (ownerExternalGateKitGeneration.status !== 0) {
    errors.push('owner/external gate kit generation failed for release bundle')
  }
  const packageGeneration = run(process.execPath, [
    path.join(root, 'scripts', 'package-gse.mjs'),
    '--root',
    root,
    '--out',
    freshInstallablePackagePath,
    '--label',
    label + '-installable',
    '--json',
  ])
  if (packageGeneration.status !== 0) {
    errors.push('installable package generation failed for release bundle')
  }
}

const publicReleaseRecord = read('.gse/releases/public-release-owner-required.md')
const publicAcceptanceHandoff = fs.existsSync(freshPublicAcceptanceHandoffPath) ? fs.readFileSync(freshPublicAcceptanceHandoffPath, 'utf8') : ''
const hostRuntimeEvidenceHandoff = read('.gse/acceptance/host-runtime-evidence-handoff.md')
const releaseStatusManifest = fs.existsSync(freshReleaseStatusManifestPath) ? fs.readFileSync(freshReleaseStatusManifestPath, 'utf8') : ''
const releaseOwnerActionPlan = fs.existsSync(freshReleaseOwnerActionPlanPath) ? fs.readFileSync(freshReleaseOwnerActionPlanPath, 'utf8') : ''
const publicReleaseChecklist = fs.existsSync(freshPublicReleaseChecklistPath) ? fs.readFileSync(freshPublicReleaseChecklistPath, 'utf8') : ''
function readFreshKit(fileName) {
  const fullPath = path.join(freshOwnerExternalGateKitPath, fileName)
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : ''
}
const releaseStatusData = parseJson(releaseStatusManifest)
const installablePackageManifestPath = path.join(freshInstallablePackagePath, 'gse-package-manifest.json')
const installablePackageManifest = fs.existsSync(installablePackageManifestPath)
  ? parseJson(fs.readFileSync(installablePackageManifestPath, 'utf8'))
  : null
const installablePackageHashes = fs.existsSync(freshInstallablePackagePath)
  ? collectFileHashes(freshInstallablePackagePath)
  : []
const licenseDecisionAccepted =
  publicReleaseRecord.includes('License status: selected') &&
  publicReleaseRecord.includes('SPDX identifier: MIT') &&
  publicReleaseRecord.includes('Evidence status: accepted')
const releaseSummary = [
  '# GSE Release Bundle',
  '',
  'Bundle label: ' + label,
  '',
  'Generated: ' + new Date().toISOString(),
  '',
  'Source root: ' + displayRoot,
  '',
  '## Readiness',
  '',
  'Status: verified for local package, URL install, signing mechanics, command semantics, public-release metadata, and release decision record.',
  '',
  'Accepted public release: not accepted until public security contact, public repository settings, public CI, public channel publication, and host runtime evidence are recorded.',
  '',
  '## License Decision',
  '',
  publicReleaseRecord.includes('License status: owner-required')
    ? 'License status: owner-required'
    : licenseDecisionAccepted
      ? 'License status: selected; SPDX identifier: MIT; Evidence status: accepted'
      : 'License status: unknown',
  '',
  '## Install Commands',
  '',
  'This bundle includes an installable package snapshot under `installable-package/`.',
  '',
  '```text',
  'node <skill>/scripts/install-gse.mjs --source <release-bundle>/installable-package --target <install-skill-dir>',
  'node <install-skill-dir>/scripts/validate-gse.mjs --root <install-skill-dir> --skip-skill-validator --skip-distribution --skip-completion-readiness --json',
  'node <install-skill-dir>/scripts/gse.mjs status --target <install-skill-dir> --json',
  '```',
  '',
  '## Verification Command',
  '',
  '```text',
  'node <skill>/scripts/validate-gse.mjs --root <skill> --json',
  '```',
  '',
  'Latest local bundle precheck: ' + (validationData?.summary?.status ?? 'not-run') + ', checks ' + (validationData?.summary ? `${validationData.summary.passed}/${validationData.summary.total}` : 'unknown'),
  '',
  'Validation manifest detail: `bundle-manifest.json` includes compact `validationChecks[]` entries for the checks that produced the precheck total.',
  '',
  '## Public Acceptance Handoff',
  '',
  'Use `public-acceptance-handoff.md` before public release handoff. It lists the owner/external gates that must be backed by real accepted evidence before public acceptance can be claimed.',
  '',
  '## Host Runtime Evidence Handoff',
  '',
  'Use `host-runtime-evidence-handoff.md` before claiming cross-host support. It lists host families, record commands, and anti-overclaim rules for native slash-command and portable command evidence.',
  '',
  'Run `audit-host-runtime-invocation-drill.mjs` before cross-host release handoff to verify record/audit mechanics without treating fixture records as real host evidence.',
  '',
  '## Release Status Manifest',
  '',
  'Use `release-status-manifest.json` when another host, CI job, marketplace checklist, or maintainer needs a machine-readable summary of verified capabilities and pending owner/external gates.',
  '',
  '## Release Owner Action Plan',
  '',
  'Use `release-owner-action-plan.md` when a human owner or maintainer needs the remaining public-release actions grouped by responsible party with exact record commands.',
  '',
  '## Public Release Checklist',
  '',
  'Use `public-release-checklist.md` when the owner needs a linear release runway from bundle preparation through repository, security, CI, registry, marketplace, host evidence, and final verification.',
  '',
  '## Owner / External Gate Kit',
  '',
  'Use `owner-external-gate-kit/` as the one-directory execution packet for the remaining owner-required and external-required gates. It includes final acceptance, public handoff, host runtime evidence, record commands, verification commands, and a machine-readable kit manifest.',
  '',
  '## External Evidence Not Included',
  '',
  '- Public marketplace approval or publication.',
  '- Public registry publication.',
  '- Legal suitability of a selected license.',
  '- Host-native slash-command runtime execution unless a host-specific invocation record exists.',
  '',
]

const files = {
  'release-summary.md': releaseSummary.join('\n'),
  'install-commands.md': [
    '# Install Commands',
    '',
    'This release bundle includes an installable GSE package snapshot.',
    '',
    '```text',
    'node <skill>/scripts/install-gse.mjs --source <release-bundle>/installable-package --target <install-skill-dir>',
    'node <install-skill-dir>/scripts/validate-gse.mjs --root <install-skill-dir> --skip-skill-validator --skip-distribution --skip-completion-readiness --json',
    'node <install-skill-dir>/scripts/gse.mjs status --target <install-skill-dir> --json',
    '```',
    '',
  ].join('\n'),
  'validation-checklist.md': [
    '# Validation Checklist',
    '',
    '- [ ] `validate-gse.mjs` passes in source environment.',
    '- [ ] `audit-distribution.mjs` passes for local package/install.',
    '- [ ] `audit-remote-distribution.mjs` passes for URL install and integrity.',
    '- [ ] `audit-signing.mjs` passes for signing mechanics.',
    '- [ ] `audit-public-release-metadata.mjs` passes.',
    '- [ ] MIT license decision is recorded; accepted public release still requires real owner/external evidence.',
    '- [ ] `public-acceptance-handoff.md` has been reviewed before public release handoff.',
    '- [ ] `host-runtime-evidence-handoff.md` has been reviewed before claiming cross-host or native slash-command support.',
    '- [ ] `audit-host-runtime-invocation-drill.mjs` passes before cross-host release handoff.',
    '- [ ] `release-status-manifest.json` has been regenerated from current audits before handoff.',
    '- [ ] `release-owner-action-plan.md` has been regenerated from current manifest before owner handoff.',
    '- [ ] `public-release-checklist.md` has been regenerated from current manifest before public release execution.',
    '- [ ] `owner-external-gate-kit/` has been generated and reviewed before owner/external handoff.',
    '- [ ] Host-native invocation is recorded per host before claiming host-native support.',
    '',
  ].join('\n'),
  'public-release-record.md': publicReleaseRecord,
  'public-acceptance-handoff.md': publicAcceptanceHandoff,
  'host-runtime-evidence-handoff.md': hostRuntimeEvidenceHandoff,
  'release-status-manifest.json': releaseStatusManifest,
  'release-owner-action-plan.md': releaseOwnerActionPlan,
  'public-release-checklist.md': publicReleaseChecklist,
  'owner-external-gate-kit/README.md': readFreshKit('README.md'),
  'owner-external-gate-kit/action-packet.md': readFreshKit('action-packet.md'),
  'owner-external-gate-kit/final-acceptance-packet.md': readFreshKit('final-acceptance-packet.md'),
  'owner-external-gate-kit/public-acceptance-handoff.md': readFreshKit('public-acceptance-handoff.md'),
  'owner-external-gate-kit/host-runtime-evidence-handoff.md': readFreshKit('host-runtime-evidence-handoff.md'),
  'owner-external-gate-kit/release-status-manifest.json': readFreshKit('release-status-manifest.json'),
  'owner-external-gate-kit/release-owner-action-plan.md': readFreshKit('release-owner-action-plan.md'),
  'owner-external-gate-kit/record-commands.md': readFreshKit('record-commands.md'),
  'owner-external-gate-kit/verification-commands.md': readFreshKit('verification-commands.md'),
  'owner-external-gate-kit/kit-manifest.json': readFreshKit('kit-manifest.json'),
  'checksums.sha256': installablePackageHashes
    .map((item) => `${item.sha256}  installable-package/${item.relativePath}`)
    .join('\n') + (installablePackageHashes.length ? '\n' : ''),
  'provenance.json': JSON.stringify({
    schemaVersion: 1,
    label,
    generatedAt: new Date().toISOString(),
    generator: 'scripts/generate-release-bundle.mjs',
    source: {
      displayRoot,
      packageName: 'gse',
      localSourcePathIncluded: false,
    },
    installablePackage: installablePackageManifest
      ? {
          path: 'installable-package/',
          manifest: 'installable-package/gse-package-manifest.json',
          fileCount: installablePackageManifest.fileCount,
          totalBytes: installablePackageManifest.totalBytes,
          packageDigest: installablePackageManifest.integrity?.packageDigest ?? null,
          algorithm: installablePackageManifest.integrity?.algorithm ?? null,
          cli: installablePackageManifest.entrypoints?.cli ?? null,
        }
      : null,
    validation: validationData?.summary ?? null,
    publicAcceptance: {
      status: releaseStatusData?.claimBoundary?.publicAccepted ?? 'not-accepted',
      pendingGates: releaseStatusData?.publicAcceptance?.pendingGates?.length ?? null,
    },
    claimBoundaries: [
      'This provenance is generated locally from the release bundle generator.',
      'It is not a registry attestation, Sigstore bundle, marketplace approval, public CI attestation, or host-runtime certificate.',
      'Public-final claims require accepted owner/external records and final readiness re-audit.',
    ],
    checksumsFile: 'checksums.sha256',
  }, null, 2) + '\n',
  'bundle-manifest.json': JSON.stringify({
    schemaVersion: 1,
    label,
    generatedAt: new Date().toISOString(),
    requiredInputs: required,
    validation: validationData?.summary ?? null,
    validationChecks,
    generatedAcceptanceInputs: {
      publicAcceptanceHandoff: 'generated during bundle creation',
      releaseStatusManifest: 'generated during bundle creation',
      releaseOwnerActionPlan: 'generated during bundle creation',
      ownerExternalGateKit: 'generated during bundle creation',
    },
    publicReleaseAcceptance: releaseStatusData?.claimBoundary?.publicAccepted ?? 'not-accepted',
    licenseDecision: licenseDecisionAccepted ? 'accepted' : 'owner-required',
    installablePackage: installablePackageManifest
      ? {
          path: 'installable-package/',
          manifest: 'installable-package/gse-package-manifest.json',
          fileCount: installablePackageManifest.fileCount,
          packageDigest: installablePackageManifest.integrity?.packageDigest ?? null,
          algorithm: installablePackageManifest.integrity?.algorithm ?? null,
          cli: installablePackageManifest.entrypoints?.cli ?? null,
        }
      : null,
    publicAcceptanceHandoff: 'included',
    hostRuntimeEvidenceHandoff: 'included',
    releaseStatusManifest: 'included',
    releaseOwnerActionPlan: 'included',
    ownerExternalGateKit: 'included',
    provenance: 'included',
    checksums: 'included',
    limits: [
      'Bundle does not publish GSE.',
      'Bundle does not choose a license.',
      'Bundle does not prove marketplace approval or host-native slash-command support.',
    ],
  }, null, 2) + '\n',
}

function copyDirectory(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) return
  fs.mkdirSync(targetDir, { recursive: true })
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)
    if (entry.isDirectory()) copyDirectory(sourcePath, targetPath)
    else if (entry.isFile()) fs.copyFileSync(sourcePath, targetPath)
  }
}

const report = {
  root,
  out,
  label,
  dryRun,
  status: errors.length > 0 ? 'failed' : dryRun ? 'ready' : 'written',
  errors,
  files: Object.keys(files),
  validation: validationData?.summary ?? null,
}

if (errors.length === 0 && !dryRun) {
  if (fs.existsSync(out) && !force) {
    report.status = 'exists'
    report.errors.push('output exists; use --force or choose another --out path')
  } else {
    if (fs.existsSync(out)) fs.rmSync(out, { recursive: true, force: true })
    fs.mkdirSync(out, { recursive: true })
    for (const [fileName, content] of Object.entries(files)) {
      const fullPath = path.join(out, fileName)
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, content, 'utf8')
    }
    copyDirectory(freshInstallablePackagePath, path.join(out, 'installable-package'))
  }
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else {
  console.log('Release bundle status: ' + report.status)
  console.log('Output: ' + report.out)
  if (report.errors.length) {
    console.log('Errors:')
    for (const error of report.errors) console.log('- ' + error)
  }
}

fs.rmSync(generatedAcceptanceRoot, { recursive: true, force: true })

if (report.status === 'failed' || report.status === 'exists') process.exit(1)
