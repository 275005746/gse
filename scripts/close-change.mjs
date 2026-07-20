#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createResultEnvelope } from './core/contracts.mjs'
import { currentEvidenceBasis } from './core/evidence-basis.mjs'
import {
  EVIDENCE_LEVEL_RANK,
  evaluateCloseConsistency,
} from './core/evidence.mjs'
import { readAtomicJson } from './core/persistence/atomic-json.mjs'
import { readCommittedJsonl } from './core/persistence/jsonl.mjs'
import { inspectPendingTransactions } from './core/persistence/recovery.mjs'
import { ALLOWED_FIELDS_BY_RECORD_TYPE } from './core/persistence/record-allowlists.mjs'
import { executeTransaction } from './core/persistence/transaction.mjs'

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const SAFE_DATE = /^\d{4}-\d{2}-\d{2}$/
const VALID_STATUS = new Set(['result', 'verified', 'accepted'])
const REQUIRED_FILES = ['brief.md', 'spec.md', 'tasks.md', 'evidence.md', 'review.md']
const GOAL_MAP_PATH = '.gse/goal-map.md'

function lifecycleLinkMarker(changeId) {
  return `<!-- gse-change-lifecycle:${changeId} -->`
}

function withLifecycleLink(goalMap, { changeId, archivePath, status, evidenceRefs }) {
  const marker = lifecycleLinkMarker(changeId)
  if (goalMap.includes(marker)) return goalMap
  const newline = goalMap.includes('\r\n') ? '\r\n' : '\n'
  const prefix = goalMap.endsWith(newline) ? goalMap : `${goalMap}${newline}`
  const heading = /(^|\r?\n)## Change Lifecycle Links(?:\r?\n|$)/.test(goalMap)
    ? ''
    : `${newline}## Change Lifecycle Links${newline}${newline}This section is a GSE execution projection only; it does not modify or complete the canonical product goal.${newline}`
  const refs = evidenceRefs.length > 0
    ? evidenceRefs.map((ref) => `\`${String(ref).replaceAll('`', '\\`')}\``).join(', ')
    : 'none'
  return `${prefix}${heading}${newline}${marker}${newline}- Change \`${changeId}\` archived at \`${archivePath}\` with status \`${status}\`; authorizing evidence: ${refs}.${newline}`
}

function readArg(args, name, fallback = null) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1] ?? fallback
}

function failure(operationId, reasonCode, message, { changeId = null, stateRevision = null, requiredActions = [], diagnostics = [] } = {}) {
  return createResultEnvelope({
    operationId,
    status: 'blocked',
    stage: 'close',
    reasonCode,
    message,
    changeId,
    taskId: null,
    stateRevision,
    requiredActions,
    artifactRefs: [],
    evidenceRefs: [],
    diagnostics: diagnostics.length ? diagnostics : [{ code: reasonCode }],
    safeToRetry: true,
  })
}

