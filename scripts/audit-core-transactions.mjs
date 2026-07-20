#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1] ?? fallback
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(readArg('--root', path.join(scriptDirectory, '..')))
const jsonOnly = args.includes('--json')
const fixtureRoot = path.join(root, 'scripts', 'fixtures', 'core-foundation')
const temporaryDirectories = []

const modulePaths = {
  lock: './core/persistence/lock.mjs',
  atomicJson: './core/persistence/atomic-json.mjs',
  jsonl: './core/persistence/jsonl.mjs',
  transaction: './core/persistence/transaction.mjs',
  recovery: './core/persistence/recovery.mjs',
}

function errorDiagnostic(code, error, extra = {}) {
  return {
    code,
    ...extra,
    errorCode: typeof error?.code === 'string' ? error.code : null,
    message: error instanceof Error ? error.message : String(error),
  }
}

async function guardedImport(relativeModulePath) {
  try {
    return {
      available: true,
      module: await import(new URL(relativeModulePath, import.meta.url)),
      diagnostic: null,
    }
  } catch (error) {
    return {
      available: false,
      module: null,
      diagnostic: errorDiagnostic('MODULE_UNAVAILABLE', error, { module: relativeModulePath }),
    }
  }
}

function exportDiagnostic(moduleImport, modulePath, exportName) {
  return moduleImport.diagnostic ?? {
    code: 'EXPORT_UNAVAILABLE',
    module: modulePath,
    export: exportName,
    errorCode: null,
    message: `${modulePath} does not export ${exportName}.`,
  }
}

function requireExports(moduleImport, modulePath, exportNames) {
  if (!moduleImport.available) {
    return {
      available: false,
      diagnostics: moduleImport.diagnostic ? [moduleImport.diagnostic] : [],
    }
  }
  const missing = exportNames.filter((name) => typeof moduleImport.module?.[name] !== 'function')
  return {
    available: missing.length === 0,
    diagnostics: missing.map((name) => exportDiagnostic(moduleImport, modulePath, name)),
  }
}

function unavailableProbe(label, diagnostics) {
  return {
    available: false,
    status: 'unavailable',
    reasonCode: 'FUNCTION_UNAVAILABLE',
    message: `${label} could not run because required persistence behavior is unavailable.`,
    diagnostics,
  }
}

function failedProbe(label, error) {
  return {
    available: true,
    status: 'unavailable',
    reasonCode: 'PROBE_ERROR',
    message: `${label} returned an error instead of crashing the audit.`,
    diagnostics: [errorDiagnostic('PROBE_ERROR', error)],
  }
}

function jsonEvidence(value) {
  try {
    return JSON.parse(JSON.stringify(value, (key, item) => {
      if (typeof item === 'bigint') return item.toString()
      if (typeof item === 'function') return `[function ${item.name || 'anonymous'}]`
      if (item instanceof Error) return errorDiagnostic('ERROR', item)
      return item
    }))
  } catch (error) {
    return { code: 'EVIDENCE_SERIALIZATION_FAILED', message: error.message }
  }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence: jsonEvidence(evidence), risk }
}

function createFixture(fixtureId) {
  const source = path.join(fixtureRoot, fixtureId)
  if (!fs.existsSync(source)) {
    const error = new Error(`Fixture ${fixtureId} does not exist.`)
    error.code = 'FIXTURE_UNAVAILABLE'
    throw error
  }
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `gse-core-${fixtureId}-`))
  temporaryDirectories.push(temporaryDirectory)
  const target = path.join(temporaryDirectory, 'project')
  fs.cpSync(source, target, { recursive: true, force: false, errorOnExist: true })
  if (fixtureId === 'transaction-faults') {
    const gseDirectory = path.join(target, '.gse')
    fs.mkdirSync(path.join(gseDirectory, 'evidence'), { recursive: true })
    const statePath = path.join(gseDirectory, 'state.json')
    if (!fs.existsSync(statePath)) {
      fs.writeFileSync(statePath, `${JSON.stringify({ schemaVersion: 1, stateRevision: 0, activeChangeId: null }, null, 2)}\n`)
    }
    const evidencePath = path.join(gseDirectory, 'evidence', 'index.jsonl')
    if (!fs.existsSync(evidencePath)) fs.writeFileSync(evidencePath, '')
  }
  return target
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^﻿/, ''))
}

function writeActiveChangeFixture(target, changeId = 'transaction-audit-change') {
  const statePath = path.join(target, '.gse', 'state.json')
  const state = readJson(statePath)
  fs.writeFileSync(statePath, `${JSON.stringify({ ...state, activeChangeId: changeId }, null, 2)}\n`)
  const changeDirectory = path.join(target, '.gse', 'changes', changeId)
  fs.mkdirSync(changeDirectory, { recursive: true })
  fs.writeFileSync(path.join(changeDirectory, 'brief.md'), '# Transaction audit change\n')
  fs.writeFileSync(path.join(changeDirectory, 'change.json'), `${JSON.stringify({
    schemaVersion: 1,
    changeId,
    stateRevision: state.stateRevision,
    profile: 'standard',
    lifecycleStage: 'build',
    lifecycleState: 'building',
    sourceDigests: {},
    derivedFrom: [],
    conflicts: [],
  }, null, 2)}\n`)
  return `.gse/changes/${changeId}/change.json`
}

function readRevision(target) {
  return readJson(path.join(target, '.gse', 'state.json')).stateRevision
}

function forceDeadLockOwner(target) {
  const ownerPath = path.join(target, '.gse', 'locks', 'core', 'owner.json')
  if (!fs.existsSync(ownerPath)) return false
  const owner = readJson(ownerPath)
  fs.writeFileSync(ownerPath, `${JSON.stringify({ ...owner, pid: 99999999, expiresAt: 0 })}\n`)
  return true
}

function digestBytes(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
}

function digestFile(filePath) {
  return fs.existsSync(filePath) ? digestBytes(fs.readFileSync(filePath)) : null
}

function digestTree(rootPath) {
  try {
    const stat = fs.lstatSync(rootPath)
    if (stat.isFile()) return digestBytes(fs.readFileSync(rootPath))
    if (!stat.isDirectory() || stat.isSymbolicLink()) return null
    const chunks = []
    for (const entry of fs.readdirSync(rootPath, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isSymbolicLink()) return null
      chunks.push(Buffer.from(`${entry.name}\0`, 'utf8'))
      chunks.push(Buffer.from(digestTree(path.join(rootPath, entry.name)) ?? 'missing', 'utf8'))
    }
    return digestBytes(Buffer.concat(chunks))
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null
    throw error
  }
}

function treeMoveWrite() {
  return {
    kind: 'tree-move',
    sourcePath: 'tree-move-source',
    targetPath: 'tree-move-target',
  }
}

function transactionDirectory(target, transactionId) {
  return path.join(target, '.gse', 'transactions', transactionId)
}

function manifestPath(target, transactionId) {
  return path.join(transactionDirectory(target, transactionId), 'manifest.json')
}

function commitMarkerPath(target, transactionId) {
  return path.join(transactionDirectory(target, transactionId), 'commit.json')
}

function resultField(result, field) {
  return result?.[field]
    ?? result?.coreResult?.[field]
    ?? result?.result?.[field]
    ?? null
}

function hasRequiredWriteMetadata(write) {
  if (!write || typeof write !== 'object') return false
  const required = ['kind', 'path', 'beforeDigest', 'afterDigest', 'stagedPath']
  if (!required.every((field) => Object.hasOwn(write, field))) return false
  if (write.kind === 'jsonl-append') {
    const eventIds = Array.isArray(write.eventIds)
      ? write.eventIds
      : [write.eventId]
    return eventIds.length > 0
      && eventIds.every((eventId) => typeof eventId === 'string' && eventId.length > 0)
      && new Set(eventIds).size === eventIds.length
      && Number.isInteger(write.beforeSize)
      && write.beforeSize >= 0
  }
  if (write.kind === 'tree-move') {
    return typeof write.sourcePath === 'string' && typeof write.targetPath === 'string'
  }
  return true
}

