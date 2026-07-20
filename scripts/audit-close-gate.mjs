#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { analyzeEvidenceLevels } from './audit-evidence-levels.mjs'
import { readRoleDispatchFallback } from './audit-role-dispatch-fallback.mjs'
import { compareDerivedChange, deriveActiveChange } from './core/change-state.mjs'
import { currentEvidenceBasis, deriveCurrentEvidenceDependencies } from './core/evidence-basis.mjs'
import {
  evaluateCloseConsistency,
  evaluateCriterionBinding,
  evaluateEvidenceClaim,
  evaluateEvidenceFreshness,
} from './core/evidence.mjs'
import { readAtomicJson } from './core/persistence/atomic-json.mjs'
import { readCommittedJsonl } from './core/persistence/jsonl.mjs'
import { inspectPendingTransactions } from './core/persistence/recovery.mjs'
import { ALLOWED_FIELDS_BY_RECORD_TYPE } from './core/persistence/record-allowlists.mjs'
import { executeTransaction } from './core/persistence/transaction.mjs'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const jsonOnly = args.includes('--json')
const selfTest = args.includes('--self-test') || !args.includes('--target')
const targetArg = readArg('--target')

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, ok: false, data: null, error: 'missing' }
  try {
    return { exists: true, ok: true, data: JSON.parse(readText(filePath)), error: '' }
  } catch (error) {
    return { exists: true, ok: false, data: null, error: error.message }
  }
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, ok: false, records: [], error: 'missing' }
  const lines = readText(filePath)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const records = []
  for (const [index, line] of lines.entries()) {
    try {
      records.push(JSON.parse(line))
    } catch (error) {
      return { exists: true, ok: false, records, error: `line ${index + 1}: ${error.message}` }
    }
  }
  return { exists: true, ok: true, records, error: '' }
}

function exists(target, relativePath) {
  return fs.existsSync(path.join(target, relativePath))
}

function runGit(target, commandArgs) {
  const result = spawnSync('git', commandArgs, {
    cwd: target,
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trimEnd(),
    stderr: (result.stderr ?? '').trimEnd(),
  }
}

function normalizeGitPath(rawPath) {
  const normalized = rawPath.replace(/\\/g, '/')
  const renameMarker = ' -> '
  if (normalized.includes(renameMarker)) return normalized.split(renameMarker).pop()
  return normalized
}

function parseGitPorcelain(text) {
  const entries = []
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    const x = line[0] ?? ' '
    const y = line[1] ?? ' '
    const rawPath = line.slice(3).trim()
    const filePath = normalizeGitPath(rawPath)
    const untracked = x === '?' && y === '?'
    const staged = !untracked && x !== ' '
    const unstaged = !untracked && y !== ' '
    const conflict = x === 'U' || y === 'U' || ['AA', 'DD', 'AU', 'UA', 'DU', 'UD', 'UU'].includes(x + y)
    entries.push({ code: x + y, path: filePath, staged, unstaged, untracked, conflict })
  }
  return entries
}

const generatedArtifactPatterns = [
  /^output\//,
  /^playwright-report\//,
  /^test-results\//,
  /^coverage\//,
  /^\.nyc_output\//,
  /^node_modules\//,
  /^\.turbo\//,
  /^\.next\//,
  /^dist\//,
]

function isGeneratedArtifact(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/')
  return generatedArtifactPatterns.some((pattern) => pattern.test(normalized))
}

function summarizeGitEntries(entries) {
  const staged = entries.filter((entry) => entry.staged)
  const unstaged = entries.filter((entry) => entry.unstaged)
  const untracked = entries.filter((entry) => entry.untracked)
  const conflicts = entries.filter((entry) => entry.conflict)
  const mixed = entries.filter((entry) => entry.staged && entry.unstaged)
  const stagedGenerated = staged.filter((entry) => isGeneratedArtifact(entry.path))
  const dirtyGenerated = entries.filter((entry) => !entry.staged && isGeneratedArtifact(entry.path))
  return { staged, unstaged, untracked, conflicts, mixed, stagedGenerated, dirtyGenerated }
}

function statusFrom(ok, warn = false) {
  if (ok) return 'passed'
  if (warn) return 'warning'
  return 'failed'
}

