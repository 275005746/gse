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
const target = path.resolve(readArg('--target', root))
const validationProfile = readArg('--profile', 'full')
const jsonOnly = args.includes('--json')
const skipSkillValidator = args.includes('--skip-skill-validator')
const skipDistribution = args.includes('--skip-distribution')
const skipCompletionReadiness = args.includes('--skip-completion-readiness')
const skipReleaseBundle = args.includes('--skip-release-bundle')
const skipFinalFormStaleCopy = args.includes('--skip-final-form-stale-copy')
const skipLocalFinalFormCompletion = args.includes('--skip-local-final-form-completion')
const distributionProfile = readArg('--distribution-profile', 'full')
const maxCommandMs = readArg('--max-command-ms', null)
const allowedValidationProfiles = new Set(['lite', 'standard', 'enterprise', 'release', 'full'])
if (!allowedValidationProfiles.has(validationProfile)) {
  console.error('Unsupported --profile. Expected lite, standard, enterprise, release, or full.')
  process.exit(1)
}
if (!['smoke', 'full'].includes(distributionProfile)) {
  console.error('Unsupported --distribution-profile. Expected smoke or full.')
  process.exit(1)
}

if (validationProfile !== 'full') {
  const startedMs = Date.now()
  const profileArgs = [
    path.join(root, 'scripts', 'run-validation-profile.mjs'),
    '--root',
    root,
    '--target',
    target,
    '--profile',
    validationProfile,
  ]
  if (maxCommandMs !== null) profileArgs.push('--max-command-ms', maxCommandMs)
  profileArgs.push('--json')
  const delegated = spawnSync(process.execPath, profileArgs, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  const stdout = (delegated.stdout ?? '').trim()
  let delegatedReport = null
  try {
    delegatedReport = JSON.parse(stdout)
  } catch {
    delegatedReport = null
  }
  const durationMs = Date.now() - startedMs
  const report = delegatedReport
    ? {
        ...delegatedReport,
        entrypoint: 'validate-gse',
        validationMode: 'profile',
        delegatedTo: 'scripts/run-validation-profile.mjs',
        summary: {
          ...delegatedReport.summary,
          durationMs: delegatedReport.summary?.durationMs ?? durationMs,
        },
        limits: [
          ...(delegatedReport.limits ?? []),
          'validate-gse --profile delegates to run-validation-profile.mjs so ordinary CI and daily development can avoid full release/distribution validation cost.',
          'Use --profile full, or omit --profile, for the historical consolidated validator.',
        ],
      }
    : {
        root,
        target,
        entrypoint: 'validate-gse',
        validationMode: 'profile',
        delegatedTo: 'scripts/run-validation-profile.mjs',
        profile: validationProfile,
        generatedAt: new Date().toISOString(),
        summary: {
          status: 'failed',
          passed: 0,
          failed: 1,
          total: 1,
          durationMs,
        },
        stderr: (delegated.stderr ?? '').trim(),
        stdout,
        limits: [
          'validate-gse --profile delegates to run-validation-profile.mjs.',
        ],
      }
  if (jsonOnly) console.log(JSON.stringify(report, null, 2))
  else console.log(renderDelegatedMarkdown(report))
  process.exit(delegated.status ?? (report.summary.status === 'passed' ? 0 : 1))
}

function renderDelegatedMarkdown(data) {
  const lines = []
  lines.push('# GSE Validation')
  lines.push('')
  lines.push('Generated: ' + (data.generatedAt ?? new Date().toISOString()))
  lines.push('Root: ' + data.root)
  lines.push('Target: ' + data.target)
  lines.push('Profile: ' + data.profile)
  lines.push('Mode: profile')
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + ' passed, ' + data.summary.failed + ' failed, ' + data.summary.total + ' total')
  if (Number.isFinite(data.summary.durationMs)) lines.push('- Duration: ' + data.summary.durationMs + ' ms')
  if (data.summary.slowestChecks?.length) {
    lines.push('- Slowest checks: ' + data.summary.slowestChecks.map((item) => (item.script ?? item.id) + ' (' + item.durationMs + ' ms)').join(', '))
  }
  lines.push('')
  lines.push('## Limits')
  lines.push('')
  for (const item of data.limits ?? []) lines.push('- ' + item)
  return lines.join('\n') + '\n'
}
const optionalPackageValidator = readArg(
  '--skill-validator',
  path.resolve(root, 'scripts', 'quick_validate.py'),
)

const validationStartedMs = Date.now()
const commandDurations = new Map()

function run(command, commandArgs, options = {}) {
  const startedMs = Date.now()
  const startedAt = new Date().toISOString()
  const commandLine = [command, ...commandArgs].join(' ')
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  })
  const durationMs = Date.now() - startedMs
  commandDurations.set(commandLine, durationMs)
  return {
    command: commandLine,
    status: result.status ?? 1,
    signal: result.signal ?? null,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs,
  }
}

function parseJson(stdout) {
  try {
    return JSON.parse(stdout)
  } catch {
    return null
  }
}

function adoptionSummaryFailures(report) {
  const failures = []
  const allowedClassifications = new Set([
    'gse-ready',
    'gse-ready-with-soft-warnings',
    'target-local-adoption-hygiene',
    'target-hard-failure',
  ])
  for (const target of report?.targets ?? []) {
    const summary = target.adoptionSummary
    if (!summary || typeof summary !== 'object') {
      failures.push(`${target.id}:missing adoptionSummary`)
      continue
    }
    if (!allowedClassifications.has(summary.classification)) failures.push(`${target.id}:invalid classification`)
    if (typeof summary.gseCoreGap !== 'boolean') failures.push(`${target.id}:gseCoreGap not boolean`)
    if (summary.coreGapAssessment !== 'not-assessed-by-target-drill') failures.push(`${target.id}:missing coreGapAssessment boundary`)
    if (typeof summary.portableContinueUsable !== 'boolean') failures.push(`${target.id}:portableContinueUsable not boolean`)
    if (!['not-proven', 'verified', 'external-required', 'unknown'].includes(summary.hostNativeSlashCommand)) failures.push(`${target.id}:invalid hostNativeSlashCommand`)
    if (!['low', 'risk-dump-needs-compaction', 'unknown'].includes(summary.longPromptRisk)) failures.push(`${target.id}:invalid longPromptRisk`)
    if (!Array.isArray(summary.topLocalIssues)) failures.push(`${target.id}:topLocalIssues not array`)
    if (!summary.repairPlan || typeof summary.repairPlan !== 'object') failures.push(`${target.id}:missing repairPlan`)
    if (summary.repairPlan && typeof summary.repairPlan.repairBlockedByDirtyGse !== 'boolean') failures.push(`${target.id}:repairBlockedByDirtyGse not boolean`)
    if (summary.repairPlan && typeof summary.repairPlan.repairBlockedByDirtyWorktree !== 'boolean') failures.push(`${target.id}:repairBlockedByDirtyWorktree not boolean`)
    if (summary.repairPlan && typeof summary.repairPlan.dirtyTargetWorktree !== 'boolean') failures.push(`${target.id}:dirtyTargetWorktree not boolean`)
    if (summary.repairPlan && !Array.isArray(summary.repairPlan.steps)) failures.push(`${target.id}:repairPlan steps not array`)
    if (!Array.isArray(summary.recommendedNextActions)) failures.push(`${target.id}:recommendedNextActions not array`)
    if (summary.repairPlan?.repairBlockedByDirtyWorktree) {
      const firstAction = String(summary.recommendedNextActions?.[0] ?? '')
      if (!firstAction.includes('worktree ownership')) failures.push(`${target.id}:dirty repair does not prioritize worktree ownership`)
    }
    if (summary.classification === 'target-local-adoption-hygiene' && summary.topLocalIssues.length === 0) failures.push(`${target.id}:local hygiene without issue source`)
  }
  return failures
}

function checkBom() {
  const roots = ['SKILL.md', 'references', 'assets', '.gse', '.learnings', 'examples', 'agents', 'scripts']
  const extensions = new Set(['.md', '.yaml', '.yml', '.mjs'])
  const bad = []
  let scanned = 0

  function visit(itemPath) {
    if (!fs.existsSync(itemPath)) return
    const stat = fs.statSync(itemPath)
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(itemPath)) visit(path.join(itemPath, child))
      return
    }
    if (!stat.isFile()) return
    if (!extensions.has(path.extname(itemPath)) && path.basename(itemPath) !== 'SKILL.md') return
    scanned += 1
    const bytes = fs.readFileSync(itemPath)
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      bad.push(path.relative(root, itemPath).replace(/\\/g, '/'))
    }
  }

  for (const relativePath of roots) visit(path.join(root, relativePath))
  return {
    scanned,
    status: bad.length === 0 ? 'passed' : 'failed',
    bad,
  }
}

function compactAuditGse(runResult) {
  const data = parseJson(runResult.stdout)
  if (!data) return null
  return {
    score: data.totals?.score,
    present: data.totals?.present,
    total: data.totals?.total,
    strong: data.totals?.strong,
    areas: data.areas?.length,
  }
}

function compactAuditProject(runResult) {
  const data = parseJson(runResult.stdout)
  if (!data) return null
  return {
    status: data.summary?.status,
    modes: data.summary ? data.summary.passed + '/' + data.summary.total : null,
    bootstrapScaffold: data.workflows?.bootstrapScaffold,
    rerunSafety: data.workflows?.rerunSafety,
    autoModeSelection: data.workflows?.autoModeSelection,
  }
}

function compactAuditFixtures(runResult) {
  const data = parseJson(runResult.stdout)
  if (!data) return null
  return {
    status: data.summary?.status,
    checks: data.summary ? data.summary.passed + '/' + data.summary.total : null,
    projectProfileDiscovery: data.workflows?.projectProfileDiscovery,
    hostAdapterAndDrift: data.workflows?.hostAdapterAndDrift,
  }
}

const checks = []

for (const [id, label, script] of [
  ['validate-core-01', 'Core contract audit', 'audit-core-contracts.mjs'],
  ['validate-core-02', 'Core compatibility audit', 'audit-core-compatibility.mjs'],
  ['validate-core-03', 'Core transaction audit', 'audit-core-transactions.mjs'],
]) {
  const audit = run(process.execPath, [path.join(root, 'scripts', script), '--root', root, '--json'])
  const data = parseJson(audit.stdout)
  checks.push({
    id,
    label,
    status: audit.status === 0 && data?.summary?.failed === 0 ? 'passed' : 'failed',
    command: audit.command,
    summary: data?.summary ?? null,
    stderr: audit.stderr,
  })
}

const auditGse = run(process.execPath, [path.join(root, 'scripts', 'audit-gse.mjs'), '--root', root, '--json'])
checks.push({
  id: 'validate-01',
  label: 'structural self-audit',
  status: auditGse.status === 0 ? 'passed' : 'failed',
  command: auditGse.command,
  summary: compactAuditGse(auditGse),
  stderr: auditGse.stderr,
})

const auditProject = run(process.execPath, [path.join(root, 'scripts', 'audit-project.mjs'), '--root', root, '--json'])
checks.push({
  id: 'validate-02',
  label: 'project bootstrap smoke',
  status: auditProject.status === 0 ? 'passed' : 'failed',
  command: auditProject.command,
  summary: compactAuditProject(auditProject),
  stderr: auditProject.stderr,
})

const auditFixtures = run(process.execPath, [path.join(root, 'scripts', 'audit-fixtures.mjs'), '--root', root, '--json'])
checks.push({
  id: 'validate-03',
  label: 'fixture adoption smoke',
  status: auditFixtures.status === 0 ? 'passed' : 'failed',
  command: auditFixtures.command,
  summary: compactAuditFixtures(auditFixtures),
  stderr: auditFixtures.stderr,
})