function countEventId(records, eventId) {
  return Array.isArray(records) ? records.filter((record) => record?.eventId === eventId).length : 0
}

function recoveryItems(result) {
  if (Array.isArray(result)) return result
  for (const field of ['transactions', 'recoveries', 'recovered', 'actions', 'results']) {
    if (Array.isArray(result?.[field])) return result[field]
  }
  return result && typeof result === 'object' ? [result] : []
}

function recoveryOutcome(result, transactionId) {
  const items = recoveryItems(result)
  const item = items.find((candidate) =>
    candidate?.transactionId === transactionId
    || candidate?.id === transactionId
  ) ?? (items.length === 1 ? items[0] : null)
  return item?.recovered ?? item?.action ?? item?.outcome ?? item?.recovery ?? item?.status ?? null
}

function pendingTransactionIds(result) {
  const items = Array.isArray(result)
    ? result
    : result?.transactions ?? result?.pending ?? result?.results ?? []
  return Array.isArray(items)
    ? items.map((item) => typeof item === 'string' ? item : item?.transactionId ?? item?.id).filter(Boolean)
    : []
}

function stateWrite(target, summary) {
  const current = readJson(path.join(target, '.gse', 'state.json'))
  return {
    kind: 'json-replace',
    path: '.gse/state.json',
    value: {
      ...current,
      currentSummary: summary,
      updatedAt: '2026-07-16T12:00:00.000Z',
    },
  }
}

function evidenceEvent(transactionId, eventId, claim = 'Transaction audit event.') {
  return {
    schemaVersion: 1,
    eventId,
    transactionId,
    date: '2026-07-16',
    timestamp: '2026-07-16T12:00:00.000Z',
    recordType: 'transaction-audit',
    changeId: null,
    taskId: null,
    status: 'result',
    evidenceLevel: 'behavioral',
    requiredEvidenceLevel: 'behavioral',
    claim,
    evidenceClass: 'test',
    method: 'dependency-free transaction fault audit',
    stateRevision: 1,
    dependencies: {
      sourceRevision: null,
      dirtyWorktreeDigest: null,
      inputPaths: [],
      generatedArtifacts: [],
      configuration: [],
      contractRevision: 'core-v1',
      environmentFingerprint: 'node-18-plus',
      hostCapabilityBasis: 'local-filesystem',
    },
    invalidationScope: [],
    outcome: 'observed',
    limitations: [],
    actor: 'audit-core-transactions',
    evidenceFile: '.gse/evidence/index.jsonl',
    relatedArtifacts: ['.gse/state.json'],
    nextAction: null,
  }
}

function eventWrite(transactionId, eventId, claim) {
  return {
    kind: 'jsonl-append',
    path: '.gse/evidence/index.jsonl',
    event: evidenceEvent(transactionId, eventId, claim),
  }
}

const allowedFieldsByRecordType = {
  'project-state': [
    'schemaVersion', 'stateRevision', 'projectName', 'mode', 'phase', 'currentSummary',
    'currentSlice', 'activeChangeId', 'updatedAt',
  ],
  'active-change': [
    'schemaVersion', 'changeId', 'stateRevision', 'profile', 'lifecycleStage',
    'lifecycleState', 'sourceDigests', 'derivedFrom', 'conflicts',
  ],
  'transaction-audit': Object.keys(evidenceEvent('tx-fields', 'evt-fields')),
  'transaction-intent': [
    'schemaVersion', 'eventId', 'transactionId', 'operationId', 'recordType',
    'timestamp', 'expectedRevision', 'writePaths',
  ],
  'transaction-recovery': [
    'schemaVersion', 'eventId', 'transactionId', 'recordType', 'timestamp',
    'outcome', 'stateRevision',
  ],
}

async function captureExecution(executeTransaction, options) {
  try {
    return { returned: true, result: await Promise.resolve(executeTransaction(options)), error: null }
  } catch (error) {
    return { returned: false, result: null, error: errorDiagnostic('EXECUTION_FAULT', error) }
  }
}

async function probeLockExclusion(lockImport) {
  const required = requireExports(lockImport, modulePaths.lock, ['acquireProjectLock', 'releaseProjectLock'])
  if (!required.available) return unavailableProbe('live lock exclusion', required.diagnostics)

  let firstLock = null
  let secondLock = null
  try {
    const target = createFixture('transaction-faults')
    firstLock = await Promise.resolve(lockImport.module.acquireProjectLock(target, {
      operationId: 'op-tx01-first',
      ttlMs: 30000,
      maxAttempts: 1,
      now: () => 1000,
    }))
    secondLock = await Promise.resolve(lockImport.module.acquireProjectLock(target, {
      operationId: 'op-tx01-second',
      ttlMs: 30000,
      maxAttempts: 1,
      now: () => 1001,
    }))
    return { available: true, firstLock, secondLock }
  } catch (error) {
    return failedProbe('live lock exclusion', error)
  } finally {
    try {
      if (secondLock && resultField(secondLock, 'status') !== 'blocked') {
        await Promise.resolve(lockImport.module.releaseProjectLock(secondLock))
      }
    } catch {}
    try {
      if (firstLock) await Promise.resolve(lockImport.module.releaseProjectLock(firstLock))
    } catch {}
  }
}

async function probeStaleLockRecovery(lockImport) {
  const required = requireExports(lockImport, modulePaths.lock, ['acquireProjectLock', 'releaseProjectLock'])
  if (!required.available) return unavailableProbe('stale lock recovery', required.diagnostics)

  let firstLock = null
  let recoveredLock = null
  try {
    const target = createFixture('transaction-faults')
    firstLock = await Promise.resolve(lockImport.module.acquireProjectLock(target, {
      operationId: 'op-tx02-stale',
      ttlMs: 10,
      maxAttempts: 1,
      now: () => 1000,
    }))
    await new Promise((resolve) => setTimeout(resolve, 15))
    recoveredLock = await Promise.resolve(lockImport.module.acquireProjectLock(target, {
      operationId: 'op-tx02-recovery',
      ttlMs: 30000,
      maxAttempts: 3,
      now: () => 2000,
    }))
    const staleDirectory = path.join(target, '.gse', 'locks', 'stale')
    const staleRecords = fs.existsSync(staleDirectory) ? fs.readdirSync(staleDirectory).sort() : []
    return { available: true, firstLock, recoveredLock, staleRecords }
  } catch (error) {
    return failedProbe('stale lock recovery', error)
  } finally {
    try {
      if (recoveredLock) await Promise.resolve(lockImport.module.releaseProjectLock(recoveredLock))
    } catch {}
    try {
      if (firstLock && !recoveredLock) await Promise.resolve(lockImport.module.releaseProjectLock(firstLock))
    } catch {}
  }
}

async function probeRevisionMismatch(transactionImport) {
  const required = requireExports(transactionImport, modulePaths.transaction, ['executeTransaction'])
  if (!required.available) return unavailableProbe('revision mismatch', required.diagnostics)

  try {
    const target = createFixture('transaction-faults')
    const statePath = path.join(target, '.gse', 'state.json')
    const state = readJson(statePath)
    fs.writeFileSync(statePath, `${JSON.stringify({ ...state, stateRevision: 2 }, null, 2)}\n`)
    const beforeDigest = digestFile(statePath)
    const transactionId = 'tx-audit-revision-mismatch'
    const execution = await captureExecution(transactionImport.module.executeTransaction, {
      target,
      operationId: 'op-audit-revision-mismatch',
      transactionId,
      expectedRevision: 1,
      writes: [stateWrite(target, 'This write must not publish.')],
      events: [],
      allowedFieldsByRecordType,
    })
    return {
      available: true,
      execution,
      result: execution.result,
      revision: readRevision(target),
      beforeDigest,
      afterDigest: digestFile(statePath),
      manifestExists: fs.existsSync(manifestPath(target, transactionId)),
    }
  } catch (error) {
    return failedProbe('revision mismatch', error)
  }
}