function check(id, label, status, evidence, recommendation = '') {
  return { id, label, status, evidence, recommendation }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

function validEvidenceDependencies(dependencies) {
  return dependencies !== null
    && typeof dependencies === 'object'
    && Number.isInteger(dependencies.sourceRevision)
    && dependencies.sourceRevision >= 0
    && (dependencies.dirtyWorktreeDigest === null || nonEmptyString(dependencies.dirtyWorktreeDigest))
    && Array.isArray(dependencies.inputPaths)
    && Array.isArray(dependencies.generatedArtifacts)
    && Array.isArray(dependencies.configuration)
    && nonEmptyString(dependencies.contractRevision)
    && nonEmptyString(dependencies.environmentFingerprint)
    && nonEmptyString(dependencies.hostCapabilityBasis)
}

function validCoreEvidenceRecord(record) {
  return record?.schemaVersion === 1
    && nonEmptyString(record.eventId)
    && nonEmptyString(record.transactionId)
    && nonEmptyString(record.date)
    && nonEmptyString(record.timestamp)
    && nonEmptyString(record.recordType)
    && (record.changeId === null || nonEmptyString(record.changeId))
    && (record.taskId === null || nonEmptyString(record.taskId))
    && Number.isInteger(record.stateRevision)
    && record.stateRevision >= 0
    && nonEmptyString(record.claim)
    && nonEmptyString(record.evidenceClass)
    && typeof record.method === 'string'
    && validEvidenceDependencies(record.dependencies)
    && Array.isArray(record.invalidationScope)
    && nonEmptyString(record.outcome)
    && Array.isArray(record.limitations)
    && nonEmptyString(record.actor)
    && nonEmptyString(record.evidenceFile)
    && Array.isArray(record.relatedArtifacts)
    && (record.nextAction === null || typeof record.nextAction === 'string')
    && evaluateEvidenceClaim(record).valid
    && evaluateCriterionBinding(record).valid
}

function validLegacyEvidenceRecord(record) {
  return nonEmptyString(record?.date)
    && nonEmptyString(record.recordType)
    && nonEmptyString(record.status)
    && nonEmptyString(record.summary)
    && nonEmptyString(record.evidenceFile)
    && Array.isArray(record.commands)
    && typeof record.nextAction === 'string'
}

export function validEvidenceIndexRecord(record) {
  return record?.schemaVersion === 1
    ? validCoreEvidenceRecord(record)
    : validLegacyEvidenceRecord(record)
}

async function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-close-gate-'))
  const changeId = 'fixture-close'
  const changeDir = path.join(dir, '.gse', 'changes', changeId)
  fs.mkdirSync(path.join(dir, '.gse', 'evidence'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.gse', 'agents'), { recursive: true })
  fs.mkdirSync(changeDir, { recursive: true })
  fs.writeFileSync(path.join(dir, '.gse', 'README.md'), '# GSE\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'project-profile.md'), '# Project Profile\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'goal-map.md'), '# Goal Map\n\nNext action: archive slice.\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'quality-gates.md'), '# Quality Gates\n\n## Universal\n\n- Evidence required.\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'evidence', '2026-07-06.md'), '# Evidence\n\nEvidence status: verified.\n', 'utf8')
  for (const [name, content] of [
    ['brief.md', '# Fixture close\n'], ['spec.md', '# Spec\n'], ['design.md', '# Design\n'],
    ['tasks.md', '# Tasks\n'], ['evidence.md', '# Evidence\n'], ['review.md', '# Review\n\n## Closure\n'],
  ]) fs.writeFileSync(path.join(changeDir, name), content, 'utf8')

  const state = {
    schemaVersion: 1,
    stateRevision: 1,
    sourceRevision: 1,
    activeChangeId: changeId,
    projectName: 'fixture-product',
    mode: 'standard',
    canonicalPlan: '',
    phase: 'verify',
    currentSlice: { id: changeId, outcome: 'Fixture close gate.', status: 'verified', nextAction: 'Archive slice.' },
    toolStatuses: { browser: 'unknown', lsp: 'unknown', mcp: 'unknown', subagents: 'unknown', ci: 'unknown' },
    lastEvidence: '.gse/evidence/2026-07-06.md',
    residualRisks: ['Fixture residual risk.'],
  }
  fs.writeFileSync(path.join(dir, '.gse', 'state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  const activeChange = deriveActiveChange(dir, changeId, { stateRevision: 1 })
  fs.writeFileSync(path.join(changeDir, 'change.json'), `${JSON.stringify(activeChange, null, 2)}\n`, 'utf8')
  runGit(dir, ['init'])
  runGit(dir, ['config', 'user.email', 'gse-fixture@example.local'])
  runGit(dir, ['config', 'user.name', 'GSE Fixture'])
  runGit(dir, ['add', '.'])
  runGit(dir, ['commit', '-m', 'fixture baseline'])
  const dependencies = deriveCurrentEvidenceDependencies(dir, {
    projectState: state,
    activeChange,
  })
  const timestamp = '2026-07-06T00:00:00.000Z'
  await executeTransaction({
    target: dir,
    operationId: 'close-gate-fixture-evidence',
    expectedRevision: 1,
    writes: [],
    events: [{ path: '.gse/evidence/index.jsonl', event: {
      schemaVersion: 1,
      eventId: 'fixture-close-evidence',
      date: '2026-07-06',
      timestamp,
      recordType: 'evidence-event',
      changeId,
      taskId: null,
      stateRevision: 2,
      status: 'verified',
      evidenceLevel: 'verified-unit',
      requiredEvidenceLevel: 'verified-unit',
      claim: 'Fixture close gate evidence.',
      evidenceClass: 'test',
      method: 'fixture',
      dependencies,
      invalidationScope: ['stateRevision', 'dependencies'],
      outcome: 'passed',
      limitations: [],
      actor: 'fixture',
      evidenceFile: '.gse/evidence/2026-07-06.md',
      relatedArtifacts: [],
      nextAction: 'Archive slice.',
    } }],
    allowedFieldsByRecordType: ALLOWED_FIELDS_BY_RECORD_TYPE,
  })
  const revised = deriveActiveChange(dir, changeId, { stateRevision: 2 })
  fs.writeFileSync(path.join(changeDir, 'change.json'), `${JSON.stringify(revised, null, 2)}\n`, 'utf8')

  fs.writeFileSync(path.join(dir, '.gse', 'agents', 'role-fallback-packets.md'), [
    '# Role Fallback Packets', '',
    '| Role | Mode | Real delegation used | Tool status | Fallback output | Evidence | Stop condition | Write access |',
    '|---|---|---|---|---|---|---|---|',
    '| Planner | sequential-role | no | unknown | Plan | fixture plan | Plan accepted | read-only |',
    '| Locator | sequential-role | no | unknown | File map | fixture map | Files identified | read-only |',
    '| Implementer | sequential-role | no | unknown | Patch | fixture patch | Patch complete | assigned files |',
    '| Verifier | sequential-role | no | unknown | Test results | fixture tests | Focused checks pass | evidence only |',
    '| Reviewer | sequential-role | no | unknown | Review notes | fixture review | No blocking findings | read-only |',
    '| Docs/Evidence | sequential-role | no | unknown | Evidence log | fixture evidence | Evidence recorded | docs/evidence only |',
    '| Release | sequential-role | no | unknown | Claim boundary | fixture release | External gates visible | read-only |', '',
  ].join('\n'), 'utf8')
  runGit(dir, ['add', '.'])
  runGit(dir, ['commit', '-m', 'fixture'])
  return dir
}

export function auditCloseGate(target, { requestedStatus = 'verified' } = {}) {
  const resolvedTarget = path.resolve(target)
  const gseDir = path.join(resolvedTarget, '.gse')
  const state = readJson(path.join(gseDir, 'state.json'))
  let committedEvidence
  try {
    committedEvidence = readCommittedJsonl(resolvedTarget, '.gse/evidence/index.jsonl', { allowMissing: true })
  } catch (error) {
    committedEvidence = { records: [], corruptTail: [{ reasonCode: error.code ?? 'READ_FAILED' }] }
  }
  const evidenceIndex = {
    exists: fs.existsSync(path.join(gseDir, 'evidence', 'index.jsonl')),
    ok: committedEvidence.corruptTail.length === 0,
    records: committedEvidence.records,
    error: committedEvidence.corruptTail.map((item) => item.reasonCode).join(', '),
  }
  const evidenceLevelAnalysis = analyzeEvidenceLevels(evidenceIndex.records)
  const checks = []

  checks.push(
    check(
      'CG01',
      '.gse directory exists',
      statusFrom(exists(resolvedTarget, '.gse')),
      exists(resolvedTarget, '.gse') ? '.gse exists' : '.gse missing',
      exists(resolvedTarget, '.gse') ? '' : 'Initialize or adopt GSE before closing a slice.',
    ),
  )

  const stateValid =
    state.ok &&
    state.data?.schemaVersion === 1 &&
    typeof state.data?.phase === 'string' &&
    typeof state.data?.currentSlice?.status === 'string' &&
    typeof state.data?.currentSlice?.nextAction === 'string'
  checks.push(
    check(
      'CG02',
      'state.json is valid',
      statusFrom(stateValid),
      state.exists ? state.ok ? `phase:${state.data.phase}, status:${state.data.currentSlice?.status}` : 'invalid ' + state.error : 'missing',
      stateValid ? '' : 'Repair .gse/state.json before closing the slice.',
    ),
  )

  const indexValid =
    evidenceIndex.ok &&
    evidenceIndex.records.length > 0 &&
    evidenceIndex.records.every(validEvidenceIndexRecord)
  checks.push(
    check(
      'CG03',
      'evidence index is valid',
      statusFrom(indexValid),
      evidenceIndex.exists ? evidenceIndex.ok ? `${evidenceIndex.records.length} record(s)` : 'invalid ' + evidenceIndex.error : 'missing',
      indexValid ? '' : 'Record at least one evidence index entry before closing.',
    ),
  )

  const closeableState = ['verified', 'accepted'].includes(state.data?.currentSlice?.status)
  checks.push(
    check(
      'CG04',
      'current slice status is closeable',
      statusFrom(closeableState),
      `currentSlice.status:${state.data?.currentSlice?.status ?? 'unknown'}`,
      closeableState ? '' : 'Set currentSlice.status to verified or accepted only after focused evidence exists.',
    ),
  )

  const closeableEvidenceRecords = evidenceIndex.records.filter((record) => ['verified', 'accepted'].includes(record.status))
  const evidenceFilesExist =
    closeableEvidenceRecords.length > 0 &&
    closeableEvidenceRecords.every((record) => exists(resolvedTarget, record.evidenceFile))
  checks.push(
    check(
      'CG05',
      'verified or accepted evidence record exists',
      statusFrom(evidenceFilesExist),
      closeableEvidenceRecords.length
        ? closeableEvidenceRecords.map((record) => `${record.status}:${record.evidenceFile}:${exists(resolvedTarget, record.evidenceFile) ? 'exists' : 'missing'}`).join('; ')
        : 'no verified/accepted evidence index record',
      evidenceFilesExist ? '' : 'Add verified evidence and ensure the referenced evidence file exists.',
    ),
  )

  const requiredDocs = ['.gse/README.md', '.gse/project-profile.md', '.gse/goal-map.md', '.gse/quality-gates.md']
  const missingDocs = requiredDocs.filter((relativePath) => !exists(resolvedTarget, relativePath))
  checks.push(
    check(
      'CG06',
      'required workflow docs exist',
      statusFrom(missingDocs.length === 0),
      missingDocs.length ? 'missing: ' + missingDocs.join(', ') : `${requiredDocs.length}/${requiredDocs.length} present`,
      missingDocs.length ? 'Restore required workflow docs before closing.' : '',
    ),
  )

  const residualRisksOk = Array.isArray(state.data?.residualRisks)
  checks.push(
    check(
      'CG07',
      'residual risks are explicit',
      statusFrom(residualRisksOk),
      residualRisksOk ? `${state.data.residualRisks.length} residual risk(s)` : 'missing residualRisks array',
      residualRisksOk ? '' : 'Use an empty array if there is no known residual risk.',
    ),
  )

  const gitRoot = runGit(resolvedTarget, ['rev-parse', '--show-toplevel'])
  const isGitRepo = gitRoot.status === 0
  const gseStatus = isGitRepo ? runGit(resolvedTarget, ['status', '--short', '.gse']) : { status: 1, stdout: '', stderr: 'not a git repository' }
  checks.push(
    check(
      'CG08',
      '.gse git state is known',
      isGitRepo ? (gseStatus.stdout ? 'warning' : 'passed') : 'warning',
      isGitRepo ? gseStatus.stdout || 'clean' : 'not a git repository',
      isGitRepo && gseStatus.stdout ? 'Review and intentionally stage/commit or document project-local GSE changes.' : '',
    ),
  )

  const evidenceLevelStatus = evidenceLevelAnalysis.invalidLevel.length > 0
    ? 'failed'
    : evidenceLevelAnalysis.downgraded.length > 0 || evidenceLevelAnalysis.missingLevel.length > 0 || evidenceLevelAnalysis.missingDependencies.length > 0
      ? 'warning'
      : 'passed'
  checks.push(
    check(
      'CG09',
      'evidence level validity and downgrade labels are visible',
      evidenceLevelStatus,
      evidenceLevelAnalysis.invalidLevel.length
        ? `invalid evidence level(s): ${evidenceLevelAnalysis.invalidLevel.map((item) => `${item.summary}:${item.evidenceLevel}`).join('; ')}`
        : `${evidenceLevelAnalysis.recordsWithLevel}/${evidenceLevelAnalysis.records} record(s) with evidenceLevel; ${evidenceLevelAnalysis.downgraded.length} downgrade(s); ${evidenceLevelAnalysis.missingLevel.length} historical missing; ${evidenceLevelAnalysis.missingDependencies.length} schema-v1 missing dependency metadata`,
      evidenceLevelAnalysis.invalidLevel.length
        ? 'Use one of the evidence levels from references/evidence-taxonomy.md.'
        : evidenceLevelAnalysis.downgraded.length || evidenceLevelAnalysis.missingDependencies.length
          ? 'Record whether the downgrade is acceptable; schema-v1 records missing dependency metadata cannot satisfy revision-aware Close.'
          : '',
    ),
  )

  const roleFallback = readRoleDispatchFallback(resolvedTarget)
  const roleFallbackStatus = roleFallback.status === 'failed' ? 'failed' : roleFallback.status === 'warning' ? 'warning' : 'passed'
  checks.push(
    check(
      'CG10',
      'role dispatch and subagent claims are honest',
      roleFallbackStatus,
      roleFallback.exists
        ? roleFallback.summary.fakeDelegationRisk.length
          ? `fake delegation risk: ${roleFallback.summary.fakeDelegationRisk.join(', ')}`
          : `${roleFallback.summary.total} role packet(s); ${roleFallback.summary.sequentialFallbackRoles.length} sequential fallback role(s)`
        : 'role fallback packet missing',
      roleFallbackStatus === 'failed'
        ? 'Do not claim real subagent dispatch unless the current host/tool status is verified.'
        : roleFallbackStatus === 'warning'
          ? 'Adopt role fallback packets or record why role dispatch evidence is unavailable.'
          : '',
    ),
  )

  const fullGitStatus = isGitRepo ? runGit(resolvedTarget, ['status', '--porcelain=v1']) : { status: 1, stdout: '', stderr: 'not a git repository' }
  const gitEntries = isGitRepo && fullGitStatus.status === 0 ? parseGitPorcelain(fullGitStatus.stdout) : []
  const gitSummary = summarizeGitEntries(gitEntries)
  const ownershipStatus = !isGitRepo
    ? 'warning'
    : gitSummary.conflicts.length > 0 || gitSummary.mixed.length > 0
      ? 'failed'
      : gitEntries.length > 0
        ? 'warning'
        : 'passed'
  checks.push(
    check(
      'CG11',
      'worktree change ownership is bounded before close',
      ownershipStatus,
      isGitRepo
        ? gitEntries.length
          ? `${gitSummary.staged.length} staged, ${gitSummary.unstaged.length} unstaged, ${gitSummary.untracked.length} untracked, ${gitSummary.mixed.length} mixed, ${gitSummary.conflicts.length} conflict(s)`
          : 'worktree clean'
        : 'not a git repository',
      ownershipStatus === 'failed'
        ? 'Resolve merge conflicts or mixed staged/unstaged edits before closing so ownership and evidence are unambiguous.'
        : ownershipStatus === 'warning'
          ? 'Review changed files, exclude unrelated or generated artifacts, and stage/commit only the current slice.'
          : '',
    ),
  )

  const artifactStatus = gitSummary.stagedGenerated.length > 0 ? 'failed' : gitSummary.dirtyGenerated.length > 0 ? 'warning' : 'passed'
  checks.push(
    check(
      'CG12',
      'generated test artifacts are not staged as slice evidence',
      artifactStatus,
      gitSummary.stagedGenerated.length
        ? `staged generated artifact(s): ${gitSummary.stagedGenerated.map((entry) => entry.path).join(', ')}`
        : gitSummary.dirtyGenerated.length
          ? `dirty generated artifact(s): ${gitSummary.dirtyGenerated.map((entry) => entry.path).join(', ')}`
          : 'no generated/test output artifacts staged',
      artifactStatus === 'failed'
        ? 'Unstage generated test/browser/build artifacts unless the project explicitly requires them as source.'
        : artifactStatus === 'warning'
          ? 'Keep generated artifacts out of the commit or explain why they are required.'
          : '',
    ),
  )

  const projectState = state.ok ? state.data : null
  const activeChangeId = projectState?.activeChangeId
  const hasActiveChangeReference = typeof activeChangeId === 'string'
  const activeChange = hasActiveChangeReference
    ? readAtomicJson(resolvedTarget, `.gse/changes/${activeChangeId}/change.json`, { allowMissing: true })
    : null
  const pendingInspection = inspectPendingTransactions(resolvedTarget)
  const pendingTransactions = [
    ...(pendingInspection.transactions ?? []),
    ...(pendingInspection.diagnostics ?? []).map((diagnostic) => ({ status: 'blocked', diagnostic })),
  ]
  const currentBasis = projectState && activeChange
    ? currentEvidenceBasis(resolvedTarget, { projectState, activeChange, evidenceRecords: evidenceIndex.records })
    : null
  const consistency = evaluateCloseConsistency(resolvedTarget, {
    projectState,
    activeChange,
    evidenceRecords: evidenceIndex.records,
    currentDependencies: currentBasis,
    pendingTransactions,
    requestedStatus,
  })
  const revisionAgreement = Number.isInteger(projectState?.stateRevision)
    && projectState.stateRevision === activeChange?.stateRevision
    && projectState.activeChangeId === activeChange?.changeId
  let derivedAgreement = false
  try {
    const derived = activeChange ? deriveActiveChange(resolvedTarget, activeChange.changeId, { stateRevision: projectState.stateRevision }) : null
    derivedAgreement = Boolean(derived && compareDerivedChange(activeChange, derived).status === 'proceed')
  } catch {}
  const currentProof = evidenceIndex.records.filter((record) =>
    record?.changeId === activeChangeId
    && record?.stateRevision === projectState?.stateRevision
    && typeof record?.claim === 'string'
    && record.claim.length > 0
    && ['verified', 'accepted'].includes(record?.status)
    && currentBasis !== null
    && evaluateEvidenceFreshness(resolvedTarget, record, currentBasis).current)
  const highestStatus = currentProof.some((record) => record.status === 'accepted') ? 'accepted' : currentProof.some((record) => record.status === 'verified') ? 'verified' : null
  const promotionSafe = requestedStatus === 'result'
    || requestedStatus === highestStatus
    || (requestedStatus === 'verified' && highestStatus === 'accepted')

  checks.push(
    check('CG13', 'no pending or unrecoverable transaction', statusFrom(pendingTransactions.length === 0), pendingTransactions.length === 0 ? 'no pending transactions' : `${pendingTransactions.length} pending or blocked transaction artifact(s)`, 'Recover or repair transactions before Close.'),
    check('CG14', 'project state and active Change revision agree', hasActiveChangeReference ? statusFrom(revisionAgreement) : 'passed', hasActiveChangeReference ? (revisionAgreement ? `revision:${projectState.stateRevision}, change:${activeChangeId}` : 'state/change identity or revision mismatch') : 'not applicable: no active Change reference', hasActiveChangeReference && !revisionAgreement ? 'Reconcile project state and active Change cache.' : ''),
    check('CG15', 'derived Change cache matches current source digests', hasActiveChangeReference ? statusFrom(derivedAgreement) : 'passed', hasActiveChangeReference ? (derivedAgreement ? 'derived source digests match cache' : 'derived source/cache contradiction') : 'not applicable: no active Change cache', hasActiveChangeReference && !derivedAgreement ? 'Refresh or repair the active Change cache.' : ''),
    check('CG16', 'current claim-matched evidence belongs to active Change/revision', hasActiveChangeReference ? statusFrom(currentProof.length > 0) : 'passed', hasActiveChangeReference ? (currentProof.length ? `${currentProof.length} current evidence record(s)` : consistency.reasonCode) : 'not applicable: no active Change claim', hasActiveChangeReference && currentProof.length === 0 ? 'Record current committed revision-aware evidence.' : ''),
    check('CG17', 'requested Close status does not silently promote evidence', hasActiveChangeReference ? statusFrom(promotionSafe && consistency.reasonCode !== 'EVIDENCE_LEVEL_INSUFFICIENT') : 'passed', hasActiveChangeReference ? (promotionSafe ? `requested:${requestedStatus}, highest:${highestStatus}` : `promotion blocked: requested:${requestedStatus}, highest:${highestStatus}`) : 'not applicable: no active Change to close', hasActiveChangeReference && (!promotionSafe || consistency.reasonCode === 'EVIDENCE_LEVEL_INSUFFICIENT') ? 'Record evidence at the requested status; Close never promotes it.' : ''),
  )

  const failed = checks.filter((item) => item.status === 'failed').length
  const warnings = checks.filter((item) => item.status === 'warning').length
  const passed = checks.filter((item) => item.status === 'passed').length

  return {
    target: resolvedTarget,
    generatedAt: new Date().toISOString(),
    summary: {
      status: failed > 0 ? 'not-ready' : warnings > 0 ? 'ready-with-warnings' : 'ready',
      passed,
      warnings,
      failed,
      total: checks.length,
    },
    workflows: {
      closeGate: failed > 0 ? 'not-ready' : warnings > 0 ? 'ready-with-warnings' : 'ready',
    },
    state: {
      exists: state.exists,
      valid: stateValid,
      phase: state.data?.phase ?? null,
      currentSliceStatus: state.data?.currentSlice?.status ?? null,
      nextAction: state.data?.currentSlice?.nextAction ?? null,
    },
    evidenceIndex: {
      exists: evidenceIndex.exists,
      valid: indexValid,
      records: evidenceIndex.records.length,
      closeableRecords: closeableEvidenceRecords.length,
      evidenceLevels: {
        recordsWithLevel: evidenceLevelAnalysis.recordsWithLevel,
        missingLevel: evidenceLevelAnalysis.missingLevel.length,
        invalidLevel: evidenceLevelAnalysis.invalidLevel,
        downgraded: evidenceLevelAnalysis.downgraded,
      },
    },
    roleFallback: {
      exists: roleFallback.exists,
      status: roleFallback.status,
      total: roleFallback.summary.total,
      fakeDelegationRisk: roleFallback.summary.fakeDelegationRisk,
    },
    git: {
      isGitRepo,
      changedFiles: gitEntries.length,
      staged: gitSummary.staged.length,
      unstaged: gitSummary.unstaged.length,
      untracked: gitSummary.untracked.length,
      mixed: gitSummary.mixed.length,
      conflicts: gitSummary.conflicts.length,
      stagedGenerated: gitSummary.stagedGenerated.map((entry) => entry.path),
      dirtyGenerated: gitSummary.dirtyGenerated.map((entry) => entry.path),
    },
    checks,
    limits: [
      'Close gate is diagnostic. It reports ready/not-ready and does not modify files.',
      'A ready close gate does not replace user, reviewer, release, or owner acceptance when the project requires it.',
      'Project tests, browser smokes, CI, MCP, LSP, subagents, and release checks must still be run according to project quality gates.',
    ],
  }
}

function renderMarkdown(report) {
  const lines = []
  lines.push('# GSE Close Gate')
  lines.push('')
  lines.push('Generated: ' + report.generatedAt)
  lines.push('Target: ' + report.target)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + report.summary.status)
  lines.push('- Checks: ' + report.summary.passed + ' passed, ' + report.summary.warnings + ' warnings, ' + report.summary.failed + ' failed, ' + report.summary.total + ' total')
  lines.push('')
  lines.push('## Checks')
  lines.push('')
  for (const item of report.checks) {
    const marker = item.status === 'passed' ? '[x]' : item.status === 'warning' ? '[!]' : '[ ]'
    lines.push('- ' + marker + ' ' + item.id + ' ' + item.label + ': ' + item.evidence)
    if (item.recommendation) lines.push('  - Recommendation: ' + item.recommendation)
  }
  lines.push('')
  lines.push('## Limits')
  lines.push('')
  for (const item of report.limits) lines.push('- ' + item)
  return lines.join('\n') + '\n'
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isCli) {
  const target = selfTest ? await createFixture() : targetArg
  try {
    const report = auditCloseGate(target)
    if (jsonOnly) console.log(JSON.stringify(report, null, 2))
    else console.log(renderMarkdown(report))
    if (report.summary.failed > 0) process.exitCode = 1
  } finally {
    if (selfTest) fs.rmSync(target, { recursive: true, force: true })
  }
}