let validatorSummary = { status: 'skipped', reason: 'skipped by --skip-skill-validator' }
if (!skipSkillValidator) {
  if (!fs.existsSync(optionalPackageValidator)) {
    validatorSummary = { status: 'skipped', reason: 'package validator not found', path: optionalPackageValidator }
  } else {
    const pyProbe = run('py', ['-c', 'print(123)'])
    if (pyProbe.status !== 0) {
      validatorSummary = { status: 'skipped', reason: 'py is unavailable or failed', probeStatus: pyProbe.status, stderr: pyProbe.stderr }
    } else {
      const validator = run('py', [optionalPackageValidator, root])
      validatorSummary = {
        status: validator.status === 0 ? 'passed' : 'failed',
        command: validator.command,
        stdout: validator.stdout,
        stderr: validator.stderr,
      }
    }
  }
}
const auditAdoption = run(process.execPath, [path.join(root, 'scripts', 'audit-adoption.mjs'), '--root', root, '--json'])
const adoptionData = parseJson(auditAdoption.stdout)
checks.push({
  id: 'validate-04',
  label: 'existing repo adoption smoke',
  status: auditAdoption.status === 0 ? 'passed' : 'failed',
  command: auditAdoption.command,
  summary: adoptionData
    ? { status: adoptionData.summary?.status, checks: adoptionData.summary ? adoptionData.summary.passed + '/' + adoptionData.summary.total : null, existingRepoDiscovery: adoptionData.workflows?.existingRepoDiscovery, nonOverwriteSafety: adoptionData.workflows?.nonOverwriteSafety }
    : null,
  stderr: auditAdoption.stderr,
})
const auditHostAdapters = run(process.execPath, [path.join(root, 'scripts', 'audit-host-adapters.mjs'), '--root', root, '--json'])
const hostAdapterData = parseJson(auditHostAdapters.stdout)
checks.push({
  id: 'validate-05',
  label: 'host adapter generation smoke',
  status: auditHostAdapters.status === 0 ? 'passed' : 'failed',
  command: auditHostAdapters.command,
  summary: hostAdapterData
    ? { status: hostAdapterData.summary?.status, checks: hostAdapterData.summary ? hostAdapterData.summary.passed + '/' + hostAdapterData.summary.total : null, hostAdapterGeneration: hostAdapterData.workflows?.hostAdapterGeneration }
    : null,
  stderr: auditHostAdapters.stderr,
})
const auditCompatibility = run(process.execPath, [path.join(root, 'scripts', 'audit-compatibility.mjs'), '--root', root, '--json'])
const compatibilityData = parseJson(auditCompatibility.stdout)
checks.push({
  id: 'validate-06',
  label: 'compatibility matrix audit',
  status: auditCompatibility.status === 0 ? 'passed' : 'failed',
  command: auditCompatibility.command,
  summary: compatibilityData
    ? { status: compatibilityData.summary?.status, checks: compatibilityData.summary ? compatibilityData.summary.passed + '/' + compatibilityData.summary.total : null, compatibilityMatrix: compatibilityData.workflows?.compatibilityMatrix }
    : null,
  stderr: auditCompatibility.stderr,
})
const forwardTestGse = run(process.execPath, [path.join(root, 'scripts', 'forward-test-gse.mjs'), '--root', root, '--json'])
const forwardTestData = parseJson(forwardTestGse.stdout)
checks.push({
  id: 'validate-07',
  label: 'documented fixture forward test',
  status: forwardTestGse.status === 0 ? 'passed' : 'failed',
  command: forwardTestGse.command,
  summary: forwardTestData
    ? { status: forwardTestData.summary?.status, checks: forwardTestData.summary ? forwardTestData.summary.passed + '/' + forwardTestData.summary.total : null, evidenceStatus: forwardTestData.evidenceStatus, acceptedBy: forwardTestData.acceptedBy }
    : null,
  stderr: forwardTestGse.stderr,
})
const freshSessionReadiness = run(process.execPath, [path.join(root, 'scripts', 'audit-fresh-session-readiness.mjs'), '--root', root, '--json'])
const freshSessionData = parseJson(freshSessionReadiness.stdout)
checks.push({
  id: 'validate-08',
  label: 'fresh-session readiness probe',
  status: freshSessionReadiness.status === 0 ? 'passed' : 'failed',
  command: freshSessionReadiness.command,
  summary: freshSessionData
    ? { status: freshSessionData.summary?.status, checks: freshSessionData.summary ? freshSessionData.summary.passed + '/' + freshSessionData.summary.total : null, freshSessionReadiness: freshSessionData.workflows?.freshSessionReadiness, freshSessionAcceptance: freshSessionData.workflows?.freshSessionAcceptance }
    : null,
  stderr: freshSessionReadiness.stderr,
})
const releaseReadiness = run(process.execPath, [path.join(root, 'scripts', 'audit-release-readiness.mjs'), '--root', root, '--json'])
const releaseData = parseJson(releaseReadiness.stdout)
checks.push({
  id: 'validate-09',
  label: 'release packaging readiness audit',
  status: releaseReadiness.status === 0 ? 'passed' : 'failed',
  command: releaseReadiness.command,
  summary: releaseData
    ? { status: releaseData.summary?.status, checks: releaseData.summary ? releaseData.summary.passed + '/' + releaseData.summary.total : null, releasePackagingReadiness: releaseData.workflows?.releasePackagingReadiness, releaseReadiness: releaseData.releaseReadiness, acceptedBy: releaseData.acceptedBy }
    : null,
  stderr: releaseReadiness.stderr,
})
const npmPackageMetadata = run(process.execPath, [path.join(root, 'scripts', 'audit-npm-package-metadata.mjs'), '--root', root, '--json'])
const npmPackageData = parseJson(npmPackageMetadata.stdout)
checks.push({
  id: 'validate-09a',
  label: 'Node package metadata and npm pack dry-run audit',
  status: npmPackageMetadata.status === 0 ? 'passed' : 'failed',
  command: npmPackageMetadata.command,
  summary: npmPackageData
    ? { status: npmPackageData.summary?.status, checks: npmPackageData.summary ? npmPackageData.summary.passed + '/' + npmPackageData.summary.total : null, npmPackageMetadata: npmPackageData.workflows?.npmPackageMetadata, npmPackDryRun: npmPackageData.workflows?.npmPackDryRun }
    : null,
  stderr: npmPackageMetadata.stderr,
})
const npmTarballInstall = run(process.execPath, [path.join(root, 'scripts', 'audit-npm-tarball-install.mjs'), '--root', root, '--json'])
const npmTarballInstallData = parseJson(npmTarballInstall.stdout)
checks.push({
  id: 'validate-09a2',
  label: 'Node package tarball install audit',
  status: npmTarballInstall.status === 0 ? 'passed' : 'failed',
  command: npmTarballInstall.command,
  summary: npmTarballInstallData
    ? { status: npmTarballInstallData.summary?.status, checks: npmTarballInstallData.summary ? npmTarballInstallData.summary.passed + '/' + npmTarballInstallData.summary.total : null, npmTarballInstall: npmTarballInstallData.workflows?.npmTarballInstall, installedBin: npmTarballInstallData.workflows?.installedBin }
    : null,
  stderr: npmTarballInstall.stderr,
})
const npmPublishDryRun = run(process.execPath, [path.join(root, 'scripts', 'audit-npm-publish-dry-run.mjs'), '--root', root, '--json'])
const npmPublishDryRunData = parseJson(npmPublishDryRun.stdout)
checks.push({
  id: 'validate-09a3',
  label: 'Node package publish dry-run audit',
  status: npmPublishDryRun.status === 0 ? 'passed' : 'failed',
  command: npmPublishDryRun.command,
  summary: npmPublishDryRunData
    ? { status: npmPublishDryRunData.summary?.status, checks: npmPublishDryRunData.summary ? npmPublishDryRunData.summary.passed + '/' + npmPublishDryRunData.summary.total : null, npmPublishDryRun: npmPublishDryRunData.workflows?.npmPublishDryRun, registryPublication: npmPublishDryRunData.workflows?.registryPublication }
    : null,
  stderr: npmPublishDryRun.stderr,
})
const releaseTrust = run(process.execPath, [path.join(root, 'scripts', 'audit-release-trust.mjs'), '--root', root, '--json'])
const releaseTrustData = parseJson(releaseTrust.stdout)
checks.push({
  id: 'validate-09b',
  label: 'release trust and key custody policy audit',
  status: releaseTrust.status === 0 ? 'passed' : 'failed',
  command: releaseTrust.command,
  summary: releaseTrustData
    ? { status: releaseTrustData.summary?.status, checks: releaseTrustData.summary ? releaseTrustData.summary.passed + '/' + releaseTrustData.summary.total : null, releaseTrustPolicy: releaseTrustData.workflows?.releaseTrustPolicy }
    : null,
  stderr: releaseTrust.stderr,
})
const publicReleaseMetadata = run(process.execPath, [path.join(root, 'scripts', 'audit-public-release-metadata.mjs'), '--root', root, '--json'])
const publicReleaseData = parseJson(publicReleaseMetadata.stdout)
checks.push({
  id: 'validate-09d',
  label: 'public release metadata audit',
  status: publicReleaseMetadata.status === 0 ? 'passed' : 'failed',
  command: publicReleaseMetadata.command,
  summary: publicReleaseData
    ? { status: publicReleaseData.summary?.status, checks: publicReleaseData.summary ? publicReleaseData.summary.passed + '/' + publicReleaseData.summary.total : null, publicReleaseMetadata: publicReleaseData.workflows?.publicReleaseMetadata, publicReleaseAcceptance: publicReleaseData.workflows?.publicReleaseAcceptance }
    : null,
  stderr: publicReleaseMetadata.stderr,
})
const openSourceDefaults = run(process.execPath, [path.join(root, 'scripts', 'audit-open-source-defaults.mjs'), '--root', root, '--json'])
const openSourceDefaultsData = parseJson(openSourceDefaults.stdout)
checks.push({
  id: 'validate-09d2',
  label: 'open-source defaults audit',
  status: openSourceDefaults.status === 0 ? 'passed' : 'failed',
  command: openSourceDefaults.command,
  summary: openSourceDefaultsData
    ? { status: openSourceDefaultsData.summary?.status, checks: openSourceDefaultsData.summary ? openSourceDefaultsData.summary.passed + '/' + openSourceDefaultsData.summary.total : null, openSourceDefaults: openSourceDefaultsData.workflows?.openSourceDefaults, licenseDecision: openSourceDefaultsData.workflows?.licenseDecision }
    : null,
  stderr: openSourceDefaults.stderr,
})
const publicReleaseRecord = run(process.execPath, [path.join(root, 'scripts', 'record-public-release.mjs'), '--root', root, '--license-status', 'owner-required', '--dry-run', '--json'])
const publicReleaseRecordData = parseJson(publicReleaseRecord.stdout)
checks.push({
  id: 'validate-09e',
  label: 'public release record command dry-run',
  status: publicReleaseRecord.status === 0 && publicReleaseRecordData?.status === 'ready' ? 'passed' : 'failed',
  command: publicReleaseRecord.command,
  summary: publicReleaseRecordData
    ? { status: publicReleaseRecordData.status, licenseStatus: publicReleaseRecordData.licenseStatus, evidenceStatus: publicReleaseRecordData.evidenceStatus }
    : null,
  stderr: publicReleaseRecord.stderr,
})
const publicReleaseDecision = run(process.execPath, [path.join(root, 'scripts', 'audit-public-release-decision.mjs'), '--root', root, '--json'])
const publicReleaseDecisionData = parseJson(publicReleaseDecision.stdout)
checks.push({
  id: 'validate-09h',
  label: 'public release decision lifecycle audit',
  status: publicReleaseDecision.status === 0 ? 'passed' : 'failed',
  command: publicReleaseDecision.command,
  summary: publicReleaseDecisionData
    ? { status: publicReleaseDecisionData.summary?.status, checks: publicReleaseDecisionData.summary ? publicReleaseDecisionData.summary.passed + '/' + publicReleaseDecisionData.summary.total : null, publicReleaseDecisionLifecycle: publicReleaseDecisionData.workflows?.publicReleaseDecisionLifecycle }
    : null,
  stderr: publicReleaseDecision.stderr,
})
const evidencePlaceholders = run(process.execPath, [path.join(root, 'scripts', 'audit-evidence-placeholders.mjs'), '--root', root, '--json'])
const evidencePlaceholdersData = parseJson(evidencePlaceholders.stdout)
checks.push({
  id: 'validate-09o',
  label: 'public evidence placeholder helper audit',
  status: evidencePlaceholders.status === 0 ? 'passed' : 'failed',
  command: evidencePlaceholders.command,
  summary: evidencePlaceholdersData
    ? { status: evidencePlaceholdersData.summary?.status, checks: evidencePlaceholdersData.summary ? evidencePlaceholdersData.summary.passed + '/' + evidencePlaceholdersData.summary.total : null, evidencePlaceholderHelper: evidencePlaceholdersData.workflows?.evidencePlaceholderHelper }
    : null,
  stderr: evidencePlaceholders.stderr,
})
const publicCiRun = run(process.execPath, [path.join(root, 'scripts', 'audit-public-ci-run.mjs'), '--root', root, '--json'])
const publicCiRunData = parseJson(publicCiRun.stdout)
checks.push({
  id: 'validate-09n',
  label: 'public CI run record audit',
  status: publicCiRun.status === 0 ? 'passed' : 'failed',
  command: publicCiRun.command,
  summary: publicCiRunData
    ? { status: publicCiRunData.summary?.status, checks: publicCiRunData.summary ? publicCiRunData.summary.passed + '/' + publicCiRunData.summary.total : null, recordCommand: 'record-public-ci-run.mjs', publicCiRunRecord: publicCiRunData.workflows?.publicCiRunRecord, acceptedPublicCiRun: publicCiRunData.workflows?.acceptedPublicCiRun }
    : null,
  stderr: publicCiRun.stderr,
})
const publicSecurityContact = run(process.execPath, [path.join(root, 'scripts', 'audit-public-security-contact.mjs'), '--root', root, '--json'])
const publicSecurityContactData = parseJson(publicSecurityContact.stdout)
checks.push({
  id: 'validate-09l',
  label: 'public security contact record audit',
  status: publicSecurityContact.status === 0 ? 'passed' : 'failed',
  command: publicSecurityContact.command,
  summary: publicSecurityContactData
    ? { status: publicSecurityContactData.summary?.status, checks: publicSecurityContactData.summary ? publicSecurityContactData.summary.passed + '/' + publicSecurityContactData.summary.total : null, recordCommand: 'record-public-security-contact.mjs', publicSecurityContact: publicSecurityContactData.workflows?.publicSecurityContact, acceptedSecurityContact: publicSecurityContactData.workflows?.acceptedSecurityContact }
    : null,
  stderr: publicSecurityContact.stderr,
})
const publicRepositorySettings = run(process.execPath, [path.join(root, 'scripts', 'audit-public-repository-settings.mjs'), '--root', root, '--json'])
const publicRepositorySettingsData = parseJson(publicRepositorySettings.stdout)
checks.push({
  id: 'validate-09k',
  label: 'public repository settings record audit',
  status: publicRepositorySettings.status === 0 ? 'passed' : 'failed',
  command: publicRepositorySettings.command,
  summary: publicRepositorySettingsData
    ? { status: publicRepositorySettingsData.summary?.status, checks: publicRepositorySettingsData.summary ? publicRepositorySettingsData.summary.passed + '/' + publicRepositorySettingsData.summary.total : null, recordCommand: 'record-public-repository-settings.mjs', publicRepositorySettings: publicRepositorySettingsData.workflows?.publicRepositorySettings, acceptedRepositorySettings: publicRepositorySettingsData.workflows?.acceptedRepositorySettings }
    : null,
  stderr: publicRepositorySettings.stderr,
})
const publicChannelPublication = run(process.execPath, [path.join(root, 'scripts', 'audit-public-channel-publication.mjs'), '--root', root, '--json'])
const publicChannelPublicationData = parseJson(publicChannelPublication.stdout)
checks.push({
  id: 'validate-09m',
  label: 'public channel publication record audit',
  status: publicChannelPublication.status === 0 ? 'passed' : 'failed',
  command: publicChannelPublication.command,
  summary: publicChannelPublicationData
    ? { status: publicChannelPublicationData.summary?.status, checks: publicChannelPublicationData.summary ? publicChannelPublicationData.summary.passed + '/' + publicChannelPublicationData.summary.total : null, recordCommand: 'record-public-channel-publication.mjs', publicChannelPublication: publicChannelPublicationData.workflows?.publicChannelPublication, acceptedRegistryPublication: publicChannelPublicationData.workflows?.acceptedRegistryPublication, acceptedMarketplaceApproval: publicChannelPublicationData.workflows?.acceptedMarketplaceApproval }
    : null,
  stderr: publicChannelPublication.stderr,
})
if (skipReleaseBundle) {
  checks.push({
    id: 'validate-09f',
    label: 'release bundle generation audit',
    status: 'skipped',
    command: null,
    summary: { status: 'skipped', reason: 'skipped by --skip-release-bundle', generator: 'scripts/generate-release-bundle.mjs' },
    stderr: '',
  })
} else {
const releaseBundle = run(process.execPath, [path.join(root, 'scripts', 'audit-release-bundle.mjs'), '--root', root, '--json'])
  const releaseBundleData = parseJson(releaseBundle.stdout)
  checks.push({
    id: 'validate-09f',
    label: 'release bundle generation audit',
    status: releaseBundle.status === 0 ? 'passed' : 'failed',
    command: releaseBundle.command,
    summary: releaseBundleData
      ? { status: releaseBundleData.summary?.status, checks: releaseBundleData.summary ? releaseBundleData.summary.passed + '/' + releaseBundleData.summary.total : null, releaseBundle: releaseBundleData.workflows?.releaseBundle }
      : null,
    stderr: releaseBundle.stderr,
  })
}
const openSourceReadiness = run(process.execPath, [path.join(root, 'scripts', 'audit-open-source-readiness.mjs'), '--root', root, '--json'])
const openSourceData = parseJson(openSourceReadiness.stdout)
checks.push({
  id: 'validate-09g',
  label: 'open-source repository readiness audit',
  status: openSourceReadiness.status === 0 ? 'passed' : 'failed',
  command: openSourceReadiness.command,
  summary: openSourceData
    ? { status: openSourceData.summary?.status, checks: openSourceData.summary ? openSourceData.summary.passed + '/' + openSourceData.summary.total : null, openSourceReadiness: openSourceData.workflows?.openSourceReadiness }
    : null,
  stderr: openSourceReadiness.stderr,
})
const ciReadiness = run(process.execPath, [path.join(root, 'scripts', 'audit-ci-readiness.mjs'), '--root', root, '--json'])
const ciData = parseJson(ciReadiness.stdout)
checks.push({
  id: 'validate-09i',
  label: 'CI workflow readiness audit',
  status: ciReadiness.status === 0 ? 'passed' : 'failed',
  command: ciReadiness.command,
  summary: ciData
    ? { status: ciData.summary?.status, checks: ciData.summary ? ciData.summary.passed + '/' + ciData.summary.total : null, ciWorkflowTemplate: ciData.workflows?.ciWorkflowTemplate, publicCiRun: ciData.workflows?.publicCiRun }
    : null,
  stderr: ciReadiness.stderr,
})
const publicCollaborationTemplates = run(process.execPath, [path.join(root, 'scripts', 'audit-public-collaboration-templates.mjs'), '--root', root, '--json'])
const publicCollaborationData = parseJson(publicCollaborationTemplates.stdout)
checks.push({
  id: 'validate-09j',
  label: 'public collaboration template audit',
  status: publicCollaborationTemplates.status === 0 ? 'passed' : 'failed',
  command: publicCollaborationTemplates.command,
  summary: publicCollaborationData
    ? { status: publicCollaborationData.summary?.status, checks: publicCollaborationData.summary ? publicCollaborationData.summary.passed + '/' + publicCollaborationData.summary.total : null, publicCollaborationTemplates: publicCollaborationData.workflows?.publicCollaborationTemplates }
    : null,
  stderr: publicCollaborationTemplates.stderr,
})
const marketplaceDiscovery = run(process.execPath, [path.join(root, 'scripts', 'audit-marketplace-discovery.mjs'), '--root', root, '--json'])
const marketplaceDiscoveryData = parseJson(marketplaceDiscovery.stdout)
checks.push({
  id: 'validate-09c',
  label: 'marketplace discovery metadata audit',
  status: marketplaceDiscovery.status === 0 ? 'passed' : 'failed',
  command: marketplaceDiscovery.command,
  summary: marketplaceDiscoveryData
    ? { status: marketplaceDiscoveryData.summary?.status, checks: marketplaceDiscoveryData.summary ? marketplaceDiscoveryData.summary.passed + '/' + marketplaceDiscoveryData.summary.total : null, marketplaceDiscovery: marketplaceDiscoveryData.workflows?.marketplaceDiscovery }
    : null,
  stderr: marketplaceDiscovery.stderr,
})
if (skipDistribution) {
  checks.push({
    id: 'validate-10',
    label: 'local package and install distribution audit',
    status: 'skipped',
    command: null,
    summary: { status: 'skipped', reason: 'skipped by --skip-distribution' },
    stderr: '',
  })
  checks.push({
    id: 'validate-10b',
    label: 'remote URL distribution and integrity audit',
    status: 'skipped',
    command: null,
    summary: { status: 'skipped', reason: 'skipped by --skip-distribution' },
    stderr: '',
  })
  checks.push({
    id: 'validate-10c',
    label: 'package signing and verification audit',
    status: 'skipped',
    command: null,
    summary: { status: 'skipped', reason: 'skipped by --skip-distribution' },
    stderr: '',
  })
} else {
  const distributionReadiness = run(process.execPath, [path.join(root, 'scripts', 'audit-distribution.mjs'), '--root', root, '--profile', distributionProfile, '--json'])
  const distributionData = parseJson(distributionReadiness.stdout)
  checks.push({
    id: 'validate-10',
    label: 'local package and install distribution audit',
    status: distributionReadiness.status === 0 ? 'passed' : 'failed',
    command: distributionReadiness.command,
    summary: distributionData
      ? { status: distributionData.summary?.status, profile: distributionData.profile, checks: distributionData.summary ? distributionData.summary.passed + ' passed, ' + distributionData.summary.failed + ' failed, ' + distributionData.summary.skipped + ' skipped, ' + distributionData.summary.total + ' total' : null, localPackage: distributionData.workflows?.localPackage, localInstall: distributionData.workflows?.localInstall, installedValidation: distributionData.workflows?.installedValidation }
      : null,
    stderr: distributionReadiness.stderr,
  })
  const remoteDistribution = run(process.execPath, [path.join(root, 'scripts', 'audit-remote-distribution.mjs'), '--root', root, '--profile', distributionProfile, '--json'])
  const remoteDistributionData = parseJson(remoteDistribution.stdout)
  checks.push({
    id: 'validate-10b',
    label: 'remote URL distribution and integrity audit',
    status: remoteDistribution.status === 0 ? 'passed' : 'failed',
    command: remoteDistribution.command,
    summary: remoteDistributionData
      ? { status: remoteDistributionData.summary?.status, profile: remoteDistributionData.profile, checks: remoteDistributionData.summary ? remoteDistributionData.summary.passed + ' passed, ' + remoteDistributionData.summary.failed + ' failed, ' + remoteDistributionData.summary.skipped + ' skipped, ' + remoteDistributionData.summary.total + ' total' : null, remoteInstall: remoteDistributionData.workflows?.remoteInstall, integrityGate: remoteDistributionData.workflows?.integrityGate, installedValidation: remoteDistributionData.workflows?.installedValidation }
      : null,
    stderr: remoteDistribution.stderr,
  })
  const signingReadiness = run(process.execPath, [path.join(root, 'scripts', 'audit-signing.mjs'), '--root', root, '--json'])
  const signingData = parseJson(signingReadiness.stdout)
  checks.push({
    id: 'validate-10c',
    label: 'package signing and verification audit',
    status: signingReadiness.status === 0 ? 'passed' : 'failed',
    command: signingReadiness.command,
    summary: signingData
      ? { status: signingData.summary?.status, checks: signingData.summary ? signingData.summary.passed + '/' + signingData.summary.total : null, packageSigning: signingData.workflows?.packageSigning, signatureVerification: signingData.workflows?.signatureVerification, signedInstall: signingData.workflows?.signedInstall, tamperRejection: signingData.workflows?.tamperRejection }
      : null,
    stderr: signingReadiness.stderr,
  })
}
const updateReleaseAcceptance = run(process.execPath, [path.join(root, 'scripts', 'audit-update-release-acceptance.mjs'), '--root', root, '--json'])
const updateReleaseData = parseJson(updateReleaseAcceptance.stdout)
checks.push({
  id: 'validate-11',
  label: 'update/release acceptance record audit',
  status: updateReleaseAcceptance.status === 0 ? 'passed' : 'failed',
  command: updateReleaseAcceptance.command,
  summary: updateReleaseData
    ? { status: updateReleaseData.summary?.status, checks: updateReleaseData.summary ? updateReleaseData.summary.passed + '/' + updateReleaseData.summary.total : null, updateReleaseAcceptance: updateReleaseData.workflows?.updateReleaseAcceptance }
    : null,
  stderr: updateReleaseAcceptance.stderr,
})
const targetAdoptionEvidence = run(process.execPath, [path.join(root, 'scripts', 'audit-target-adoption-evidence.mjs'), '--root', root, '--json'])
const targetAdoptionData = parseJson(targetAdoptionEvidence.stdout)
checks.push({
  id: 'validate-12',
  label: 'target adoption evidence audit',
  status: targetAdoptionEvidence.status === 0 ? 'passed' : 'failed',
  command: targetAdoptionEvidence.command,
  summary: targetAdoptionData
    ? { status: targetAdoptionData.summary?.status, checks: targetAdoptionData.summary ? targetAdoptionData.summary.passed + '/' + targetAdoptionData.summary.total : null, targetAdoptionEvidence: targetAdoptionData.workflows?.targetAdoptionEvidence }
    : null,
  stderr: targetAdoptionEvidence.stderr,
})
const acceptanceExecutionPacket = run(process.execPath, [path.join(root, 'scripts', 'audit-acceptance-execution-packet.mjs'), '--root', root, '--json'])
const acceptancePacketData = parseJson(acceptanceExecutionPacket.stdout)
checks.push({
  id: 'validate-13',
  label: 'acceptance execution packet audit',
  status: acceptanceExecutionPacket.status === 0 ? 'passed' : 'failed',
  command: acceptanceExecutionPacket.command,
  summary: acceptancePacketData
    ? { status: acceptancePacketData.summary?.status, checks: acceptancePacketData.summary ? acceptancePacketData.summary.passed + '/' + acceptancePacketData.summary.total : null, acceptanceExecutionPacket: acceptancePacketData.workflows?.acceptanceExecutionPacket, acceptedBy: acceptancePacketData.acceptedBy }
    : null,
  stderr: acceptanceExecutionPacket.stderr,
})
const roadmapConsistency = run(process.execPath, [path.join(root, 'scripts', 'audit-roadmap-consistency.mjs'), '--root', root, '--json'])
const roadmapConsistencyData = parseJson(roadmapConsistency.stdout)
checks.push({
  id: 'validate-14',
  label: 'roadmap consistency audit',
  status: roadmapConsistency.status === 0 ? 'passed' : 'failed',
  command: roadmapConsistency.command,
  summary: roadmapConsistencyData
    ? { status: roadmapConsistencyData.summary?.status, checks: roadmapConsistencyData.summary ? roadmapConsistencyData.summary.passed + '/' + roadmapConsistencyData.summary.total : null, roadmapConsistency: roadmapConsistencyData.workflows?.roadmapConsistency }
    : null,
  stderr: roadmapConsistency.stderr,
})
const finalFormRoadmap = run(process.execPath, [path.join(root, 'scripts', 'audit-final-form-roadmap.mjs'), '--root', root, '--json'])
const finalFormRoadmapData = parseJson(finalFormRoadmap.stdout)
checks.push({
  id: 'validate-14b',
  label: 'final-form roadmap contract audit',
  status: finalFormRoadmap.status === 0 ? 'passed' : 'failed',
  command: finalFormRoadmap.command,
  summary: finalFormRoadmapData
    ? { status: finalFormRoadmapData.summary?.status, checks: finalFormRoadmapData.summary ? finalFormRoadmapData.summary.passed + '/' + finalFormRoadmapData.summary.total : null, finalFormRoadmap: finalFormRoadmapData.workflows?.finalFormRoadmap }
    : null,
  stderr: finalFormRoadmap.stderr,
})
if (skipCompletionReadiness) {
  checks.push({
    id: 'validate-15',
    label: 'completion readiness audit',
    status: 'skipped',
    command: null,
    summary: { status: 'skipped', reason: 'skipped by --skip-completion-readiness' },
    stderr: '',
  })
} else {
  const completionReadiness = run(process.execPath, [path.join(root, 'scripts', 'audit-completion-readiness.mjs'), '--root', root, '--json'])
  const completionReadinessData = parseJson(completionReadiness.stdout)
  checks.push({
    id: 'validate-15',
    label: 'completion readiness audit',
    status: completionReadiness.status === 0 ? 'passed' : 'failed',
    command: completionReadiness.command,
    summary: completionReadinessData
      ? { status: completionReadinessData.summary?.status, checks: completionReadinessData.summary ? completionReadinessData.summary.passed + '/' + completionReadinessData.summary.total : null, completionReadiness: completionReadinessData.workflows?.completionReadiness, completionStatus: completionReadinessData.completionStatus }
      : null,
    stderr: completionReadiness.stderr,
  })
}
const recoveryReadiness = run(process.execPath, [path.join(root, 'scripts', 'audit-recovery-readiness.mjs'), '--root', root, '--json'])
const recoveryData = parseJson(recoveryReadiness.stdout)
checks.push({
  id: 'validate-16',
  label: 'recovery readiness audit',
  status: recoveryReadiness.status === 0 ? 'passed' : 'failed',
  command: recoveryReadiness.command,
  summary: recoveryData
    ? { status: recoveryData.summary?.status, checks: recoveryData.summary ? recoveryData.summary.passed + '/' + recoveryData.summary.total : null, recoveryReadiness: recoveryData.workflows?.recoveryReadiness }
    : null,
  stderr: recoveryReadiness.stderr,
})
const domainQualityGates = run(process.execPath, [path.join(root, 'scripts', 'audit-domain-quality-gates.mjs'), '--root', root, '--json'])
const domainQualityData = parseJson(domainQualityGates.stdout)
checks.push({
  id: 'validate-17',
  label: 'domain quality gates audit',
  status: domainQualityGates.status === 0 ? 'passed' : 'failed',
  command: domainQualityGates.command,
  summary: domainQualityData
    ? { status: domainQualityData.summary?.status, checks: domainQualityData.summary ? domainQualityData.summary.passed + '/' + domainQualityData.summary.total : null, domainQualityGates: domainQualityData.workflows?.domainQualityGates }
    : null,
  stderr: domainQualityGates.stderr,
})
const adoptionRecipes = run(process.execPath, [path.join(root, 'scripts', 'audit-adoption-recipes.mjs'), '--root', root, '--json'])
const adoptionRecipeData = parseJson(adoptionRecipes.stdout)
checks.push({
  id: 'validate-18',
  label: 'adoption recipes audit',
  status: adoptionRecipes.status === 0 ? 'passed' : 'failed',
  command: adoptionRecipes.command,
  summary: adoptionRecipeData
    ? { status: adoptionRecipeData.summary?.status, checks: adoptionRecipeData.summary ? adoptionRecipeData.summary.passed + '/' + adoptionRecipeData.summary.total : null, adoptionRecipes: adoptionRecipeData.workflows?.adoptionRecipes }
    : null,
  stderr: adoptionRecipes.stderr,
})
const changeSystem = run(process.execPath, [path.join(root, 'scripts', 'audit-change-system.mjs'), '--root', root, '--json'])
const changeSystemData = parseJson(changeSystem.stdout)
checks.push({
  id: 'validate-19',
  label: 'change spec and execution pack audit',
  status: changeSystem.status === 0 ? 'passed' : 'failed',
  command: changeSystem.command,
  summary: changeSystemData
    ? { status: changeSystemData.summary?.status, checks: changeSystemData.summary ? changeSystemData.summary.passed + '/' + changeSystemData.summary.total : null, changeSpecPack: changeSystemData.workflows?.changeSpecPack, executionQualityPack: changeSystemData.workflows?.executionQualityPack }
    : null,
  stderr: changeSystem.stderr,
})
const changeLifecycle = run(process.execPath, [path.join(root, 'scripts', 'audit-change-lifecycle.mjs'), '--root', root, '--json'])
const changeLifecycleData = parseJson(changeLifecycle.stdout)
checks.push({
  id: 'validate-20',
  label: 'change close/archive lifecycle audit',
  status: changeLifecycle.status === 0 ? 'passed' : 'failed',
  command: changeLifecycle.command,
  summary: changeLifecycleData
    ? { status: changeLifecycleData.summary?.status, checks: changeLifecycleData.summary ? changeLifecycleData.summary.passed + '/' + changeLifecycleData.summary.total : null, changeArchiveLifecycle: changeLifecycleData.workflows?.changeArchiveLifecycle }
    : null,
  stderr: changeLifecycle.stderr,
})
const commandAdapters = run(process.execPath, [path.join(root, 'scripts', 'audit-command-adapters.mjs'), '--root', root, '--json'])
const commandAdaptersData = parseJson(commandAdapters.stdout)
checks.push({
  id: 'validate-21',
  label: 'host command adapter audit',
  status: commandAdapters.status === 0 ? 'passed' : 'failed',
  command: commandAdapters.command,
  summary: commandAdaptersData
    ? { status: commandAdaptersData.summary?.status, checks: commandAdaptersData.summary ? commandAdaptersData.summary.passed + '/' + commandAdaptersData.summary.total : null, claudeNativeSlashCommandAdapter: commandAdaptersData.workflows?.claudeNativeSlashCommandAdapter, codexCommandPointerAdapter: commandAdaptersData.workflows?.codexCommandPointerAdapter, portableHostPointerAdapters: commandAdaptersData.workflows?.portableHostPointerAdapters }
    : null,
  stderr: commandAdapters.stderr,
})
const commandExecution = run(process.execPath, [path.join(root, 'scripts', 'audit-command-execution.mjs'), '--root', root, '--json'])
const commandExecutionData = parseJson(commandExecution.stdout)
checks.push({
  id: 'validate-21b',
  label: 'portable command execution audit for run-gse-command.mjs',
  status: commandExecution.status === 0 ? 'passed' : 'failed',
  command: commandExecution.command,
  summary: commandExecutionData
    ? { status: commandExecutionData.summary?.status, checks: commandExecutionData.summary ? commandExecutionData.summary.passed + '/' + commandExecutionData.summary.total : null, portableCommandExecution: commandExecutionData.workflows?.portableCommandExecution, generatedHostCommandPointers: commandExecutionData.workflows?.generatedHostCommandPointers }
    : null,
  stderr: commandExecution.stderr,
})
const validationProfiles = run(process.execPath, [path.join(root, 'scripts', 'audit-validation-profiles.mjs'), '--root', root, '--json'])
const validationProfilesData = parseJson(validationProfiles.stdout)
checks.push({
  id: 'validate-21b2',
  label: 'validation profile runner audit',
  status: validationProfiles.status === 0 ? 'passed' : 'failed',
  command: validationProfiles.command,
  summary: validationProfilesData
    ? { status: validationProfilesData.summary?.status, checks: validationProfilesData.summary ? validationProfilesData.summary.passed + '/' + validationProfilesData.summary.total : null, validationProfiles: validationProfilesData.workflows?.validationProfiles, liteChecks: validationProfilesData.workflows?.liteChecks, standardChecks: validationProfilesData.workflows?.standardChecks }
    : null,
  stderr: validationProfiles.stderr,
})
const hostUiInvocation = run(process.execPath, [path.join(root, 'scripts', 'audit-host-ui-invocation.mjs'), '--root', root, '--json'])
const hostUiInvocationData = parseJson(hostUiInvocation.stdout)
checks.push({
  id: 'validate-21c',
  label: 'host UI invocation readiness audit',
  status: hostUiInvocation.status === 0 ? 'passed' : 'failed',
  command: hostUiInvocation.command,
  summary: hostUiInvocationData
    ? { status: hostUiInvocationData.summary?.status, checks: hostUiInvocationData.summary ? hostUiInvocationData.summary.passed + '/' + hostUiInvocationData.summary.total : null, hostUiInvocationReadiness: hostUiInvocationData.workflows?.hostUiInvocationReadiness, realHostUiInvocation: hostUiInvocationData.workflows?.realHostUiInvocation }
    : null,
  stderr: hostUiInvocation.stderr,
})
const hostRuntimeInvocations = run(process.execPath, [path.join(root, 'scripts', 'audit-host-runtime-invocations.mjs'), '--root', root, '--json'])
const hostRuntimeInvocationsData = parseJson(hostRuntimeInvocations.stdout)
checks.push({
  id: 'validate-21d',
  label: 'host runtime invocation records audit',
  status: hostRuntimeInvocations.status === 0 ? 'passed' : 'failed',
  command: hostRuntimeInvocations.command,
  summary: hostRuntimeInvocationsData
    ? { status: hostRuntimeInvocationsData.summary?.status, checks: hostRuntimeInvocationsData.summary ? hostRuntimeInvocationsData.summary.passed + '/' + hostRuntimeInvocationsData.summary.total : null, hostRuntimeInvocationRecords: hostRuntimeInvocationsData.workflows?.hostRuntimeInvocationRecords, nativeRecords: hostRuntimeInvocationsData.inventory?.nativeSlashCommandRecords, portableRecords: hostRuntimeInvocationsData.inventory?.portableTextCommandRecords }
    : null,
  stderr: hostRuntimeInvocations.stderr,
})
const hostRuntimeInvocationDrill = run(process.execPath, [path.join(root, 'scripts', 'audit-host-runtime-invocation-drill.mjs'), '--root', root, '--json'])
const hostRuntimeInvocationDrillData = parseJson(hostRuntimeInvocationDrill.stdout)
checks.push({
  id: 'validate-21d2',
  label: 'host runtime invocation fixture drill',
  status: hostRuntimeInvocationDrill.status === 0 ? 'passed' : 'failed',
  command: hostRuntimeInvocationDrill.command,
  summary: hostRuntimeInvocationDrillData
    ? { status: hostRuntimeInvocationDrillData.summary?.status, checks: hostRuntimeInvocationDrillData.summary ? hostRuntimeInvocationDrillData.summary.passed + '/' + hostRuntimeInvocationDrillData.summary.total : null, hostRuntimeInvocationDrill: hostRuntimeInvocationDrillData.workflows?.hostRuntimeInvocationDrill, fixtureNativeSlashCommandRecords: hostRuntimeInvocationDrillData.workflows?.fixtureNativeSlashCommandRecords, fixturePortableTextCommandRecords: hostRuntimeInvocationDrillData.workflows?.fixturePortableTextCommandRecords }
    : null,
  stderr: hostRuntimeInvocationDrill.stderr,
})
const finalReadiness = run(process.execPath, [path.join(root, 'scripts', 'audit-final-readiness.mjs'), '--root', root, '--json'])
const finalReadinessData = parseJson(finalReadiness.stdout)
checks.push({
  id: 'validate-21e',
  label: 'final readiness matrix audit',
  status: finalReadiness.status === 0 ? 'passed' : 'failed',
  command: finalReadiness.command,
  summary: finalReadinessData
    ? { status: finalReadinessData.summary?.status, checks: finalReadinessData.summary ? finalReadinessData.summary.passed + '/' + finalReadinessData.summary.total : null, finalReadinessMatrix: finalReadinessData.workflows?.finalReadinessMatrix, publicAccepted: finalReadinessData.workflows?.publicAccepted }
    : null,
  stderr: finalReadiness.stderr,
})
const finalReadinessPromotion = run(process.execPath, [path.join(root, 'scripts', 'audit-final-readiness-promotion.mjs'), '--root', root, '--json'])
const finalReadinessPromotionData = parseJson(finalReadinessPromotion.stdout)
checks.push({
  id: 'validate-21h',
  label: 'final readiness accepted-record promotion audit',
  status: finalReadinessPromotion.status === 0 ? 'passed' : 'failed',
  command: finalReadinessPromotion.command,
  summary: finalReadinessPromotionData
    ? { status: finalReadinessPromotionData.summary?.status, checks: finalReadinessPromotionData.summary ? finalReadinessPromotionData.summary.passed + '/' + finalReadinessPromotionData.summary.total : null, finalReadinessPromotion: finalReadinessPromotionData.workflows?.finalReadinessPromotion, publicAcceptedFixture: finalReadinessPromotionData.workflows?.publicAcceptedFixture }
    : null,
  stderr: finalReadinessPromotion.stderr,
})
const publicAcceptanceReadiness = run(process.execPath, [path.join(root, 'scripts', 'audit-public-acceptance-readiness.mjs'), '--root', root, '--json'])
const publicAcceptanceReadinessData = parseJson(publicAcceptanceReadiness.stdout)
checks.push({
  id: 'validate-21i',
  label: 'public acceptance readiness doctor',
  status: publicAcceptanceReadiness.status === 0 ? 'passed' : 'failed',
  command: publicAcceptanceReadiness.command,
  summary: publicAcceptanceReadinessData
    ? { status: publicAcceptanceReadinessData.summary?.status, checks: publicAcceptanceReadinessData.summary ? publicAcceptanceReadinessData.summary.passed + '/' + publicAcceptanceReadinessData.summary.total : null, publicAcceptanceDoctor: publicAcceptanceReadinessData.workflows?.publicAcceptanceDoctor, pendingGates: publicAcceptanceReadinessData.summary?.pendingGates, publicAccepted: publicAcceptanceReadinessData.summary?.publicAccepted }
    : null,
  stderr: publicAcceptanceReadiness.stderr,
})
const publicAcceptanceCommandDryRunDrill = run(process.execPath, [path.join(root, 'scripts', 'audit-public-acceptance-command-dry-run-drill.mjs'), '--root', root, '--json'])
const publicAcceptanceCommandDryRunDrillData = parseJson(publicAcceptanceCommandDryRunDrill.stdout)
checks.push({
  id: 'validate-21i2',
  label: 'public acceptance command dry-run drill',
  status: publicAcceptanceCommandDryRunDrill.status === 0 ? 'passed' : 'failed',
  command: publicAcceptanceCommandDryRunDrill.command,
  summary: publicAcceptanceCommandDryRunDrillData
    ? { status: publicAcceptanceCommandDryRunDrillData.summary?.status, checks: publicAcceptanceCommandDryRunDrillData.summary ? publicAcceptanceCommandDryRunDrillData.summary.passed + '/' + publicAcceptanceCommandDryRunDrillData.summary.total : null, publicAcceptanceCommandDryRunDrill: publicAcceptanceCommandDryRunDrillData.workflows?.publicAcceptanceCommandDryRunDrill, commandsChecked: publicAcceptanceCommandDryRunDrillData.summary?.commandsChecked, publicAccepted: publicAcceptanceCommandDryRunDrillData.summary?.publicAccepted }
    : null,
  stderr: publicAcceptanceCommandDryRunDrill.stderr,
})
const publicExternalGateProbe = run(process.execPath, [path.join(root, 'scripts', 'audit-public-external-gate-probe.mjs'), '--root', root, '--json'])
const publicExternalGateProbeData = parseJson(publicExternalGateProbe.stdout)
checks.push({
  id: 'validate-21i3',
  label: 'public external gate live probe audit',
  status: publicExternalGateProbe.status === 0 ? 'passed' : 'failed',
  command: publicExternalGateProbe.command,
  summary: publicExternalGateProbeData
    ? { status: publicExternalGateProbeData.summary?.status, checks: publicExternalGateProbeData.summary ? publicExternalGateProbeData.summary.passed + '/' + publicExternalGateProbeData.summary.total : null, publicExternalGateProbe: publicExternalGateProbeData.workflows?.publicExternalGateProbe }
    : null,
  stderr: publicExternalGateProbe.stderr,
})
const publicAcceptanceHandoff = run(process.execPath, [path.join(root, 'scripts', 'audit-public-acceptance-handoff.mjs'), '--root', root, '--json'])
const publicAcceptanceHandoffData = parseJson(publicAcceptanceHandoff.stdout)
checks.push({
  id: 'validate-21j',
  label: 'public acceptance handoff generator audit',
  status: publicAcceptanceHandoff.status === 0 ? 'passed' : 'failed',
  command: publicAcceptanceHandoff.command,
  summary: publicAcceptanceHandoffData
    ? { status: publicAcceptanceHandoffData.summary?.status, checks: publicAcceptanceHandoffData.summary ? publicAcceptanceHandoffData.summary.passed + '/' + publicAcceptanceHandoffData.summary.total : null, publicAcceptanceHandoff: publicAcceptanceHandoffData.workflows?.publicAcceptanceHandoff, publicAccepted: publicAcceptanceHandoffData.workflows?.publicAccepted }
    : null,
  stderr: publicAcceptanceHandoff.stderr,
})
const releaseStatusManifest = run(process.execPath, [path.join(root, 'scripts', 'audit-release-status-manifest.mjs'), '--root', root, '--json'])
const releaseStatusManifestData = parseJson(releaseStatusManifest.stdout)
checks.push({
  id: 'validate-21j2',
  label: 'release status manifest generator audit',
  status: releaseStatusManifest.status === 0 ? 'passed' : 'failed',
  command: releaseStatusManifest.command,
  summary: releaseStatusManifestData
    ? { status: releaseStatusManifestData.summary?.status, checks: releaseStatusManifestData.summary ? releaseStatusManifestData.summary.passed + '/' + releaseStatusManifestData.summary.total : null, releaseStatusManifest: releaseStatusManifestData.workflows?.releaseStatusManifest, publicAccepted: releaseStatusManifestData.workflows?.publicAccepted, pendingGates: releaseStatusManifestData.workflows?.pendingGates }
    : null,
  stderr: releaseStatusManifest.stderr,
})
const releaseOwnerActionPlan = run(process.execPath, [path.join(root, 'scripts', 'audit-release-owner-action-plan.mjs'), '--root', root, '--json'])
const releaseOwnerActionPlanData = parseJson(releaseOwnerActionPlan.stdout)
checks.push({
  id: 'validate-21j3',
  label: 'release owner action plan generator audit',
  status: releaseOwnerActionPlan.status === 0 ? 'passed' : 'failed',
  command: releaseOwnerActionPlan.command,
  summary: releaseOwnerActionPlanData
    ? { status: releaseOwnerActionPlanData.summary?.status, checks: releaseOwnerActionPlanData.summary ? releaseOwnerActionPlanData.summary.passed + '/' + releaseOwnerActionPlanData.summary.total : null, releaseOwnerActionPlan: releaseOwnerActionPlanData.workflows?.releaseOwnerActionPlan, publicAccepted: releaseOwnerActionPlanData.workflows?.publicAccepted, pendingGates: releaseOwnerActionPlanData.workflows?.pendingGates }
    : null,
  stderr: releaseOwnerActionPlan.stderr,
})
const publicReleaseChecklist = run(process.execPath, [path.join(root, 'scripts', 'audit-public-release-checklist.mjs'), '--root', root, '--json'])
const publicReleaseChecklistData = parseJson(publicReleaseChecklist.stdout)
checks.push({
  id: 'validate-21j3b',
  label: 'public release checklist generator audit',
  status: publicReleaseChecklist.status === 0 ? 'passed' : 'failed',
  command: publicReleaseChecklist.command,
  summary: publicReleaseChecklistData
    ? { status: publicReleaseChecklistData.summary?.status, checks: publicReleaseChecklistData.summary ? publicReleaseChecklistData.summary.passed + '/' + publicReleaseChecklistData.summary.total : null, publicReleaseChecklist: publicReleaseChecklistData.workflows?.publicReleaseChecklist, publicAccepted: publicReleaseChecklistData.workflows?.publicAccepted, pendingGates: publicReleaseChecklistData.workflows?.pendingGates }
    : null,
  stderr: publicReleaseChecklist.stderr,
})
const releaseOwnerActionPlanDrill = run(process.execPath, [path.join(root, 'scripts', 'audit-release-owner-action-plan-drill.mjs'), '--root', root, '--json'])
const releaseOwnerActionPlanDrillData = parseJson(releaseOwnerActionPlanDrill.stdout)
checks.push({
  id: 'validate-21j4',
  label: 'release owner action plan end-to-end fixture drill',
  status: releaseOwnerActionPlanDrill.status === 0 ? 'passed' : 'failed',
  command: releaseOwnerActionPlanDrill.command,
  summary: releaseOwnerActionPlanDrillData
    ? { status: releaseOwnerActionPlanDrillData.summary?.status, checks: releaseOwnerActionPlanDrillData.summary ? releaseOwnerActionPlanDrillData.summary.passed + '/' + releaseOwnerActionPlanDrillData.summary.total : null, releaseOwnerActionPlanDrill: releaseOwnerActionPlanDrillData.workflows?.releaseOwnerActionPlanDrill, publicAcceptedFixture: releaseOwnerActionPlanDrillData.workflows?.publicAcceptedFixture, pendingGatesAfterRecords: releaseOwnerActionPlanDrillData.workflows?.pendingGatesAfterRecords }
    : null,
  stderr: releaseOwnerActionPlanDrill.stderr,
})
const finalFormProgressReport = run(process.execPath, [path.join(root, 'scripts', 'audit-final-form-progress-report.mjs'), '--root', root, '--json'])
const finalFormProgressReportData = parseJson(finalFormProgressReport.stdout)
checks.push({
  id: 'validate-21j5',
  label: 'final-form progress report audit',
  status: finalFormProgressReport.status === 0 ? 'passed' : 'failed',
  command: finalFormProgressReport.command,
  summary: finalFormProgressReportData
    ? { status: finalFormProgressReportData.summary?.status, checks: finalFormProgressReportData.summary ? finalFormProgressReportData.summary.passed + '/' + finalFormProgressReportData.summary.total : null, finalFormProgressReport: finalFormProgressReportData.workflows?.finalFormProgressReport, localEngineeringReadiness: finalFormProgressReportData.workflows?.localEngineeringReadiness, fullFinalFormReadiness: finalFormProgressReportData.workflows?.fullFinalFormReadiness, pendingGates: finalFormProgressReportData.workflows?.pendingGates, publicAccepted: finalFormProgressReportData.workflows?.publicAccepted }
    : null,
  stderr: finalFormProgressReport.stderr,
})
if (skipLocalFinalFormCompletion) {
  checks.push({
    id: 'validate-21j5b',
    label: 'local final-form completion boundary audit',
    status: 'skipped',
    command: null,
    summary: { status: 'skipped', reason: 'skipped by --skip-local-final-form-completion' },
    stderr: '',
  })
} else {
  const localFinalFormCompletion = run(process.execPath, [path.join(root, 'scripts', 'audit-local-final-form-completion.mjs'), '--root', root, '--json'])
  const localFinalFormCompletionData = parseJson(localFinalFormCompletion.stdout)
  checks.push({
    id: 'validate-21j5b',
    label: 'local final-form completion boundary audit',
    status: localFinalFormCompletion.status === 0 ? 'passed' : 'failed',
    command: localFinalFormCompletion.command,
    summary: localFinalFormCompletionData
      ? { status: localFinalFormCompletionData.summary?.status, localEngineeringReadiness: localFinalFormCompletionData.summary?.localEngineeringReadiness, fullFinalFormReadiness: localFinalFormCompletionData.summary?.fullFinalFormReadiness, pendingGates: localFinalFormCompletionData.summary?.pendingGates, publicAccepted: localFinalFormCompletionData.summary?.publicAccepted, remainingWorkClass: localFinalFormCompletionData.workflows?.remainingWorkClass }
      : null,
    stderr: localFinalFormCompletion.stderr,
  })
}
if (skipFinalFormStaleCopy) {
  checks.push({
    id: 'validate-21j6',
    label: 'final-form stale copy audit',
    status: 'skipped',
    command: null,
    summary: { status: 'skipped', reason: 'skipped by --skip-final-form-stale-copy' },
    stderr: '',
  })
} else {
  const finalFormStaleCopy = run(process.execPath, [path.join(root, 'scripts', 'audit-final-form-stale-copy.mjs'), '--root', root, '--json'])
  const finalFormStaleCopyData = parseJson(finalFormStaleCopy.stdout)
  checks.push({
    id: 'validate-21j6',
    label: 'final-form stale copy audit',
    status: finalFormStaleCopy.status === 0 ? 'passed' : 'failed',
    command: finalFormStaleCopy.command,
    summary: finalFormStaleCopyData
      ? { status: finalFormStaleCopyData.summary?.status, checks: finalFormStaleCopyData.summary ? finalFormStaleCopyData.summary.passed + '/' + finalFormStaleCopyData.summary.total : null, finalFormStaleCopy: finalFormStaleCopyData.workflows?.finalFormStaleCopy, licenseDecision: finalFormStaleCopyData.workflows?.licenseDecision, pendingGates: finalFormStaleCopyData.workflows?.pendingGates, publicAccepted: finalFormStaleCopyData.workflows?.publicAccepted }
      : null,
    stderr: finalFormStaleCopy.stderr,
  })
}
const hostRuntimeEvidenceHandoff = run(process.execPath, [path.join(root, 'scripts', 'audit-host-runtime-evidence-handoff.mjs'), '--root', root, '--json'])
const hostRuntimeEvidenceHandoffData = parseJson(hostRuntimeEvidenceHandoff.stdout)
checks.push({
  id: 'validate-21k',
  label: 'host runtime evidence handoff generator audit',
  status: hostRuntimeEvidenceHandoff.status === 0 ? 'passed' : 'failed',
  command: hostRuntimeEvidenceHandoff.command,
  summary: hostRuntimeEvidenceHandoffData
    ? { status: hostRuntimeEvidenceHandoffData.summary?.status, checks: hostRuntimeEvidenceHandoffData.summary ? hostRuntimeEvidenceHandoffData.summary.passed + '/' + hostRuntimeEvidenceHandoffData.summary.total : null, hostRuntimeEvidenceHandoff: hostRuntimeEvidenceHandoffData.workflows?.hostRuntimeEvidenceHandoff, nativeRecords: hostRuntimeEvidenceHandoffData.workflows?.nativeSlashCommandRecords, portableRecords: hostRuntimeEvidenceHandoffData.workflows?.portableTextCommandRecords }
    : null,
  stderr: hostRuntimeEvidenceHandoff.stderr,
})
const ownerExternalGateKit = run(process.execPath, [path.join(root, 'scripts', 'audit-owner-external-gate-kit.mjs'), '--root', root, '--json'])
const ownerExternalGateKitData = parseJson(ownerExternalGateKit.stdout)
checks.push({
  id: 'validate-21l',
  label: 'owner/external gate execution kit audit',
  status: ownerExternalGateKit.status === 0 ? 'passed' : 'failed',
  command: ownerExternalGateKit.command,
  summary: ownerExternalGateKitData
    ? { status: ownerExternalGateKitData.summary?.status, checks: ownerExternalGateKitData.summary ? ownerExternalGateKitData.summary.passed + '/' + ownerExternalGateKitData.summary.total : null, ownerExternalGateKit: ownerExternalGateKitData.workflows?.ownerExternalGateKit, pendingGates: ownerExternalGateKitData.workflows?.pendingGates, publicAccepted: ownerExternalGateKitData.workflows?.publicAccepted }
    : null,
  stderr: ownerExternalGateKit.stderr,
})
const finalAcceptancePacketGenerate = run(process.execPath, [path.join(root, 'scripts', 'generate-final-acceptance-packet.mjs'), '--root', root, '--dry-run', '--json'])
const finalAcceptancePacketGenerateData = parseJson(finalAcceptancePacketGenerate.stdout)
checks.push({
  id: 'validate-21f',
  label: 'final acceptance packet generator dry-run',
  status: finalAcceptancePacketGenerate.status === 0 && finalAcceptancePacketGenerateData?.status === 'ready' ? 'passed' : 'failed',
  command: finalAcceptancePacketGenerate.command,
  summary: finalAcceptancePacketGenerateData
    ? { status: finalAcceptancePacketGenerateData.status, verifiedRows: finalAcceptancePacketGenerateData.summary?.verifiedRows, pendingRows: finalAcceptancePacketGenerateData.summary?.pendingRows, publicAccepted: finalAcceptancePacketGenerateData.summary?.publicAccepted }
    : null,
  stderr: finalAcceptancePacketGenerate.stderr,
})
const finalAcceptancePacket = run(process.execPath, [path.join(root, 'scripts', 'audit-final-acceptance-packet.mjs'), '--root', root, '--json'])
const finalAcceptancePacketData = parseJson(finalAcceptancePacket.stdout)
checks.push({
  id: 'validate-21g',
  label: 'final acceptance packet audit',
  status: finalAcceptancePacket.status === 0 ? 'passed' : 'failed',
  command: finalAcceptancePacket.command,
  summary: finalAcceptancePacketData
    ? { status: finalAcceptancePacketData.summary?.status, checks: finalAcceptancePacketData.summary ? finalAcceptancePacketData.summary.passed + '/' + finalAcceptancePacketData.summary.total : null, finalAcceptancePacket: finalAcceptancePacketData.workflows?.finalAcceptancePacket, publicAccepted: finalAcceptancePacketData.workflows?.publicAccepted }
    : null,
  stderr: finalAcceptancePacket.stderr,
})
const commandSemantics = run(process.execPath, [path.join(root, 'scripts', 'audit-commands.mjs'), '--root', root, '--json'])
const commandSemanticsData = parseJson(commandSemantics.stdout)
checks.push({
  id: 'validate-22',
  label: 'command semantics audit',
  status: commandSemantics.status === 0 ? 'passed' : 'failed',
  command: commandSemantics.command,
  summary: commandSemanticsData
    ? { status: commandSemanticsData.summary?.status, checks: commandSemanticsData.summary ? commandSemanticsData.summary.passed + '/' + commandSemanticsData.summary.total : null, commandSemantics: commandSemanticsData.workflows?.commandSemantics }
    : null,
  stderr: commandSemantics.stderr,
})
const agentEntrypoint = run(process.execPath, [path.join(root, 'scripts', 'audit-agent-entrypoint.mjs'), '--root', root, '--json'])
const agentEntrypointData = parseJson(agentEntrypoint.stdout)
checks.push({
  id: 'validate-22e0',
  label: 'repository agent entrypoint audit',
  status: agentEntrypoint.status === 0 ? 'passed' : 'failed',
  command: agentEntrypoint.command,
  summary: agentEntrypointData
    ? { status: agentEntrypointData.summary?.status, checks: agentEntrypointData.summary ? agentEntrypointData.summary.passed + '/' + agentEntrypointData.summary.total : null, repositoryAgentEntrypoint: agentEntrypointData.workflows?.repositoryAgentEntrypoint, thinHostAdapters: agentEntrypointData.workflows?.thinHostAdapters }
    : null,
  stderr: agentEntrypoint.stderr,
})
const projectCapabilityRegistry = run(process.execPath, [path.join(root, 'scripts', 'audit-project-capability-registry.mjs'), '--root', root, '--target', root, '--json'])
const projectCapabilityRegistryData = parseJson(projectCapabilityRegistry.stdout)
checks.push({
  id: 'validate-22e1',
  label: 'project capability registry audit',
  status: projectCapabilityRegistry.status === 0 ? 'passed' : 'failed',
  command: projectCapabilityRegistry.command,
  summary: projectCapabilityRegistryData
    ? { status: projectCapabilityRegistryData.summary?.status, checks: projectCapabilityRegistryData.summary ? projectCapabilityRegistryData.summary.passed + '/' + projectCapabilityRegistryData.summary.total : null, projectCapabilityRegistry: projectCapabilityRegistryData.workflows?.projectCapabilityRegistry }
    : null,
  stderr: projectCapabilityRegistry.stderr,
})
const continuePreflight = run(process.execPath, [path.join(root, 'scripts', 'audit-continue-preflight.mjs'), '--root', root, '--json'])
const continuePreflightData = parseJson(continuePreflight.stdout)
checks.push({
  id: 'validate-22a',
  label: '/gse continue hard preflight audit',
  status: continuePreflight.status === 0 ? 'passed' : 'failed',
  command: continuePreflight.command,
  summary: continuePreflightData
    ? { status: continuePreflightData.summary?.status, checks: continuePreflightData.summary ? continuePreflightData.summary.passed + '/' + continuePreflightData.summary.total : null, continueHardPreflight: continuePreflightData.workflows?.continueHardPreflight, stateCompaction: continuePreflightData.workflows?.stateCompaction }
    : null,
  stderr: continuePreflight.stderr,
})
const completionPlanDrill = run(process.execPath, [path.join(root, 'scripts', 'audit-completion-plan-drill.mjs'), '--root', root, '--json'])
const completionPlanDrillData = parseJson(completionPlanDrill.stdout)
checks.push({
  id: 'validate-22a1',
  label: '/gse continue completion plan drill audit',
  status: completionPlanDrill.status === 0 ? 'passed' : 'failed',
  command: completionPlanDrill.command,
  summary: completionPlanDrillData
    ? { status: completionPlanDrillData.summary?.status, checks: completionPlanDrillData.summary ? completionPlanDrillData.summary.passed + '/' + completionPlanDrillData.summary.total : null, completionPlanDrill: completionPlanDrillData.workflows?.completionPlanDrill, cleanWorktreeFalsePositiveGuard: completionPlanDrillData.workflows?.cleanWorktreeFalsePositiveGuard }
    : null,
  stderr: completionPlanDrill.stderr,
})
const projectGuards = run(process.execPath, [path.join(root, 'scripts', 'audit-project-guards.mjs'), '--root', root, '--json'])
const projectGuardsData = parseJson(projectGuards.stdout)
checks.push({
  id: 'validate-22a2',
  label: 'project guard preflight audit',
  status: projectGuards.status === 0 ? 'passed' : 'failed',
  command: projectGuards.command,
  summary: projectGuardsData
    ? { status: projectGuardsData.summary?.status, checks: projectGuardsData.summary ? projectGuardsData.summary.passed + '/' + projectGuardsData.summary.total : null, projectGuards: projectGuardsData.workflows?.projectGuards, initProjectGuardScaffold: projectGuardsData.workflows?.initProjectGuardScaffold }
    : null,
  stderr: projectGuards.stderr,
})
const evidenceLevels = run(process.execPath, [path.join(root, 'scripts', 'audit-evidence-levels.mjs'), '--root', root, '--target', root, '--json'])
const evidenceLevelsData = parseJson(evidenceLevels.stdout)
checks.push({
  id: 'validate-22a3',
  label: 'explicit evidence level taxonomy audit',
  status: evidenceLevels.status === 0 ? 'passed' : 'failed',
  command: evidenceLevels.command,
  summary: evidenceLevelsData
    ? { status: evidenceLevelsData.summary?.status, checks: evidenceLevelsData.summary ? evidenceLevelsData.summary.passed + '/' + evidenceLevelsData.summary.total : null, evidenceLevels: evidenceLevelsData.workflows?.evidenceLevels, downgraded: evidenceLevelsData.workflows?.downgraded, missingLevel: evidenceLevelsData.workflows?.missingLevel }
    : null,
  stderr: evidenceLevels.stderr,
})
const evidenceReviewQueue = run(process.execPath, [path.join(root, 'scripts', 'audit-evidence-review-queue.mjs'), '--root', root, '--target', root, '--json'])
const evidenceReviewQueueData = parseJson(evidenceReviewQueue.stdout)
checks.push({
  id: 'validate-22a3a',
  label: 'historical evidence review queue audit',
  status: evidenceReviewQueue.status === 0 ? 'passed' : 'failed',
  command: evidenceReviewQueue.command,
  summary: evidenceReviewQueueData
    ? { status: evidenceReviewQueueData.summary?.status, checks: evidenceReviewQueueData.summary ? evidenceReviewQueueData.summary.passed + '/' + evidenceReviewQueueData.summary.total : null, evidenceReviewQueue: evidenceReviewQueueData.workflows?.evidenceReviewQueue, needsReview: evidenceReviewQueueData.reviewQueue?.needsReview, eligibleForStrongerReview: evidenceReviewQueueData.reviewQueue?.eligibleForStrongerReview }
    : null,
  stderr: evidenceReviewQueue.stderr,
})
const uiBrowserEvidencePolicy = run(process.execPath, [path.join(root, 'scripts', 'audit-ui-browser-evidence-policy.mjs'), '--root', root, '--target', root, '--json'])
const uiBrowserEvidencePolicyData = parseJson(uiBrowserEvidencePolicy.stdout)
checks.push({
  id: 'validate-22a3b',
  label: 'UI/browser evidence policy audit',
  status: uiBrowserEvidencePolicy.status === 0 ? 'passed' : 'failed',
  command: uiBrowserEvidencePolicy.command,
  summary: uiBrowserEvidencePolicyData
    ? { status: uiBrowserEvidencePolicyData.summary?.status, checks: uiBrowserEvidencePolicyData.summary ? uiBrowserEvidencePolicyData.summary.passed + '/' + uiBrowserEvidencePolicyData.summary.total : null, uiBrowserEvidencePolicy: uiBrowserEvidencePolicyData.workflows?.uiBrowserEvidencePolicy, targetDowngrades: uiBrowserEvidencePolicyData.workflows?.targetDowngrades }
    : null,
  stderr: uiBrowserEvidencePolicy.stderr,
})
const roleDispatchFallback = run(process.execPath, [path.join(root, 'scripts', 'audit-role-dispatch-fallback.mjs'), '--root', root, '--target', root, '--json'])
const roleDispatchFallbackData = parseJson(roleDispatchFallback.stdout)
checks.push({
  id: 'validate-22a4',
  label: 'role dispatch fallback packet audit',
  status: roleDispatchFallback.status === 0 ? 'passed' : 'failed',
  command: roleDispatchFallback.command,
  summary: roleDispatchFallbackData
    ? { status: roleDispatchFallbackData.summary?.status, checks: roleDispatchFallbackData.summary ? roleDispatchFallbackData.summary.passed + '/' + roleDispatchFallbackData.summary.total : null, roleDispatchFallback: roleDispatchFallbackData.workflows?.roleDispatchFallback, packets: roleDispatchFallbackData.workflows?.packets, sequentialFallbackRoles: roleDispatchFallbackData.workflows?.sequentialFallbackRoles }
    : null,
  stderr: roleDispatchFallback.stderr,
})
const closeGateHardening = run(process.execPath, [path.join(root, 'scripts', 'audit-close-gate-hardening.mjs'), '--root', root, '--json'])
const closeGateHardeningData = parseJson(closeGateHardening.stdout)
checks.push({
  id: 'validate-22a6',
  label: 'close gate fake-dispatch and file-ownership hardening audit',
  status: closeGateHardening.status === 0 ? 'passed' : 'failed',
  command: closeGateHardening.command,
  summary: closeGateHardeningData
    ? { status: closeGateHardeningData.summary?.status, checks: closeGateHardeningData.summary ? closeGateHardeningData.summary.passed + '/' + closeGateHardeningData.summary.total : null, fakeDispatchCloseGate: closeGateHardeningData.workflows?.fakeDispatchCloseGate, fileOwnershipCloseGate: closeGateHardeningData.workflows?.fileOwnershipCloseGate }
    : null,
  stderr: closeGateHardening.stderr,
})
const stateRepair = run(process.execPath, [path.join(root, 'scripts', 'audit-state-repair.mjs'), '--root', root, '--target', root, '--json'])
const stateRepairData = parseJson(stateRepair.stdout)
checks.push({
  id: 'validate-22a5',
  label: 'state and evidence repair path audit',
  status: stateRepair.status === 0 ? 'passed' : 'failed',
  command: stateRepair.command,
  summary: stateRepairData
    ? { status: stateRepairData.summary?.status, actions: stateRepairData.summary?.actions, hard: stateRepairData.summary?.hard, warnings: stateRepairData.summary?.warnings, writes: stateRepairData.summary?.writes }
    : null,
  stderr: stateRepair.stderr,
})
const learningSystem = run(process.execPath, [path.join(root, 'scripts', 'audit-learning-system.mjs'), '--root', root, '--json'])
const learningSystemData = parseJson(learningSystem.stdout)
checks.push({
  id: 'validate-22b',
  label: 'learning command and store audit',
  status: learningSystem.status === 0 ? 'passed' : 'failed',
  command: learningSystem.command,
  summary: learningSystemData
    ? { status: learningSystemData.summary?.status, checks: learningSystemData.summary ? learningSystemData.summary.passed + '/' + learningSystemData.summary.total : null, learningCommand: learningSystemData.workflows?.learningCommand, learningStore: learningSystemData.workflows?.learningStore }
    : null,
  stderr: learningSystem.stderr,
})
const learningPromotion = run(process.execPath, [path.join(root, 'scripts', 'audit-learning-promotion.mjs'), '--root', root, '--target', root, '--json'])
const learningPromotionData = parseJson(learningPromotion.stdout)
checks.push({
  id: 'validate-22c',
  label: 'learning promotion automation audit',
  status: learningPromotion.status === 0 ? 'passed' : 'failed',
  command: learningPromotion.command,
  summary: learningPromotionData
    ? { status: learningPromotionData.summary?.status, checks: learningPromotionData.summary ? learningPromotionData.summary.passed + '/' + learningPromotionData.summary.total : null, promoted: learningPromotionData.summary?.promoted, guardCandidates: learningPromotionData.summary?.guardCandidates }
    : null,
  stderr: learningPromotion.stderr,
})
const learningDrift = run(process.execPath, [path.join(root, 'scripts', 'audit-learning-drift.mjs'), '--root', root, '--target', root, '--json'])
const learningDriftData = parseJson(learningDrift.stdout)
checks.push({
  id: 'validate-22c2',
  label: 'learning promotion drift audit',
  status: learningDrift.status === 0 ? 'passed' : 'failed',
  command: learningDrift.command,
  summary: learningDriftData
    ? { status: learningDriftData.summary?.status, checks: learningDriftData.summary ? learningDriftData.summary.passed + '/' + learningDriftData.summary.total : null, candidates: learningDriftData.summary?.candidates, enforced: learningDriftData.summary?.enforced, highUnenforced: learningDriftData.summary?.highUnenforced }
    : null,
  stderr: learningDrift.stderr,
})
const hostCapabilities = run(process.execPath, [path.join(root, 'scripts', 'audit-host-capabilities.mjs'), '--root', root, '--target', root, '--json'])
const hostCapabilitiesData = parseJson(hostCapabilities.stdout)
checks.push({
  id: 'validate-22d',
  label: 'host capability record audit',
  status: hostCapabilities.status === 0 ? 'passed' : 'failed',
  command: hostCapabilities.command,
  summary: hostCapabilitiesData
    ? { status: hostCapabilitiesData.summary?.status, checks: hostCapabilitiesData.summary ? hostCapabilitiesData.summary.passed + '/' + hostCapabilitiesData.summary.total : null, hostCapabilityRecords: hostCapabilitiesData.workflows?.hostCapabilityRecords, nativeSlashCommandBoundary: hostCapabilitiesData.workflows?.nativeSlashCommandBoundary }
    : null,
  stderr: hostCapabilities.stderr,
})
const toolFallbackPolicy = run(process.execPath, [path.join(root, 'scripts', 'audit-tool-fallback-policy.mjs'), '--root', root, '--target', root, '--json'])
const toolFallbackPolicyData = parseJson(toolFallbackPolicy.stdout)
checks.push({
  id: 'validate-22d2',
  label: 'optional tool fallback policy audit',
  status: toolFallbackPolicy.status === 0 ? 'passed' : 'failed',
  command: toolFallbackPolicy.command,
  summary: toolFallbackPolicyData
    ? { status: toolFallbackPolicyData.summary?.status, checks: toolFallbackPolicyData.summary ? toolFallbackPolicyData.summary.passed + '/' + toolFallbackPolicyData.summary.total : null, optionalToolFallbackPolicy: toolFallbackPolicyData.workflows?.optionalToolFallbackPolicy }
    : null,
  stderr: toolFallbackPolicy.stderr,
})
const capabilityExecutionMatrix = run(process.execPath, [path.join(root, 'scripts', 'audit-capability-execution-matrix.mjs'), '--root', root, '--json'])
const capabilityExecutionMatrixData = parseJson(capabilityExecutionMatrix.stdout)
checks.push({
  id: 'validate-22d3',
  label: 'capability execution matrix audit',
  status: capabilityExecutionMatrix.status === 0 ? 'passed' : 'failed',
  command: capabilityExecutionMatrix.command,
  summary: capabilityExecutionMatrixData
    ? { status: capabilityExecutionMatrixData.summary?.status, checks: capabilityExecutionMatrixData.summary ? capabilityExecutionMatrixData.summary.passed + '/' + capabilityExecutionMatrixData.summary.total : null, rows: capabilityExecutionMatrixData.summary?.rows, capabilityExecutionMatrix: capabilityExecutionMatrixData.workflows?.capabilityExecutionMatrix }
    : null,
  stderr: capabilityExecutionMatrix.stderr,
})
const fullStackDeliveryPacks = run(process.execPath, [path.join(root, 'scripts', 'audit-full-stack-delivery-packs.mjs'), '--root', root, '--json'])
const fullStackDeliveryPacksData = parseJson(fullStackDeliveryPacks.stdout)
checks.push({
  id: 'validate-22d4',
  label: 'full-stack delivery packs audit',
  status: fullStackDeliveryPacks.status === 0 ? 'passed' : 'failed',
  command: fullStackDeliveryPacks.command,
  summary: fullStackDeliveryPacksData
    ? { status: fullStackDeliveryPacksData.summary?.status, checks: fullStackDeliveryPacksData.summary ? fullStackDeliveryPacksData.summary.passed + '/' + fullStackDeliveryPacksData.summary.total : null, fixtures: fullStackDeliveryPacksData.summary?.fixtures, fullStackDeliveryPacks: fullStackDeliveryPacksData.workflows?.fullStackDeliveryPacks }
    : null,
  stderr: fullStackDeliveryPacks.stderr,
})
const stageOrchestrator = run(process.execPath, [path.join(root, 'scripts', 'audit-stage-orchestrator.mjs'), '--root', root, '--json'])
const stageOrchestratorData = parseJson(stageOrchestrator.stdout)
checks.push({
  id: 'validate-22d5',
  label: 'stage orchestrator audit',
  status: stageOrchestrator.status === 0 ? 'passed' : 'failed',
  command: stageOrchestrator.command,
  summary: stageOrchestratorData
    ? { status: stageOrchestratorData.summary?.status, checks: stageOrchestratorData.summary ? stageOrchestratorData.summary.passed + '/' + stageOrchestratorData.summary.total : null, stageOrchestrator: stageOrchestratorData.workflows?.stageOrchestrator }
    : null,
  stderr: stageOrchestrator.stderr,
})
const goalDiscovery = run(process.execPath, [path.join(root, 'scripts', 'audit-goal-discovery.mjs'), '--root', root, '--json'])
const goalDiscoveryData = parseJson(goalDiscovery.stdout)
checks.push({
  id: 'validate-22d6',
  label: 'goal discovery and Goal/Spec promotion audit',
  status: goalDiscovery.status === 0 ? 'passed' : 'failed',
  command: goalDiscovery.command,
  summary: goalDiscoveryData
    ? { status: goalDiscoveryData.summary?.status, checks: goalDiscoveryData.summary ? goalDiscoveryData.summary.passed + '/' + goalDiscoveryData.summary.total : null }
    : null,
  stderr: goalDiscovery.stderr,
})
const targetHardeningDrills = run(process.execPath, [path.join(root, 'scripts', 'audit-target-hardening-drills.mjs'), '--root', root, '--json'])
const targetHardeningDrillsData = parseJson(targetHardeningDrills.stdout)
const targetHardeningAdoptionFailures = adoptionSummaryFailures(targetHardeningDrillsData)
checks.push({
  id: 'validate-22e',
  label: 'target project hardening drill audit',
  status: targetHardeningDrills.status === 0 && targetHardeningAdoptionFailures.length === 0 ? 'passed' : 'failed',
  command: targetHardeningDrills.command,
  summary: targetHardeningDrillsData
    ? { status: targetHardeningDrillsData.summary?.status, checks: targetHardeningDrillsData.summary ? targetHardeningDrillsData.summary.passed + '/' + targetHardeningDrillsData.summary.total : null, mode: targetHardeningDrillsData.summary?.mode, targetHardeningDrills: targetHardeningDrillsData.workflows?.targetHardeningDrills, targetAdoptionHygieneSummary: targetHardeningDrillsData.workflows?.targetAdoptionHygieneSummary, adoptionFailures: targetHardeningAdoptionFailures }
    : null,
  stderr: targetHardeningAdoptionFailures.length > 0 ? targetHardeningAdoptionFailures.join('; ') : targetHardeningDrills.stderr,
})
const maintenanceCadence = run(process.execPath, [path.join(root, 'scripts', 'audit-maintenance-cadence.mjs'), '--root', root, '--json'])
const maintenanceCadenceData = parseJson(maintenanceCadence.stdout)
checks.push({
  id: 'validate-22f',
  label: 'maintenance cadence audit',
  status: maintenanceCadence.status === 0 ? 'passed' : 'failed',
  command: maintenanceCadence.command,
  summary: maintenanceCadenceData
    ? { status: maintenanceCadenceData.summary?.status, checks: maintenanceCadenceData.summary ? maintenanceCadenceData.summary.passed + '/' + maintenanceCadenceData.summary.total : null, maintenanceCadence: maintenanceCadenceData.workflows?.maintenanceCadence }
    : null,
  stderr: maintenanceCadence.stderr,
})
const maintenanceSnapshot = run(process.execPath, [path.join(root, 'scripts', 'audit-maintenance-snapshot.mjs'), '--root', root, '--json'])
const maintenanceSnapshotData = parseJson(maintenanceSnapshot.stdout)
checks.push({
  id: 'validate-22f2',
  label: 'maintenance snapshot audit',
  status: maintenanceSnapshot.status === 0 ? 'passed' : 'failed',
  command: maintenanceSnapshot.command,
  summary: maintenanceSnapshotData
    ? { status: maintenanceSnapshotData.summary?.status, checks: maintenanceSnapshotData.summary ? maintenanceSnapshotData.summary.passed + '/' + maintenanceSnapshotData.summary.total : null, maintenanceSnapshot: maintenanceSnapshotData.workflows?.maintenanceSnapshot }
    : null,
  stderr: maintenanceSnapshot.stderr,
})
const installedSync = run(process.execPath, [path.join(root, 'scripts', 'audit-installed-sync.mjs'), '--root', root, '--json'])
const installedSyncData = parseJson(installedSync.stdout)
checks.push({
  id: 'validate-22g',
  label: 'installed sync freshness audit',
  status: installedSync.status === 0 ? 'passed' : 'failed',
  command: installedSync.command,
  summary: installedSyncData
    ? { status: installedSyncData.summary?.status, checks: installedSyncData.summary ? installedSyncData.summary.passed + '/' + installedSyncData.summary.total : null, freshPackage: installedSyncData.workflows?.freshPackage, installedSync: installedSyncData.workflows?.installedSync }
    : null,
  stderr: installedSync.stderr,
})
const readmeDocs = run(process.execPath, [path.join(root, 'scripts', 'audit-readme-docs.mjs'), '--root', root, '--json'])
const readmeDocsData = parseJson(readmeDocs.stdout)
checks.push({
  id: 'validate-23',
  label: 'bilingual README docs audit',
  status: readmeDocs.status === 0 ? 'passed' : 'failed',
  command: readmeDocs.command,
  summary: readmeDocsData
    ? { status: readmeDocsData.summary?.status, checks: readmeDocsData.summary ? readmeDocsData.summary.passed + '/' + readmeDocsData.summary.total : null, readmeDocs: readmeDocsData.workflows?.readmeDocs }
    : null,
  stderr: readmeDocs.stderr,
})
const targetProjectDoctor = run(process.execPath, [path.join(root, 'scripts', 'audit-target-project.mjs'), '--root', root, '--json'])
const targetProjectDoctorData = parseJson(targetProjectDoctor.stdout)
checks.push({
  id: 'validate-24',
  label: 'target project doctor self-test',
  status: targetProjectDoctor.status === 0 ? 'passed' : 'failed',
  command: targetProjectDoctor.command,
  summary: targetProjectDoctorData
    ? { status: targetProjectDoctorData.summary?.status, checks: targetProjectDoctorData.summary ? targetProjectDoctorData.summary.passed + '/' + targetProjectDoctorData.summary.total : null, targetProjectDoctor: targetProjectDoctorData.workflows?.targetProjectDoctor }
    : null,
  stderr: targetProjectDoctor.stderr,
})
const stateFreshness = run(process.execPath, [path.join(root, 'scripts', 'audit-state-freshness.mjs'), '--root', root, '--json'])
const stateFreshnessData = parseJson(stateFreshness.stdout)
checks.push({
  id: 'validate-24b',
  label: 'machine-readable state freshness audit',
  status: stateFreshness.status === 0 ? 'passed' : 'failed',
  command: stateFreshness.command,
  summary: stateFreshnessData
    ? { status: stateFreshnessData.summary?.status, checks: stateFreshnessData.summary ? stateFreshnessData.summary.passed + '/' + stateFreshnessData.summary.total : null, stateFreshness: stateFreshnessData.workflows?.stateFreshness, pendingGates: stateFreshnessData.workflows?.pendingGates }
    : null,
  stderr: stateFreshness.stderr,
})
const sessionPrompt = run(process.execPath, [path.join(root, 'scripts', 'generate-session-prompt.mjs'), '--root', root, '--json'])
const sessionPromptData = parseJson(sessionPrompt.stdout)
checks.push({
  id: 'validate-25',
  label: 'session prompt generator self-test',
  status: sessionPrompt.status === 0 && sessionPromptData?.prompt?.includes('Use GSE to continue') ? 'passed' : 'failed',
  command: sessionPrompt.command,
  summary: sessionPromptData
    ? { status: sessionPromptData.summary?.status, warnings: sessionPromptData.summary?.warnings, promptLines: sessionPromptData.summary?.promptLines, stateValid: sessionPromptData.state?.valid }
    : null,
  stderr: sessionPrompt.stderr,
})
const closeGate = run(process.execPath, [path.join(root, 'scripts', 'audit-close-gate.mjs'), '--root', root, '--json'])
const closeGateData = parseJson(closeGate.stdout)
checks.push({
  id: 'validate-26',
  label: 'close gate self-test',
  status: closeGate.status === 0 && closeGateData?.summary?.status === 'ready' ? 'passed' : 'failed',
  command: closeGate.command,
  summary: closeGateData
    ? { status: closeGateData.summary?.status, checks: closeGateData.summary ? closeGateData.summary.passed + '/' + closeGateData.summary.total : null, closeGate: closeGateData.workflows?.closeGate }
    : null,
  stderr: closeGate.stderr,
})
const v1TargetValidation = run(process.execPath, [path.join(root, 'scripts', 'audit-v1-target-validation.mjs'), '--root', root, '--json'])
const v1TargetData = parseJson(v1TargetValidation.stdout)
checks.push({
  id: 'validate-27',
  label: 'configured v1 target validation',
  status: v1TargetData?.summary?.status === 'skipped' ? 'skipped' : v1TargetValidation.status === 0 ? 'passed' : 'failed',
  command: v1TargetValidation.command,
  summary: v1TargetData
    ? { status: v1TargetData.summary?.status, checks: v1TargetData.summary ? v1TargetData.summary.passed + '/' + v1TargetData.summary.total : null, skipped: v1TargetData.summary?.skipped, v1TargetValidation: v1TargetData.workflows?.v1TargetValidation }
    : null,
  stderr: v1TargetValidation.stderr,
})
const updateProjectState = run(process.execPath, [path.join(root, 'scripts', 'update-project-state.mjs'), '--root', root, '--json'])
const updateProjectStateData = parseJson(updateProjectState.stdout)
checks.push({
  id: 'validate-28',
  label: 'project state update self-test',
  status: updateProjectState.status === 0 && updateProjectStateData?.summary?.written === 2 ? 'passed' : 'failed',
  command: updateProjectState.command,
  summary: updateProjectStateData
    ? { status: updateProjectStateData.summary?.status, written: updateProjectStateData.summary?.written, skipped: updateProjectStateData.summary?.skipped, warnings: updateProjectStateData.summary?.warnings }
    : null,
  stderr: updateProjectState.stderr,
})
checks.push({
  id: 'validate-29',
  label: 'skill validator via py',
  status: validatorSummary.status,
  command: validatorSummary.command ?? null,
  summary: validatorSummary,
  stderr: validatorSummary.stderr ?? '',
})