async function probeCompleteManifest(transactionImport) {
  const required = requireExports(transactionImport, modulePaths.transaction, ['executeTransaction'])
  if (!required.available) return unavailableProbe('complete manifest', required.diagnostics)

  try {
    const target = createFixture('transaction-faults')
    const transactionId = 'tx-audit-complete-manifest'
    const requestedWrites = [stateWrite(target, 'Manifest completeness probe.')]
    const execution = await captureExecution(transactionImport.module.executeTransaction, {
      target,
      operationId: 'op-audit-complete-manifest',
      transactionId,
      expectedRevision: 0,
      writes: requestedWrites,
      events: [],
      allowedFieldsByRecordType,
      faultAfterStep: 'after-manifest',
    })
    const file = manifestPath(target, transactionId)
    const manifest = fs.existsSync(file) ? readJson(file) : null
    return { available: true, execution, requestedWrites, manifest, manifestPath: file }
  } catch (error) {
    return failedProbe('complete manifest', error)
  }
}

async function probeCommitMarkerAuthority(transactionImport, jsonlImport) {
  const transactionRequired = requireExports(transactionImport, modulePaths.transaction, ['executeTransaction'])
  const jsonlRequired = requireExports(jsonlImport, modulePaths.jsonl, ['readCommittedJsonl'])
  if (!transactionRequired.available || !jsonlRequired.available) {
    return unavailableProbe('commit marker authority', [...transactionRequired.diagnostics, ...jsonlRequired.diagnostics])
  }

  try {
    const beforeTarget = createFixture('transaction-faults')
    const beforeTransactionId = 'tx-audit-before-marker'
    const beforeEventId = 'evt-audit-before-marker'
    const beforeExecution = await captureExecution(transactionImport.module.executeTransaction, {
      target: beforeTarget,
      operationId: 'op-audit-before-marker',
      transactionId: beforeTransactionId,
      expectedRevision: 0,
      writes: [
        stateWrite(beforeTarget, 'Published but not committed.'),
        eventWrite(beforeTransactionId, beforeEventId, 'This event must remain hidden before the marker.'),
      ],
      events: [],
      allowedFieldsByRecordType,
      faultAfterStep: 'after-publish',
    })
    const beforeRead = await Promise.resolve(jsonlImport.module.readCommittedJsonl(beforeTarget, '.gse/evidence/index.jsonl'))

    const afterTarget = createFixture('transaction-faults')
    const afterTransactionId = 'tx-audit-after-marker'
    const afterEventId = 'evt-audit-after-marker'
    const afterExecution = await captureExecution(transactionImport.module.executeTransaction, {
      target: afterTarget,
      operationId: 'op-audit-after-marker',
      transactionId: afterTransactionId,
      expectedRevision: 0,
      writes: [
        stateWrite(afterTarget, 'Committed before the injected stop.'),
        eventWrite(afterTransactionId, afterEventId, 'This event must be visible after the marker.'),
      ],
      events: [],
      allowedFieldsByRecordType,
      faultAfterStep: 'after-commit-marker',
    })
    const afterRead = await Promise.resolve(jsonlImport.module.readCommittedJsonl(afterTarget, '.gse/evidence/index.jsonl'))

    return {
      available: true,
      beforeExecution,
      afterExecution,
      beforeMarkerExists: fs.existsSync(commitMarkerPath(beforeTarget, beforeTransactionId)),
      afterMarkerExists: fs.existsSync(commitMarkerPath(afterTarget, afterTransactionId)),
      beforeMarkerVisible: countEventId(beforeRead?.records, beforeEventId) === 1,
      afterMarkerVisible: countEventId(afterRead?.records, afterEventId) === 1,
      beforeRead,
      afterRead,
    }
  } catch (error) {
    return failedProbe('commit marker authority', error)
  }
}

async function probeIdempotentReplay(transactionImport, jsonlImport) {
  const transactionRequired = requireExports(transactionImport, modulePaths.transaction, ['executeTransaction'])
  const jsonlRequired = requireExports(jsonlImport, modulePaths.jsonl, ['readCommittedJsonl'])
  if (!transactionRequired.available || !jsonlRequired.available) {
    return unavailableProbe('idempotent replay', [...transactionRequired.diagnostics, ...jsonlRequired.diagnostics])
  }

  try {
    const target = createFixture('transaction-faults')
    const transactionId = 'tx-audit-idempotent-replay'
    const eventId = 'evt-audit-idempotent-replay'
    const options = {
      target,
      operationId: 'op-audit-idempotent-replay',
      transactionId,
      expectedRevision: 0,
      writes: [
        stateWrite(target, 'Committed once and replayed once.'),
        eventWrite(transactionId, eventId, 'A duplicate replay must not duplicate this event.'),
      ],
      events: [],
      allowedFieldsByRecordType,
    }
    const committed = await Promise.resolve(transactionImport.module.executeTransaction(options))
    const replay = await Promise.resolve(transactionImport.module.executeTransaction(options))
    const index = await Promise.resolve(jsonlImport.module.readCommittedJsonl(target, '.gse/evidence/index.jsonl'))
    return {
      available: true,
      committed,
      replay,
      stateRevision: readRevision(target),
      indexRecords: index?.records,
      eventId,
      eventCount: countEventId(index?.records, eventId),
    }
  } catch (error) {
    return failedProbe('idempotent replay', error)
  }
}

async function probeOperationReplayAcrossTransactionIds(transactionImport, jsonlImport) {
  const transactionRequired = requireExports(transactionImport, modulePaths.transaction, ['executeTransaction'])
  const jsonlRequired = requireExports(jsonlImport, modulePaths.jsonl, ['readCommittedJsonl'])
  if (!transactionRequired.available || !jsonlRequired.available) {
    return unavailableProbe('operation replay across transaction IDs', [...transactionRequired.diagnostics, ...jsonlRequired.diagnostics])
  }
  try {
    const target = createFixture('transaction-faults')
    const activeCachePath = writeActiveChangeFixture(target)
    const operationId = 'op-audit-operation-replay'
    const eventId = 'evt-audit-operation-replay'
    const first = await Promise.resolve(transactionImport.module.executeTransaction({
      target,
      operationId,
      transactionId: 'tx-audit-operation-replay-first',
      expectedRevision: 0,
      writes: [stateWrite(target, 'Operation replay committed once.'), eventWrite('tx-audit-operation-replay-first', eventId, 'Operation replay event.')],
      events: [],
      allowedFieldsByRecordType,
    }))
    const replay = await Promise.resolve(transactionImport.module.executeTransaction({
      target,
      operationId,
      transactionId: 'tx-audit-operation-replay-second',
      expectedRevision: 0,
      writes: [stateWrite(target, 'This replay must not publish.'), eventWrite('tx-audit-operation-replay-second', eventId, 'Duplicate operation replay event.')],
      events: [],
      allowedFieldsByRecordType,
    }))
    const index = await Promise.resolve(jsonlImport.module.readCommittedJsonl(target, '.gse/evidence/index.jsonl'))
    return {
      available: true,
      first,
      replay,
      revision: readRevision(target),
      activeCacheRevision: readJson(path.join(target, ...activeCachePath.split('/'))).stateRevision,
      eventCount: countEventId(index.records, eventId),
      secondManifestExists: fs.existsSync(manifestPath(target, 'tx-audit-operation-replay-second')),
    }
  } catch (error) {
    return failedProbe('operation replay across transaction IDs', error)
  }
}