export async function closeChange({ target, changeId, status = 'verified', date = new Date().toISOString().slice(0, 10), dryRun = false, force = false, currentDependencies } = {}) {
  const resolvedTarget = path.resolve(target ?? process.cwd())
  const operationId = `close-change-${date}-${changeId}`
  if (!SAFE_ID.test(changeId ?? '')) return failure(operationId, 'INVALID_CHANGE_ID', 'A safe --change-id is required.', { changeId })
  if (!VALID_STATUS.has(status)) return failure(operationId, 'INVALID_CLOSE_STATUS', 'Close status must be result, verified, or accepted.', { changeId })
  if (!SAFE_DATE.test(date)) return failure(operationId, 'INVALID_CLOSE_DATE', 'Close date must use YYYY-MM-DD.', { changeId })

  const changePath = `.gse/changes/${changeId}`
  const archivePath = `.gse/archive/${date}-${changeId}`
  const transactionId = `tx-${operationId}`
  const committedMarker = readAtomicJson(resolvedTarget, `.gse/transactions/${transactionId}/commit.json`, { allowMissing: true })
  if (committedMarker?.status === 'committed' && committedMarker.operationId === operationId && committedMarker.transactionId === transactionId) {
    return createResultEnvelope({
      operationId,
      status: 'complete',
      stage: 'close',
      reasonCode: 'TRANSACTION_ALREADY_COMMITTED',
      message: 'Change Close was already committed.',
      changeId,
      taskId: null,
      stateRevision: committedMarker.stateRevision,
      requiredActions: [],
      artifactRefs: [archivePath, `.gse/transactions/${transactionId}/commit.json`],
      evidenceRefs: [],
      diagnostics: [],
      safeToRetry: true,
    })
  }
  const changeDirectory = path.join(resolvedTarget, ...changePath.split('/'))
  const archiveDirectory = path.join(resolvedTarget, ...archivePath.split('/'))
  if (!fs.existsSync(changeDirectory)) return failure(operationId, 'CHANGE_NOT_FOUND', 'Change directory does not exist.', { changeId })
  if (fs.existsSync(archiveDirectory)) return failure(operationId, 'ARCHIVE_EXISTS', 'Archive directory already exists and Core v1 cannot replace it safely.', { changeId })
  const missing = REQUIRED_FILES.filter((name) => !fs.existsSync(path.join(changeDirectory, name)))
  if (missing.length > 0) return failure(operationId, 'CHANGE_FILES_MISSING', 'Required Change files are missing.', { changeId, requiredActions: missing.map((name) => `Restore ${changePath}/${name}.`) })

  let projectState
  let activeChange
  let evidence
  try {
    projectState = readAtomicJson(resolvedTarget, '.gse/state.json')
    activeChange = readAtomicJson(resolvedTarget, `${changePath}/change.json`)
    evidence = readCommittedJsonl(resolvedTarget, '.gse/evidence/index.jsonl', { allowMissing: true })
  } catch (error) {
    return failure(operationId, error.code ?? 'CLOSE_INPUT_UNAVAILABLE', 'Close inputs could not be read safely.', { changeId, diagnostics: [{ code: error.code ?? 'CLOSE_INPUT_UNAVAILABLE' }] })
  }
  if (evidence.corruptTail.length > 0) return failure(operationId, 'EVIDENCE_INDEX_CORRUPT', 'The evidence index has a malformed or incomplete tail.', { changeId, stateRevision: projectState?.stateRevision })
  const pending = inspectPendingTransactions(resolvedTarget)
  const pendingTransactions = [
    ...(pending.transactions ?? []),
    ...(pending.diagnostics ?? []).map((diagnostic) => ({ status: 'blocked', diagnostic })),
  ]
  const consistency = evaluateCloseConsistency(resolvedTarget, {
    projectState,
    activeChange,
    evidenceRecords: evidence.records,
    currentDependencies: currentDependencies ?? currentEvidenceBasis(resolvedTarget, { projectState, activeChange, evidenceRecords: evidence.records }),
    pendingTransactions,
    requestedStatus: status,
  })
  if (consistency.status !== 'complete') return { ...consistency, operationId }

  if (dryRun) {
    return createResultEnvelope({
      operationId,
      status: 'complete',
      stage: 'close',
      reasonCode: 'CLOSE_DRY_RUN_READY',
      message: 'Close consistency passed; dry-run made no changes.',
      changeId,
      taskId: null,
      stateRevision: projectState.stateRevision,
      requiredActions: [],
      artifactRefs: [archivePath],
      evidenceRefs: consistency.evidenceRefs,
      diagnostics: [],
      safeToRetry: true,
    })
  }

  const timestamp = new Date().toISOString()
  const goalMapFile = path.join(resolvedTarget, ...GOAL_MAP_PATH.split('/'))
  const goalMapBefore = fs.existsSync(goalMapFile) ? fs.readFileSync(goalMapFile) : Buffer.from('# GSE Goal Map\n', 'utf8')
  const goalMapAfter = withLifecycleLink(goalMapBefore.toString('utf8'), {
    changeId,
    archivePath,
    status,
    evidenceRefs: consistency.evidenceRefs,
  })
  const archiveRecord = `# Change Archive Record\n\nChange ID: ${changeId}\nClosed At: ${timestamp}\nStatus: ${status}\nSource: ${changePath}\nArchive: ${archivePath}\nAuthorizing Evidence: ${consistency.evidenceRefs.join(', ')}\n\n## Closure Rules\n\n- Shared revision-aware Close consistency passed.\n- Required Change files were present.\n- Committed current evidence remained authoritative.\n- Source Change folder was moved transactionally.\n`
  const archiveEventId = `change-archive-${date}-${changeId}`
  const authorizingEvidence = evidence.records.filter((record) => consistency.evidenceRefs.includes(record.eventId ?? record.evidenceId ?? record.recordId ?? record.operationId))
  const effectiveEvidence = authorizingEvidence.reduce((current, record) => {
    if (!current) return record
    return EVIDENCE_LEVEL_RANK[record.evidenceLevel] > EVIDENCE_LEVEL_RANK[current.evidenceLevel]
      ? record
      : current
  }, null)
  const relatedArtifacts = [...new Set([
    archivePath,
    `${archivePath}/archive-record.md`,
    ...authorizingEvidence.map((record) => record.evidenceFile).filter(Boolean),
  ])]
  const archiveEvent = {
    schemaVersion: 1,
    eventId: archiveEventId,
    date,
    timestamp,
    recordType: 'change-archive',
    changeId,
    taskId: null,
    stateRevision: projectState.stateRevision + 1,
    status: effectiveEvidence.status,
    evidenceLevel: effectiveEvidence.evidenceLevel,
    requiredEvidenceLevel: effectiveEvidence.requiredEvidenceLevel,
    summary: `Archived GSE Change ${changeId}.`,
    claim: `Change ${changeId} passed shared Close consistency and was archived.`,
    evidenceClass: 'close',
    method: 'transactional close-change',
    dependencies: effectiveEvidence.dependencies,
    invalidationScope: [],
    outcome: 'archived',
    limitations: [],
    actor: 'gse-close-change',
    evidenceFile: `${archivePath}/evidence.md`,
    relatedArtifacts,
    evidenceRefs: consistency.evidenceRefs,
    archivePath,
    commands: [],
    nextAction: 'Continue from .gse/state.json and the current goal map.',
  }
  const transaction = await executeTransaction({
    target: resolvedTarget,
    operationId,
    transactionId,
    expectedRevision: projectState.stateRevision,
    writes: [
      { kind: 'tree-move', sourcePath: changePath, targetPath: archivePath },
      { kind: 'text-write', path: `${archivePath}/archive-record.md`, content: archiveRecord.replace(/\n/g, '\r\n') },
      { kind: 'text-write', path: GOAL_MAP_PATH, content: goalMapAfter },
      { kind: 'json-replace', path: '.gse/state.json', value: { ...projectState, activeChangeId: null, phase: 'close', currentSlice: projectState.currentSlice ? { ...projectState.currentSlice, status } : projectState.currentSlice } },
    ],
    events: [{ path: '.gse/evidence/index.jsonl', event: archiveEvent }],
    allowedFieldsByRecordType: ALLOWED_FIELDS_BY_RECORD_TYPE,
    validatePreconditions: () => {
      try {
        if (!fs.existsSync(changeDirectory)) {
          return {
            reasonCode: 'CHANGE_NOT_FOUND',
            message: 'Change directory no longer exists under the project lock.',
          }
        }
        if (fs.existsSync(archiveDirectory)) {
          return {
            reasonCode: 'ARCHIVE_EXISTS',
            message: 'Archive directory already exists and Core v1 cannot replace it safely.',
          }
        }
        const lockedGoalMap = fs.existsSync(goalMapFile) ? fs.readFileSync(goalMapFile) : Buffer.from('# GSE Goal Map\n', 'utf8')
        if (!lockedGoalMap.equals(goalMapBefore)) {
          return {
            reasonCode: 'GOAL_MAP_CHANGED',
            message: 'The goal map changed before archive publication.',
          }
        }
        const lockedState = readAtomicJson(resolvedTarget, '.gse/state.json')
        const lockedChange = readAtomicJson(resolvedTarget, `${changePath}/change.json`)
        const lockedEvidence = readCommittedJsonl(resolvedTarget, '.gse/evidence/index.jsonl', { allowMissing: true })
        const lockedPending = inspectPendingTransactions(resolvedTarget)
        const lockedConsistency = evaluateCloseConsistency(resolvedTarget, {
          projectState: lockedState,
          activeChange: lockedChange,
          evidenceRecords: lockedEvidence.records,
          currentDependencies: currentEvidenceBasis(resolvedTarget, { projectState: lockedState, activeChange: lockedChange, evidenceRecords: lockedEvidence.records }),
          pendingTransactions: [
            ...(lockedPending.transactions ?? []).filter((item) => item.transactionId !== transactionId),
            ...(lockedPending.diagnostics ?? []).map((diagnostic) => ({ status: 'blocked', diagnostic })),
          ],
          requestedStatus: status,
        })
        return lockedConsistency.status === 'complete' ? true : lockedConsistency
      } catch (error) {
        return { reasonCode: error.code ?? 'CLOSE_PRECONDITION_CHANGED', message: 'Close preconditions could not be revalidated under the project lock.' }
      }
    },
  })
  if (transaction.status !== 'complete') return failure(operationId, transaction.reasonCode, transaction.message, { changeId, stateRevision: transaction.stateRevision, diagnostics: [{ code: transaction.reasonCode }] })

  return createResultEnvelope({
    operationId,
    status: 'complete',
    stage: 'close',
    reasonCode: transaction.reasonCode,
    message: 'Change archived transactionally after Close consistency passed.',
    changeId,
    taskId: null,
    stateRevision: transaction.stateRevision,
    requiredActions: [],
    artifactRefs: [archivePath, ...transaction.artifactRefs],
    evidenceRefs: consistency.evidenceRefs,
    diagnostics: [],
    safeToRetry: true,
  })
}

async function main() {
  const args = process.argv.slice(2)
  const result = await closeChange({
    target: readArg(args, '--target', process.cwd()),
    changeId: String(readArg(args, '--change-id', '')).trim().toLowerCase(),
    status: readArg(args, '--status', 'verified'),
    date: readArg(args, '--date', new Date().toISOString().slice(0, 10)),
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
  })
  console.log(JSON.stringify(result, null, 2))
  if (result.status !== 'complete') process.exitCode = 1
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isCli) await main()