const bom = checkBom()
checks.push({
  id: 'validate-30',
  label: 'markdown/yaml/mjs BOM check',
  status: bom.status,
  command: 'internal BOM scan',
  summary: bom,
  stderr: '',
})

const failed = checks.filter((item) => item.status === 'failed').length
const skipped = checks.filter((item) => item.status === 'skipped').length
const passed = checks.filter((item) => item.status === 'passed').length
const durationMs = Date.now() - validationStartedMs
const slowestChecks = checks
  .map((item) => ({
    id: item.id,
    label: item.label,
    status: item.status,
    durationMs: commandDurations.get(item.command) ?? null,
  }))
  .filter((item) => Number.isFinite(item.durationMs))
  .sort((a, b) => b.durationMs - a.durationMs)
  .slice(0, 5)
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: {
    status: failed === 0 ? 'passed' : 'failed',
    passed,
    failed,
    skipped,
    total: checks.length,
    durationMs,
    slowestChecks,
  },
  limits: [
    'validate-gse consolidates existing local structural, adoption, fixture, host-adapter, and documented forward-test checks; it does not certify arbitrary real repositories.',
    'Skill validator is run through py when available because bare python is known unreliable in this shell.',
    'Fresh-session acceptance still requires a separate run using documented GSE inputs.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Validation')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + ' passed, ' + data.summary.failed + ' failed, ' + data.summary.skipped + ' skipped, ' + data.summary.total + ' total')
  lines.push('- Duration: ' + data.summary.durationMs + ' ms')
  if (data.summary.slowestChecks?.length) {
    lines.push('- Slowest checks: ' + data.summary.slowestChecks.map((item) => item.id + ' (' + item.durationMs + ' ms)').join(', '))
  }
  lines.push('')
  lines.push('## Checks')
  lines.push('')
  for (const item of data.checks) {
    const marker = item.status === 'passed' ? '[x]' : item.status === 'skipped' ? '[-]' : '[ ]'
    lines.push('- ' + marker + ' ' + item.id + ' ' + item.label + ': ' + item.status)
    if (item.summary) lines.push('  - Summary: ' + JSON.stringify(item.summary))
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