async function probePlannedPrimitiveRestore(atomicJsonImport, jsonlImport) {
  const jsonRequired = requireExports(atomicJsonImport, modulePaths.atomicJson, ['stageJsonReplacement', 'publishJsonReplacement', 'restoreJsonReplacement'])
  const jsonlRequired = requireExports(jsonlImport, modulePaths.jsonl, ['stageJsonlAppend', 'publishJsonlAppend', 'restoreJsonlAppend'])
  if (!jsonRequired.available || !jsonlRequired.available) return unavailableProbe('planned primitive restore', [...jsonRequired.diagnostics, ...jsonlRequired.diagnostics])
  try {
    const target = createFixture('transaction-faults')
    const transactionDir = '.gse/transactions/tx-audit-primitives'
    const statePath = path.join(target, '.gse', 'state.json')
    const beforeStateDigest = digestFile(statePath)
    const stagedJson = atomicJsonImport.module.stageJsonReplacement({ target, transactionDir, relativePath: '.gse/state.json', value: { schemaVersion: 1, stateRevision: 1, activeChangeId: null } })
    atomicJsonImport.module.publishJsonReplacement(stagedJson)
    atomicJsonImport.module.restoreJsonReplacement(stagedJson)
    const event = evidenceEvent('tx-audit-primitives', 'evt-audit-primitives')
    const stagedJsonl = jsonlImport.module.stageJsonlAppend({ target, transactionDir, relativePath: '.gse/evidence/index.jsonl', event })
    jsonlImport.module.publishJsonlAppend(stagedJsonl)
    jsonlImport.module.restoreJsonlAppend(stagedJsonl)
    return {
      available: true,
      stateRestored: digestFile(statePath) === beforeStateDigest,
      jsonlSize: fs.statSync(path.join(target, '.gse', 'evidence', 'index.jsonl')).size,
      stagedJson,
      stagedJsonl,
    }
  } catch (error) {
    return failedProbe('planned primitive restore', error)
  }
}

async function probeMonotonicLockBehavior(lockImport) {
  const required = requireExports(lockImport, modulePaths.lock, ['acquireProjectLock', 'releaseProjectLock'])
  if (!required.available) return unavailableProbe('monotonic lock behavior', required.diagnostics)
  let lock = null
  try {
    const target = createFixture('transaction-faults')
    lock = lockImport.module.acquireProjectLock(target, { operationId: 'op-audit-monotonic-owner', ttlMs: 30000, maxAttempts: 1, now: () => 100000 })
    const contender = lockImport.module.acquireProjectLock(target, { operationId: 'op-audit-monotonic-contender', ttlMs: 30000, maxAttempts: 1, now: () => -100000 })
    return { available: true, lock, contender }
  } catch (error) {
    return failedProbe('monotonic lock behavior', error)
  } finally {
    if (lock) lockImport.module.releaseProjectLock(lock)
  }
}

async function probeRecoverySafety(transactionImport, recoveryImport, jsonlImport, lockImport) {
  const required = [
    requireExports(transactionImport, modulePaths.transaction, ['executeTransaction']),
    requireExports(recoveryImport, modulePaths.recovery, ['recoverTransactions']),
    requireExports(jsonlImport, modulePaths.jsonl, ['readCommittedJsonl']),
    requireExports(lockImport, modulePaths.lock, ['acquireProjectLock', 'releaseProjectLock']),
  ]
  if (required.some((item) => !item.available)) return unavailableProbe('recovery safety', required.flatMap((item) => item.diagnostics))
  try {
    const unknownTarget = createFixture('transaction-faults')
    const unknownTransactionId = 'tx-audit-unknown-canonical'
    await captureExecution(transactionImport.module.executeTransaction, {
      target: unknownTarget,
      operationId: 'op-audit-unknown-canonical',
      transactionId: unknownTransactionId,
      expectedRevision: 0,
      writes: [stateWrite(unknownTarget, 'Published before canonical conflict.')],
      events: [],
      allowedFieldsByRecordType,
      faultAfterStep: 'after-publish',
    })
    const unknownStatePath = path.join(unknownTarget, '.gse', 'state.json')
    fs.writeFileSync(unknownStatePath, `${JSON.stringify({ schemaVersion: 1, stateRevision: 99, activeChangeId: null }, null, 2)}\n`)
    const unknownDigest = digestFile(unknownStatePath)
    const unknownRecovery = recoveryImport.module.recoverTransactions(unknownTarget)

    const lockTarget = createFixture('transaction-faults')
    const recoveryLock = lockImport.module.acquireProjectLock(lockTarget, { operationId: 'op-audit-recovery-lock-holder', ttlMs: 30000, maxAttempts: 1 })
    const lockedRecovery = recoveryImport.module.recoverTransactions(lockTarget)
    lockImport.module.releaseProjectLock(recoveryLock)

    const eventTarget = createFixture('transaction-faults')
    const transactionId = 'tx-audit-recovery-event'
    await captureExecution(transactionImport.module.executeTransaction, {
      target: eventTarget,
      operationId: 'op-audit-recovery-event',
      transactionId,
      expectedRevision: 0,
      writes: [stateWrite(eventTarget, 'Recovery event state.')],
      events: [],
      allowedFieldsByRecordType,
      faultAfterStep: 'after-publish',
    })
    forceDeadLockOwner(eventTarget)
    const firstRecovery = recoveryImport.module.recoverTransactions(eventTarget, { now: () => Date.parse('2026-07-16T12:00:00.000Z') })
    forceDeadLockOwner(eventTarget)
    const secondRecovery = recoveryImport.module.recoverTransactions(eventTarget, { now: () => Date.parse('2026-07-16T13:00:00.000Z') })
    const index = jsonlImport.module.readCommittedJsonl(eventTarget, '.gse/evidence/index.jsonl')
    const recoveryEventId = `recovery-${transactionId}-rolled-back`
    return {
      available: true,
      unknownRecovery,
      unknownDigest,
      unknownDigestAfter: digestFile(unknownStatePath),
      lockedRecovery,
      firstRecovery,
      secondRecovery,
      recoveryEventCount: countEventId(index.records, recoveryEventId),
      recoveryEvent: index.records.find((record) => record?.eventId === recoveryEventId),
    }
  } catch (error) {
    return failedProbe('recovery safety', error)
  }
}

async function probeJsonlOnlyRevision(transactionImport, jsonlImport) {
  const required = requireExports(transactionImport, modulePaths.transaction, ['executeTransaction'])
  const jsonlRequired = requireExports(jsonlImport, modulePaths.jsonl, ['readCommittedJsonl'])
  if (!required.available || !jsonlRequired.available) return unavailableProbe('JSONL-only revision advancement', [...required.diagnostics, ...jsonlRequired.diagnostics])
  try {
    const target = createFixture('transaction-faults')
    const first = await transactionImport.module.executeTransaction({
      target,
      operationId: 'op-audit-jsonl-only-first',
      transactionId: 'tx-audit-jsonl-only-first',
      expectedRevision: 0,
      writes: [],
      events: [eventWrite('tx-audit-jsonl-only-first', 'evt-audit-jsonl-only-first', 'JSONL-only revision probe.')],
      allowedFieldsByRecordType,
    })
    const afterFirst = readRevision(target)
    const second = await transactionImport.module.executeTransaction({
      target,
      operationId: 'op-audit-jsonl-only-second',
      transactionId: 'tx-audit-jsonl-only-second',
      expectedRevision: 1,
      writes: [],
      events: [eventWrite('tx-audit-jsonl-only-second', 'evt-audit-jsonl-only-second', 'Second JSONL-only revision probe.')],
      allowedFieldsByRecordType,
    })
    const index = await Promise.resolve(jsonlImport.module.readCommittedJsonl(target, '.gse/evidence/index.jsonl'))
    return {
      available: true,
      first,
      second,
      afterFirst,
      finalRevision: readRevision(target),
      eventRevisions: index.records.map((record) => record.stateRevision),
    }
  } catch (error) {
    return failedProbe('JSONL-only revision advancement', error)
  }
}
async function probeTruncatedJsonl(jsonlImport) {
  const required = requireExports(jsonlImport, modulePaths.jsonl, ['readCommittedJsonl'])
  if (!required.available) return unavailableProbe('truncated JSONL committed prefix', required.diagnostics)

  try {
    const target = createFixture('truncated-jsonl')
    const prefix = await Promise.resolve(jsonlImport.module.readCommittedJsonl(target, '.gse/evidence/index.jsonl'))
    return { available: true, prefix }
  } catch (error) {
    return failedProbe('truncated JSONL committed prefix', error)
  }
}

async function probePreMarkerRecovery(transactionImport, recoveryImport) {
  const transactionRequired = requireExports(transactionImport, modulePaths.transaction, ['executeTransaction'])
  const recoveryRequired = requireExports(recoveryImport, modulePaths.recovery, ['recoverTransactions', 'inspectPendingTransactions'])
  if (!transactionRequired.available || !recoveryRequired.available) {
    return unavailableProbe('pre-marker recovery', [...transactionRequired.diagnostics, ...recoveryRequired.diagnostics])
  }

  const faultSteps = ['after-lock', 'after-manifest', 'after-intent', 'after-stage', 'after-publish']
  const results = []
  for (const faultAfterStep of faultSteps) {
    try {
      const target = createFixture('transaction-faults')
      const transactionId = `tx-audit-${faultAfterStep}`
      const eventId = `evt-audit-${faultAfterStep}`
      const statePath = path.join(target, '.gse', 'state.json')
      const beforeDigest = digestFile(statePath)
      const execution = await captureExecution(transactionImport.module.executeTransaction, {
        target,
        operationId: `op-audit-${faultAfterStep}`,
        transactionId,
        expectedRevision: 0,
        writes: [
          stateWrite(target, `Injected fault ${faultAfterStep}.`),
          eventWrite(transactionId, eventId, `Recovery probe for ${faultAfterStep}.`),
        ],
        events: [],
        allowedFieldsByRecordType,
        faultAfterStep,
      })
      const pendingBefore = await Promise.resolve(recoveryImport.module.inspectPendingTransactions(target))
      forceDeadLockOwner(target)
      const recovery = await Promise.resolve(recoveryImport.module.recoverTransactions(target))
      const pendingAfter = await Promise.resolve(recoveryImport.module.inspectPendingTransactions(target))
      const stateDigest = digestFile(statePath)
      const reportedOutcome = recoveryOutcome(recovery, transactionId)
      const noManifestFaultReturnedToBefore = faultAfterStep === 'after-lock'
        && !fs.existsSync(manifestPath(target, transactionId))
        && stateDigest === beforeDigest
      results.push({
        faultAfterStep,
        transactionId,
        execution,
        pendingBefore,
        recovery,
        pendingAfter,
        reportedOutcome,
        recovered: reportedOutcome === 'rolled-back' || noManifestFaultReturnedToBefore ? 'rolled-back' : reportedOutcome,
        beforeDigest,
        stateDigest,
        pendingAfterIds: pendingTransactionIds(pendingAfter),
      })
    } catch (error) {
      results.push({
        faultAfterStep,
        recovered: null,
        diagnostics: [errorDiagnostic('PROBE_ERROR', error)],
      })
    }
  }
  return { available: true, results }
}

async function probePostMarkerRecovery(transactionImport, recoveryImport) {
  const transactionRequired = requireExports(transactionImport, modulePaths.transaction, ['executeTransaction'])
  const recoveryRequired = requireExports(recoveryImport, modulePaths.recovery, ['recoverTransactions', 'inspectPendingTransactions'])
  if (!transactionRequired.available || !recoveryRequired.available) {
    return unavailableProbe('post-marker recovery', [...transactionRequired.diagnostics, ...recoveryRequired.diagnostics])
  }

  try {
    const target = createFixture('transaction-faults')
    const transactionId = 'tx-audit-post-marker-recovery'
    const eventId = 'evt-audit-post-marker-recovery'
    const statePath = path.join(target, '.gse', 'state.json')
    const treeSourcePath = path.join(target, 'tree-move-source')
    const treeTargetPath = path.join(target, 'tree-move-target')
    const execution = await captureExecution(transactionImport.module.executeTransaction, {
      target,
      operationId: 'op-audit-post-marker-recovery',
      transactionId,
      expectedRevision: 0,
      writes: [
        stateWrite(target, 'The commit marker requires roll-forward.'),
        eventWrite(transactionId, eventId, 'Post-marker recovery event.'),
        treeMoveWrite(),
      ],
      events: [],
      allowedFieldsByRecordType,
      faultAfterStep: 'after-commit-marker',
    })
    const manifest = fs.existsSync(manifestPath(target, transactionId))
      ? readJson(manifestPath(target, transactionId))
      : null
    const stateManifestWrite = manifest?.writes?.find((write) => write.path === '.gse/state.json')
    const treeManifestWrite = manifest?.writes?.find((write) => write.kind === 'tree-move')
    const afterDigest = stateManifestWrite?.afterDigest ?? null
    const afterTreeDigest = treeManifestWrite?.afterDigest ?? null

    if (fs.existsSync(statePath)) fs.rmSync(statePath)
    if (fs.existsSync(treeTargetPath)) fs.rmSync(treeTargetPath, { recursive: true, force: true })
    forceDeadLockOwner(target)
    const pendingBefore = await Promise.resolve(recoveryImport.module.inspectPendingTransactions(target))
    const recovery = await Promise.resolve(recoveryImport.module.recoverTransactions(target))
    const pendingAfter = await Promise.resolve(recoveryImport.module.inspectPendingTransactions(target))
    return {
      available: true,
      execution,
      manifest,
      markerExists: fs.existsSync(commitMarkerPath(target, transactionId)),
      pendingBefore,
      recovery,
      pendingAfter,
      recovered: recoveryOutcome(recovery, transactionId),
      afterDigest,
      stateDigest: digestFile(statePath),
      afterTreeDigest,
      sourceTreeDigest: digestTree(treeSourcePath),
      targetTreeDigest: digestTree(treeTargetPath),
      pendingAfterIds: pendingTransactionIds(pendingAfter),
    }
  } catch (error) {
    return failedProbe('post-marker recovery', error)
  }
}

async function probeTreeMoveRollback(transactionImport, recoveryImport) {
  const transactionRequired = requireExports(transactionImport, modulePaths.transaction, ['executeTransaction'])
  const recoveryRequired = requireExports(recoveryImport, modulePaths.recovery, ['recoverTransactions', 'inspectPendingTransactions'])
  if (!transactionRequired.available || !recoveryRequired.available) {
    return unavailableProbe('tree move rollback', [...transactionRequired.diagnostics, ...recoveryRequired.diagnostics])
  }

  try {
    const target = createFixture('transaction-faults')
    const transactionId = 'tx-audit-tree-move-rollback'
    const sourcePath = path.join(target, 'tree-move-source')
    const targetPath = path.join(target, 'tree-move-target')
    const beforeTreeDigest = digestTree(sourcePath)
    const execution = await captureExecution(transactionImport.module.executeTransaction, {
      target,
      operationId: 'op-audit-tree-move-rollback',
      transactionId,
      expectedRevision: 0,
      writes: [stateWrite(target, 'Tree move must roll back.'), treeMoveWrite()],
      events: [],
      allowedFieldsByRecordType,
      faultAfterStep: 'after-publish',
    })
    const pendingBefore = recoveryImport.module.inspectPendingTransactions(target)
    forceDeadLockOwner(target)
    const recovery = recoveryImport.module.recoverTransactions(target)
    const pendingAfter = recoveryImport.module.inspectPendingTransactions(target)
    const item = recoveryItems(recovery).find((candidate) => candidate?.transactionId === transactionId) ?? null
    return {
      available: true,
      execution,
      pendingBefore,
      recovery,
      pendingAfter,
      recoveryItem: item,
      beforeTreeDigest,
      sourceTreeDigest: digestTree(sourcePath),
      targetTreeDigest: digestTree(targetPath),
      pendingAfterIds: pendingTransactionIds(pendingAfter),
    }
  } catch (error) {
    return failedProbe('tree move rollback', error)
  }
}

async function probeTreeMoveTargetConflict(transactionImport) {
  const required = requireExports(transactionImport, modulePaths.transaction, ['executeTransaction'])
  if (!required.available) return unavailableProbe('tree move target conflict', required.diagnostics)

  try {
    const target = createFixture('transaction-faults')
    const sourcePath = path.join(target, 'tree-move-source')
    const targetPath = path.join(target, 'tree-move-target')
    const beforeSourceDigest = digestTree(sourcePath)
    const result = await Promise.resolve(transactionImport.module.executeTransaction({
      target,
      operationId: 'op-audit-tree-move-target-conflict',
      transactionId: 'tx-audit-tree-move-target-conflict',
      expectedRevision: 0,
      writes: [stateWrite(target, 'Tree move target conflicts must fail closed.'), treeMoveWrite()],
      events: [],
      allowedFieldsByRecordType,
      validatePreconditions: () => {
        fs.mkdirSync(targetPath, { recursive: true })
        fs.writeFileSync(path.join(targetPath, 'owner.txt'), 'existing authority\n', 'utf8')
        return true
      },
    }))
    return {
      available: true,
      result,
      beforeSourceDigest,
      sourceTreeDigest: digestTree(sourcePath),
      targetTreeDigest: digestTree(targetPath),
      targetOwner: fs.readFileSync(path.join(targetPath, 'owner.txt'), 'utf8'),
      stateRevision: readJson(path.join(target, '.gse', 'state.json')).stateRevision,
    }
  } catch (error) {
    return failedProbe('tree move target conflict', error)
  }
}

async function probeBatchedJsonl(transactionImport, jsonlImport) {
  const transactionRequired = requireExports(transactionImport, modulePaths.transaction, ['executeTransaction'])
  const jsonlRequired = requireExports(jsonlImport, modulePaths.jsonl, ['readCommittedJsonl'])
  if (!transactionRequired.available || !jsonlRequired.available) {
    return unavailableProbe('batched JSONL transaction', [...transactionRequired.diagnostics, ...jsonlRequired.diagnostics])
  }

  try {
    const target = createFixture('transaction-faults')
    const transactionId = 'tx-audit-batched-jsonl'
    const eventIds = ['evt-audit-batched-jsonl-a', 'evt-audit-batched-jsonl-b', 'evt-audit-batched-jsonl-c']
    const options = {
      target,
      operationId: 'op-audit-batched-jsonl',
      transactionId,
      expectedRevision: 0,
      writes: [],
      events: eventIds.map((eventId, index) => eventWrite(
        transactionId,
        eventId,
        `Batched JSONL event ${index + 1}.`,
      )),
      allowedFieldsByRecordType,
    }
    const committed = await transactionImport.module.executeTransaction(options)
    const manifest = readJson(manifestPath(target, transactionId))
    const jsonlWrites = manifest.writes.filter((write) => write.kind === 'jsonl-append')
    const replay = await transactionImport.module.executeTransaction(options)
    const index = jsonlImport.module.readCommittedJsonl(target, '.gse/evidence/index.jsonl')
    return {
      available: true,
      committed,
      replay,
      manifest,
      jsonlWrites,
      eventIds,
      eventCounts: Object.fromEntries(eventIds.map((eventId) => [eventId, countEventId(index.records, eventId)])),
      revision: readRevision(target),
    }
  } catch (error) {
    return failedProbe('batched JSONL transaction', error)
  }
}

async function probeMigrationBootstrap(transactionImport) {
  const required = requireExports(transactionImport, modulePaths.transaction, ['executeTransaction'])
  if (!required.available) return unavailableProbe('migration revision bootstrap', required.diagnostics)

  try {
    const target = createFixture('transaction-faults')
    const statePath = path.join(target, '.gse', 'state.json')
    const legacyState = readJson(statePath)
    delete legacyState.stateRevision
    fs.writeFileSync(statePath, `${JSON.stringify(legacyState, null, 2)}\n`)
    const stateDigest = digestFile(statePath)
    const result = await transactionImport.module.executeTransaction({
      target,
      operationId: 'op-audit-migration-bootstrap',
      transactionId: 'tx-audit-migration-bootstrap',
      expectedRevision: 0,
      migrationBootstrap: { stateDigest },
      writes: [{
        kind: 'json-replace',
        path: '.gse/state.json',
        value: { ...legacyState, stateRevision: 0 },
      }],
      events: [],
      allowedFieldsByRecordType,
    })

    const rejectedTarget = createFixture('transaction-faults')
    const rejectedStatePath = path.join(rejectedTarget, '.gse', 'state.json')
    const rejectedState = readJson(rejectedStatePath)
    delete rejectedState.stateRevision
    fs.writeFileSync(rejectedStatePath, `${JSON.stringify(rejectedState, null, 2)}\n`)
    const rejected = await transactionImport.module.executeTransaction({
      target: rejectedTarget,
      operationId: 'op-audit-migration-bootstrap-rejected',
      transactionId: 'tx-audit-migration-bootstrap-rejected',
      expectedRevision: 0,
      migrationBootstrap: { stateDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      writes: [{
        kind: 'json-replace',
        path: '.gse/state.json',
        value: { ...rejectedState, stateRevision: 0 },
      }],
      events: [],
      allowedFieldsByRecordType,
    })

    return {
      available: true,
      result,
      revision: readRevision(target),
      rejected,
      rejectedStateHasRevision: Object.hasOwn(readJson(rejectedStatePath), 'stateRevision'),
      rejectedManifestExists: fs.existsSync(manifestPath(rejectedTarget, 'tx-audit-migration-bootstrap-rejected')),
    }
  } catch (error) {
    return failedProbe('migration revision bootstrap', error)
  }
}

async function probeBatchedJsonlRecovery(transactionImport, recoveryImport, jsonlImport) {
  const required = [
    requireExports(transactionImport, modulePaths.transaction, ['executeTransaction']),
    requireExports(recoveryImport, modulePaths.recovery, ['recoverTransactions']),
    requireExports(jsonlImport, modulePaths.jsonl, ['readCommittedJsonl']),
  ]
  if (required.some((item) => !item.available)) {
    return unavailableProbe('batched JSONL recovery', required.flatMap((item) => item.diagnostics))
  }

  try {
    const rollbackTarget = createFixture('transaction-faults')
    const rollbackTransactionId = 'tx-audit-batched-rollback'
    const rollbackEventIds = ['evt-audit-batched-rollback-a', 'evt-audit-batched-rollback-b']
    await captureExecution(transactionImport.module.executeTransaction, {
      target: rollbackTarget,
      operationId: 'op-audit-batched-rollback',
      transactionId: rollbackTransactionId,
      expectedRevision: 0,
      writes: [],
      events: rollbackEventIds.map((eventId) => eventWrite(rollbackTransactionId, eventId, 'Batched rollback event.')),
      allowedFieldsByRecordType,
      faultAfterStep: 'after-publish',
    })
    forceDeadLockOwner(rollbackTarget)
    const rollback = recoveryImport.module.recoverTransactions(rollbackTarget)
    const rollbackIndex = jsonlImport.module.readCommittedJsonl(rollbackTarget, '.gse/evidence/index.jsonl')

    const forwardTarget = createFixture('transaction-faults')
    const forwardTransactionId = 'tx-audit-batched-forward'
    const forwardEventIds = ['evt-audit-batched-forward-a', 'evt-audit-batched-forward-b']
    await captureExecution(transactionImport.module.executeTransaction, {
      target: forwardTarget,
      operationId: 'op-audit-batched-forward',
      transactionId: forwardTransactionId,
      expectedRevision: 0,
      writes: [],
      events: forwardEventIds.map((eventId) => eventWrite(forwardTransactionId, eventId, 'Batched roll-forward event.')),
      allowedFieldsByRecordType,
      faultAfterStep: 'after-commit-marker',
    })
    fs.rmSync(path.join(forwardTarget, '.gse', 'evidence', 'index.jsonl'))
    forceDeadLockOwner(forwardTarget)
    const forward = recoveryImport.module.recoverTransactions(forwardTarget)
    const forwardIndex = jsonlImport.module.readCommittedJsonl(forwardTarget, '.gse/evidence/index.jsonl')

    return {
      available: true,
      rollback,
      rollbackOutcome: recoveryOutcome(rollback, rollbackTransactionId),
      rollbackEventCounts: Object.fromEntries(rollbackEventIds.map((eventId) => [eventId, countEventId(rollbackIndex.records, eventId)])),
      rollbackRevision: readRevision(rollbackTarget),
      forward,
      forwardOutcome: recoveryOutcome(forward, forwardTransactionId),
      forwardEventCounts: Object.fromEntries(forwardEventIds.map((eventId) => [eventId, countEventId(forwardIndex.records, eventId)])),
      forwardRevision: readRevision(forwardTarget),
    }
  } catch (error) {
    return failedProbe('batched JSONL recovery', error)
  }
}

async function probeSecretBlocking(transactionImport) {
  const required = requireExports(transactionImport, modulePaths.transaction, ['executeTransaction'])
  if (!required.available) return unavailableProbe('secret blocking', required.diagnostics)

  try {
    const target = createFixture('transaction-faults')
    const transactionId = 'tx-audit-secret-blocking'
    const attemptedWrite = stateWrite(target, '-----BEGIN PRIVATE KEY-----\nsecret audit material')
    const result = await Promise.resolve(transactionImport.module.executeTransaction({
      target,
      operationId: 'op-audit-secret-blocking',
      transactionId,
      expectedRevision: 0,
      writes: [attemptedWrite],
      events: [],
      allowedFieldsByRecordType,
    }))
    return {
      available: true,
      result,
      status: resultField(result, 'status'),
      reasonCode: resultField(result, 'reasonCode'),
      manifestExists: fs.existsSync(manifestPath(target, transactionId)),
      revision: readRevision(target),
    }
  } catch (error) {
    return failedProbe('secret blocking', error)
  }
}

const imports = Object.fromEntries(await Promise.all(
  Object.entries(modulePaths).map(async ([name, modulePath]) => [name, await guardedImport(modulePath)]),
))

let report
try {
  const lockExclusion = await probeLockExclusion(imports.lock)
  const staleRecovery = await probeStaleLockRecovery(imports.lock)
  const mismatch = await probeRevisionMismatch(imports.transaction)
  const manifestProbe = await probeCompleteManifest(imports.transaction)
  const markerAuthority = await probeCommitMarkerAuthority(imports.transaction, imports.jsonl)
  const replay = await probeIdempotentReplay(imports.transaction, imports.jsonl)
  const operationReplay = await probeOperationReplayAcrossTransactionIds(imports.transaction, imports.jsonl)
  const primitives = await probePlannedPrimitiveRestore(imports.atomicJson, imports.jsonl)
  const monotonicLock = await probeMonotonicLockBehavior(imports.lock)
  const recoverySafety = await probeRecoverySafety(imports.transaction, imports.recovery, imports.jsonl, imports.lock)
  const jsonlOnlyRevision = await probeJsonlOnlyRevision(imports.transaction, imports.jsonl)
  const truncated = await probeTruncatedJsonl(imports.jsonl)
  const preMarker = await probePreMarkerRecovery(imports.transaction, imports.recovery)
  const postMarker = await probePostMarkerRecovery(imports.transaction, imports.recovery)
  const treeMoveRollback = await probeTreeMoveRollback(imports.transaction, imports.recovery)
  const treeMoveTargetConflict = await probeTreeMoveTargetConflict(imports.transaction)
  const batchedJsonl = await probeBatchedJsonl(imports.transaction, imports.jsonl)
  const migrationBootstrap = await probeMigrationBootstrap(imports.transaction)
  const batchedRecovery = await probeBatchedJsonlRecovery(imports.transaction, imports.recovery, imports.jsonl)
  const secretAttempt = await probeSecretBlocking(imports.transaction)

  const secondLock = lockExclusion.secondLock
  const recoveredLock = staleRecovery.recoveredLock
  const manifest = manifestProbe.manifest
  const requestedWrites = manifestProbe.requestedWrites ?? []
  const committedRevision = resultField(replay.committed, 'stateRevision')
  const replayRevision = resultField(replay.replay, 'stateRevision')
  const prefix = truncated.prefix
  const preCommitFaults = preMarker.results ?? []
  const postCommitFault = postMarker

  const checks = [
    check(
      'TX01',
      'lock excludes a second live writer',
      lockExclusion.available
        && resultField(secondLock, 'status') === 'blocked'
        && resultField(secondLock, 'reasonCode') === 'LOCK_HELD',
      lockExclusion,
    ),
    check(
      'TX02',
      'expired lock is recoverable with an audit record',
      staleRecovery.available
        && recoveredLock?.recoveredStaleOwner === true
        && staleRecovery.staleRecords?.length > 0,
      staleRecovery,
    ),
    check(
      'TX03',
      'revision mismatch publishes no write',
      mismatch.available
        && resultField(mismatch.result, 'status') === 'repair'
        && resultField(mismatch.result, 'reasonCode') === 'STATE_REVISION_MISMATCH'
        && mismatch.revision === 2
        && mismatch.beforeDigest === mismatch.afterDigest
        && mismatch.manifestExists === false,
      mismatch,
    ),
    check(
      'TX04',
      'manifest contains the complete write set and digests',
      manifestProbe.available
        && manifest?.writes?.length === requestedWrites.length
        && manifest.writes.every(hasRequiredWriteMetadata),
      manifestProbe,
    ),
    check(
      'TX05',
      'commit marker is the authority point',
      markerAuthority.available
        && markerAuthority.beforeMarkerExists === false
        && markerAuthority.afterMarkerExists === true
        && markerAuthority.beforeMarkerVisible === false
        && markerAuthority.afterMarkerVisible === true,
      markerAuthority,
    ),
    check(
      'TX06',
      'duplicate transaction and event replay are idempotent',
      replay.available
        && replayRevision === committedRevision
        && replay.stateRevision === committedRevision
        && replay.eventCount === 1,
      replay,
    ),
    check(
      'TX07',
      'truncated JSONL exposes committed prefix only',
      truncated.available
        && prefix?.records?.length === 1
        && prefix?.corruptTail?.length === 1,
      truncated,
    ),
    check(
      'TX08',
      'faults before commit marker recover to the before state',
      preMarker.available
        && preCommitFaults.length === 5
        && preCommitFaults.every((item) =>
          item.recovered === 'rolled-back'
          && item.stateDigest === item.beforeDigest
          && !item.pendingAfterIds?.includes(item.transactionId)
        ),
      preMarker,
    ),
    check(
      'TX09',
      'fault after commit marker recovers the complete after state',
      postMarker.available
        && postCommitFault.markerExists === true
        && postCommitFault.recovered === 'rolled-forward'
        && postCommitFault.afterDigest !== null
        && postCommitFault.stateDigest === postCommitFault.afterDigest
        && postCommitFault.afterTreeDigest !== null
        && postCommitFault.sourceTreeDigest === null
        && postCommitFault.targetTreeDigest === postCommitFault.afterTreeDigest
        && !postCommitFault.pendingAfterIds?.includes('tx-audit-post-marker-recovery'),
      postCommitFault,
    ),
    check(
      'TX10',
      'structured writes block suspected secrets before manifest publication',
      secretAttempt.available
        && secretAttempt.status === 'blocked'
        && secretAttempt.reasonCode === 'SUSPECTED_SECRET'
        && secretAttempt.manifestExists === false
        && secretAttempt.revision === 0,
      secretAttempt,
    ),
    check(
      'TX11',
      'operation replay is idempotent across transaction IDs and advances active Change revision once',
      operationReplay.available
        && operationReplay.revision === 1
        && operationReplay.activeCacheRevision === 1
        && operationReplay.eventCount === 1
        && operationReplay.secondManifestExists === false
        && resultField(operationReplay.replay, 'reasonCode') === 'OPERATION_ALREADY_COMMITTED',
      operationReplay,
    ),
    check(
      'TX12',
      'planned JSON replacement and JSONL append primitives publish and restore',
      primitives.available
        && primitives.stateRestored === true
        && primitives.jsonlSize === 0,
      primitives,
    ),
    check(
      'TX13',
      'same-process lock validity ignores wall-clock rollback while owner is live',
      monotonicLock.available
        && resultField(monotonicLock.contender, 'status') === 'blocked'
        && resultField(monotonicLock.contender, 'reasonCode') === 'LOCK_HELD',
      monotonicLock,
    ),
    check(
      'TX14',
      'recovery requires lock, blocks unknown canonical state, and emits one durable idempotent event',
      recoverySafety.available
        && recoverySafety.unknownRecovery?.status === 'blocked'
        && recoverySafety.unknownRecovery?.reasonCode === 'RECOVERY_AUTHORITY_REQUIRED'
        && recoverySafety.unknownDigestAfter === recoverySafety.unknownDigest
        && recoverySafety.lockedRecovery?.status === 'blocked'
        && recoverySafety.recoveryEventCount === 1,
      recoverySafety,
    ),
    check(
      'TX15',
      'JSONL-only transactions inject durable revision writes and permit the next revision',
      jsonlOnlyRevision.available
        && jsonlOnlyRevision.afterFirst === 1
        && jsonlOnlyRevision.finalRevision === 2
        && resultField(jsonlOnlyRevision.second, 'stateRevision') === 2
        && JSON.stringify(jsonlOnlyRevision.eventRevisions) === JSON.stringify([1, 2]),
      jsonlOnlyRevision,
    ),
    check(
      'TX16',
      'recovery event is schema-complete, allowlisted, and carries transaction identity',
      recoverySafety.available
        && recoverySafety.recoveryEventCount === 1
        && recoverySafety.recoveryEvent?.transactionId === 'tx-audit-recovery-event'
        && recoverySafety.recoveryEvent?.recordType === 'transaction-recovery'
        && recoverySafety.recoveryEvent?.dependencies?.contractRevision === 'core-v1',
      recoverySafety,
    ),
    check(
      'TX17',
      'tree move before commit marker restores source and removes destination',
      treeMoveRollback.available
        && treeMoveRollback.recoveryItem?.status === 'complete'
        && treeMoveRollback.recoveryItem?.reasonCode === 'TRANSACTION_ROLLED_BACK'
        && treeMoveRollback.sourceTreeDigest === treeMoveRollback.beforeTreeDigest
        && treeMoveRollback.targetTreeDigest === null
        && !treeMoveRollback.pendingAfterIds?.includes('tx-audit-tree-move-rollback'),
      treeMoveRollback,
    ),
    check(
      'TX18',
      'tree move refuses an existing destination without replacing either authority',
      treeMoveTargetConflict.available
        && resultField(treeMoveTargetConflict.result, 'status') === 'repair'
        && resultField(treeMoveTargetConflict.result, 'reasonCode') === 'TREE_MOVE_TARGET_EXISTS'
        && treeMoveTargetConflict.sourceTreeDigest === treeMoveTargetConflict.beforeSourceDigest
        && treeMoveTargetConflict.targetTreeDigest !== null
        && treeMoveTargetConflict.targetOwner === 'existing authority\n'
        && treeMoveTargetConflict.stateRevision === 0,
      treeMoveTargetConflict,
    ),
    check(
      'TX19',
      'same-destination JSONL events publish as one manifest batch and replay without duplicates',
      batchedJsonl.available
        && batchedJsonl.jsonlWrites?.length === 1
        && JSON.stringify(batchedJsonl.jsonlWrites[0]?.eventIds) === JSON.stringify(batchedJsonl.eventIds)
        && hasRequiredWriteMetadata(batchedJsonl.jsonlWrites[0])
        && Object.values(batchedJsonl.eventCounts ?? {}).every((count) => count === 1)
        && batchedJsonl.revision === 1
        && resultField(batchedJsonl.replay, 'reasonCode') === 'OPERATION_ALREADY_COMMITTED',
      batchedJsonl,
    ),
    check(
      'TX20',
      'migration bootstrap accepts only the exact missing-revision source digest',
      migrationBootstrap.available
        && resultField(migrationBootstrap.result, 'status') === 'complete'
        && migrationBootstrap.revision === 1
        && resultField(migrationBootstrap.rejected, 'status') === 'repair'
        && resultField(migrationBootstrap.rejected, 'reasonCode') === 'INVALID_PROJECT_STATE'
        && migrationBootstrap.rejectedStateHasRevision === false
        && migrationBootstrap.rejectedManifestExists === false,
      migrationBootstrap,
    ),
    check(
      'TX21',
      'batched JSONL recovery rolls back before marker and rolls forward every event after marker',
      batchedRecovery.available
        && batchedRecovery.rollbackOutcome === 'rolled-back'
        && batchedRecovery.rollbackRevision === 0
        && Object.values(batchedRecovery.rollbackEventCounts ?? {}).every((count) => count === 0)
        && batchedRecovery.forwardOutcome === 'rolled-forward'
        && batchedRecovery.forwardRevision === 1
        && Object.values(batchedRecovery.forwardEventCounts ?? {}).every((count) => count === 1),
      batchedRecovery,
    ),
  ]

  const failed = checks.filter((item) => item.status === 'failed').length
  const status = failed === 0 ? 'passed' : 'failed'
  report = {
    root,
    generatedAt: new Date().toISOString(),
    status,
    summary: { status, passed: checks.length - failed, failed, total: checks.length },
    modules: Object.fromEntries(Object.entries(imports).map(([name, moduleImport]) => [name, {
      path: modulePaths[name],
      available: moduleImport.available,
      diagnostic: moduleImport.diagnostic,
    }])),
    checks,
    limits: [
      'This dependency-free audit calls the production persistence exports directly and does not simulate lock, transaction, JSONL, or recovery behavior.',
      'Every mutating probe runs against a fresh fs.mkdtempSync copy of the declared Core foundation fixtures.',
      'faultAfterStep is passed only by this test audit to executeTransaction; no production CLI surface is exercised or added.',
      'Temporary fixture directories are removed in a finally block even when persistence modules are unavailable or a probe fails.',
    ],
  }

  if (jsonOnly) console.log(JSON.stringify(report, null, 2))
  else {
    const lines = [
      '# GSE Core Transaction Audit',
      '',
      `Status: ${report.status}`,
      `Checks: ${report.summary.passed}/${report.summary.total}`,
      '',
    ]
    for (const item of report.checks) {
      lines.push(`${item.status === 'passed' ? '[x]' : '[ ]'} ${item.id} ${item.label}: ${JSON.stringify(item.evidence)}`)
    }
    lines.push('', 'Limits:')
    for (const limit of report.limits) lines.push(`- ${limit}`)
    console.log(`${lines.join('\n')}\n`)
  }

  if (failed > 0) process.exitCode = 1
} finally {
  for (const temporaryDirectory of temporaryDirectories.reverse()) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}
