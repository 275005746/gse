import fs from 'node:fs'
import path from 'node:path'

import { assertTransactionManifestContract } from '../contracts.mjs'
import { listActiveChangeIds } from '../change-state.mjs'
import { sanitizeStructuredRecord } from '../redaction.mjs'
import {
  readAtomicJson,
  serializeJson,
  stageAtomicJson,
  writeAtomicJson,
} from './atomic-json.mjs'
import {
  appendStagedJsonl,
  readCommittedJsonl,
  stageJsonlAppend,
} from './jsonl.mjs'
import { acquireProjectLock, releaseProjectLock } from './lock.mjs'
import { digestBytes, digestFile, resolveInside, toPosix } from './paths.mjs'

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const SUPPORTED_KINDS = new Set(['json-replace', 'jsonl-append', 'text-write', 'tree-move'])
const FAULT_STEPS = new Set([
  'after-lock',
  'after-manifest',
  'after-intent',
  'after-stage',
  'after-publish',
  'after-commit-marker',
])

function result({
  operationId,
  transactionId,
  status,
  reasonCode,
  message,
  stateRevision = null,
  safeToRetry = false,
  artifactRefs = [],
}) {
  return {
    schemaVersion: 1,
    operationId,
    transactionId,
    status,
    reasonCode,
    message,
    stateRevision,
    artifactRefs,
    safeToRetry,
  }
}

function failure(operationId, transactionId, reasonCode, message, options = {}) {
  return result({
    operationId,
    transactionId,
    status: options.status ?? 'repair',
    reasonCode,
    message,
    stateRevision: options.stateRevision ?? null,
    safeToRetry: options.safeToRetry ?? false,
  })
}

function fault(step) {
  const error = new Error(`Injected transaction fault at ${step}.`)
  error.code = 'TEST_FAULT_INJECTED'
  error.faultAfterStep = step
  throw error
}

function maybeFault(requested, step) {
  if (requested === step) fault(step)
}

function safeIdentifier(value) {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value)
}

function recordTypeFor(relativePath, record) {
  if (record && typeof record.recordType === 'string') return record.recordType
  if (toPosix(relativePath) === '.gse/state.json') return 'project-state'
  if (/^\.gse\/changes\/[^/]+\/change\.json$/.test(toPosix(relativePath))) return 'active-change'
  return null
}

function sanitizeRecord(record, relativePath, allowedFieldsByRecordType) {
  const recordType = recordTypeFor(relativePath, record)
  const allowedFields = recordType === null ? null : allowedFieldsByRecordType?.[recordType]
  if (!Array.isArray(allowedFields)) {
    const error = new Error('No structured-record allowlist is available for the requested write.')
    error.code = 'STRUCTURED_RECORD_ALLOWLIST_REQUIRED'
    throw error
  }
  return sanitizeStructuredRecord(record, allowedFields)
}

function jsonlBytes(record) {
  const serialized = JSON.stringify(record)
  if (serialized === undefined || serialized.includes('\n') || serialized.includes('\r')) {
    const error = new Error('A JSONL record must serialize to one JSON line.')
    error.code = 'INVALID_JSONL_RECORD'
    throw error
  }
  return Buffer.from(`${serialized}\n`, 'utf8')
}

function jsonlBatchBytes(records) {
  return Buffer.concat(records.map(jsonlBytes))
}

function readFileOrEmpty(filePath) {
  try {
    return fs.readFileSync(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return Buffer.alloc(0)
    throw error
  }
}

function digestTree(rootPath) {
  try {
    const stat = fs.lstatSync(rootPath)
    if (stat.isSymbolicLink()) throw Object.assign(new Error('Tree paths must not be symlinks.'), { code: 'UNSAFE_PERSISTENCE_PATH' })
    if (stat.isFile()) return digestBytes(fs.readFileSync(rootPath))
    if (!stat.isDirectory()) return null
    const entries = fs.readdirSync(rootPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    const chunks = []
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw Object.assign(new Error('Tree paths must not contain symlinks.'), { code: 'UNSAFE_PERSISTENCE_PATH' })
      chunks.push(Buffer.from(`${entry.name}\0`, 'utf8'))
      chunks.push(Buffer.from(digestTree(path.join(rootPath, entry.name)) ?? 'missing', 'utf8'))
    }
    return digestBytes(Buffer.concat(chunks))
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null
    throw error
  }
}

function copyTreeSafe(source, destination) {
  const stat = fs.lstatSync(source)
  if (stat.isSymbolicLink()) throw Object.assign(new Error('Tree paths must not be symlinks.'), { code: 'UNSAFE_PERSISTENCE_PATH' })
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true, mode: 0o700 })
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) copyTreeSafe(path.join(source, entry.name), path.join(destination, entry.name))
  } else if (stat.isFile()) {
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 })
    fs.copyFileSync(source, destination)
  } else throw Object.assign(new Error('Tree paths must be regular files or directories.'), { code: 'UNSAFE_PERSISTENCE_PATH' })
}

function removeTreeSafe(rootPath) {
  const stat = fs.lstatSync(rootPath)
  if (stat.isSymbolicLink()) throw Object.assign(new Error('Tree paths must not be symlinks.'), { code: 'UNSAFE_PERSISTENCE_PATH' })
  fs.rmSync(rootPath, { recursive: stat.isDirectory(), force: true })
}

function writeDurableBytes(filePath, bytes) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.restore-${process.pid}`)
  let descriptor
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600)
    fs.writeFileSync(descriptor, bytes)
    fs.fsyncSync(descriptor)
    fs.closeSync(descriptor)
    descriptor = undefined
    fs.renameSync(temporaryPath, filePath)
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor) } catch {}
    }
    try { fs.rmSync(temporaryPath, { force: true }) } catch {}
  }
}

function rollbackPublished(target, preparedWrites) {
  for (const write of [...preparedWrites].reverse()) {
    if (!write.published) continue
    if (write.kind === 'tree-move') {
      const source = resolveInside(target, write.sourcePath)
      const destination = resolveInside(target, write.targetPath)
      if (fs.existsSync(destination)) {
        if (fs.existsSync(source)) removeTreeSafe(source)
        fs.renameSync(destination, source)
      }
      continue
    }
    const canonicalPath = resolveInside(target, write.path)
    if (write.beforeDigest === null) {
      try { fs.rmSync(canonicalPath, { force: true }) } catch {}
      continue
    }
    const beforePath = resolveInside(target, write.beforeImagePath)
    writeDurableBytes(canonicalPath, fs.readFileSync(beforePath))
  }
}

function manifestRelativePath(transactionId) {
  return `.gse/transactions/${transactionId}/manifest.json`
}

function commitRelativePath(transactionId) {
  return `.gse/transactions/${transactionId}/commit.json`
}

function updateManifest(target, manifestPath, manifest, status) {
  const updated = { ...manifest, status }
  assertTransactionManifestContract(updated)
  writeAtomicJson(target, manifestPath, updated)
  return updated
}

function committedMarkerMatchesManifest(target, transactionId, marker) {
  if (
    marker?.schemaVersion !== 1
    || marker.transactionId !== transactionId
    || marker.status !== 'committed'
    || !safeIdentifier(marker.operationId)
    || !Number.isInteger(marker.stateRevision)
    || marker.stateRevision < 1
    || !Array.isArray(marker.eventIds)
  ) return false

  const manifest = readAtomicJson(target, manifestRelativePath(transactionId), { allowMissing: true })
  if (manifest === null) return false
  try {
    assertTransactionManifestContract(manifest)
  } catch {
    return false
  }
  return manifest.transactionId === transactionId
    && manifest.operationId === marker.operationId
    && manifest.nextRevision === marker.stateRevision
    && manifest.eventIds.length === marker.eventIds.length
    && marker.eventIds.every((eventId) => manifest.eventIds.includes(eventId))
}

function findCommittedReplay(target, operationId, eventIds = []) {
  let directory
  try {
    directory = resolveInside(target, '.gse/transactions')
    const stats = fs.lstatSync(directory)
    if (stats.isSymbolicLink() || !stats.isDirectory()) return null
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null
    throw error
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    const marker = readAtomicJson(target, commitRelativePath(entry.name), { allowMissing: true })
    if (!committedMarkerMatchesManifest(target, entry.name, marker)) continue
    const operationReplay = marker.operationId === operationId
    const eventReplay = eventIds.some((eventId) => marker.eventIds.includes(eventId))
    if (operationReplay || eventReplay) {
      return result({
        operationId,
        transactionId: marker.transactionId,
        status: 'complete',
        reasonCode: operationReplay ? 'OPERATION_ALREADY_COMMITTED' : 'EVENT_ALREADY_COMMITTED',
        message: operationReplay
          ? 'The operation was already committed by a durable transaction.'
          : 'An event was already committed by a durable transaction.',
        stateRevision: marker.stateRevision,
        artifactRefs: [commitRelativePath(marker.transactionId), manifestRelativePath(marker.transactionId)],
        safeToRetry: true,
      })
    }
  }
  return null
}

function activeChangeCachePath(target) {
  const activeChangeIds = listActiveChangeIds(target)
  if (activeChangeIds.length > 1) {
    const error = new Error('Core v1 supports only one active Change cache.')
    error.code = 'MULTIPLE_ACTIVE_CHANGES_UNSUPPORTED'
    throw error
  }
  if (activeChangeIds.length === 0) return null
  return `.gse/changes/${activeChangeIds[0]}/change.json`
}

function applyRevisionWrites(target, writes, expectedRevision, allowedFieldsByRecordType) {
  const nextRevision = expectedRevision + 1
  const activeCachePath = activeChangeCachePath(target)
  const requested = new Map(writes.map((write) => [write.path, write]))
  const movedSources = writes.filter((write) => write.kind === 'tree-move').map((write) => write.sourcePath)
  const activeCacheToUpdate = activeCachePath !== null
    && !movedSources.some((sourcePath) => activeCachePath === sourcePath || activeCachePath.startsWith(`${sourcePath}/`))
    ? activeCachePath
    : null
  const stateWrite = requested.get('.gse/state.json')
  if (stateWrite?.kind === 'json-replace') {
    stateWrite.value = { ...stateWrite.value, stateRevision: nextRevision }
  } else {
    const existingState = readAtomicJson(target, '.gse/state.json')
    writes.push({
      index: writes.length,
      kind: 'json-replace',
      path: '.gse/state.json',
      value: sanitizeRecord({ ...existingState, stateRevision: nextRevision }, '.gse/state.json', allowedFieldsByRecordType),
    })
  }
  if (activeCacheToUpdate !== null) {
    const requestedCache = requested.get(activeCacheToUpdate)
    if (requestedCache?.kind === 'json-replace') {
      requestedCache.value = { ...requestedCache.value, stateRevision: nextRevision }
    } else {
      const existingCache = readAtomicJson(target, activeCacheToUpdate, { allowMissing: true })
      if (existingCache !== null) {
        writes.push({
          index: writes.length,
          kind: 'json-replace',
          path: activeCacheToUpdate,
          value: sanitizeRecord({ ...existingCache, stateRevision: nextRevision }, activeCacheToUpdate, allowedFieldsByRecordType),
        })
      }
    }
  }
  return writes
}

function existingCommittedResult(target, operationId, transactionId) {
  const markerPath = commitRelativePath(transactionId)
  const marker = readAtomicJson(target, markerPath, { allowMissing: true })
  if (marker === null) return null
  if (
    marker?.schemaVersion !== 1
    || marker.transactionId !== transactionId
    || marker.operationId !== operationId
    || marker.status !== 'committed'
    || !Number.isInteger(marker.stateRevision)
    || marker.stateRevision < 1
  ) {
    return failure(operationId, transactionId, 'INVALID_COMMIT_MARKER', 'The existing transaction commit marker is invalid.')
  }
  return result({
    operationId,
    transactionId,
    status: 'complete',
    reasonCode: 'TRANSACTION_ALREADY_COMMITTED',
    message: 'The transaction was already committed.',
    stateRevision: marker.stateRevision,
    artifactRefs: [markerPath, manifestRelativePath(transactionId)],
    safeToRetry: true,
  })
}

function normalizeRequestedWrites(options) {
  if (!Array.isArray(options.writes) || !Array.isArray(options.events ?? [])) {
    const error = new Error('Transaction writes and events must be arrays.')
    error.code = 'INVALID_TRANSACTION_WRITES'
    throw error
  }

  const eventWrites = (options.events ?? []).map((item) => {
    const event = item?.event ?? item
    const eventPath = item?.path ?? event?.evidenceFile ?? '.gse/evidence/index.jsonl'
    return { kind: 'jsonl-append', path: eventPath, event }
  })
  return [...options.writes, ...eventWrites]
}

function sanitizeRequestedWrites(options, transactionId, expectedRevision) {
  const requestedWrites = normalizeRequestedWrites(options)
  const pathKinds = new Map()
  const seenEventIds = new Set()
  const sanitizedWrites = []

  for (const [index, write] of requestedWrites.entries()) {
    if (!write || typeof write !== 'object' || Array.isArray(write)) {
      const error = new Error('Each transaction write must be an object.')
      error.code = 'INVALID_TRANSACTION_WRITE'
      throw error
    }
    if (!SUPPORTED_KINDS.has(write.kind)) {
      const error = new Error('The requested transaction write kind is unsupported.')
      error.code = 'UNSUPPORTED_WRITE_KIND'
      throw error
    }
    const relativePath = toPosix(write.path ?? write.targetPath ?? write.sourcePath)
    resolveInside(options.target, relativePath)
    const existingKind = pathKinds.get(relativePath)
    if (existingKind !== undefined && (existingKind !== 'jsonl-append' || write.kind !== 'jsonl-append')) {
      const error = new Error('A transaction cannot write the same canonical path more than once.')
      error.code = 'DUPLICATE_WRITE_PATH'
      throw error
    }
    pathKinds.set(relativePath, write.kind)

    if (write.kind === 'text-write') {
      if (typeof write.content !== 'string') {
        const error = new Error('A text-write requires string content.')
        error.code = 'INVALID_TEXT_WRITE'
        throw error
      }
      sanitizedWrites.push({ index, kind: write.kind, path: relativePath, content: write.content })
      continue
    }

    if (write.kind === 'tree-move') {
      pathKinds.delete(relativePath)
      const sourcePath = toPosix(write.sourcePath)
      const targetPath = toPosix(write.targetPath)
      resolveInside(options.target, sourcePath)
      resolveInside(options.target, targetPath)
      if (pathKinds.has(sourcePath) || pathKinds.has(targetPath) || sourcePath === targetPath) {
        const error = new Error('Tree move paths must be unique and distinct.')
        error.code = 'DUPLICATE_WRITE_PATH'
        throw error
      }
      pathKinds.set(sourcePath, write.kind)
      pathKinds.set(targetPath, write.kind)
      sanitizedWrites.push({ index, kind: write.kind, path: targetPath, sourcePath, targetPath })
      continue
    }

    if (write.kind === 'json-replace') {
      const value = sanitizeRecord(write.value, relativePath, options.allowedFieldsByRecordType)
      sanitizedWrites.push({ index, kind: write.kind, path: relativePath, value })
      continue
    }

    const sanitizedEvent = sanitizeRecord(write.event, relativePath, options.allowedFieldsByRecordType)
    const eventId = sanitizedEvent.eventId
    if (typeof eventId !== 'string' || eventId.length === 0 || seenEventIds.has(eventId)) {
      const error = new Error('Each JSONL append requires a unique eventId.')
      error.code = 'INVALID_EVENT_ID'
      throw error
    }
    seenEventIds.add(eventId)
    sanitizedWrites.push({
      index,
      kind: write.kind,
      path: relativePath,
      eventId,
      event: { ...sanitizedEvent, transactionId, stateRevision: expectedRevision + 1 },
    })
  }

  const grouped = []
  const jsonlByPath = new Map()
  for (const write of sanitizedWrites) {
    if (write.kind !== 'jsonl-append') {
      grouped.push(write)
      continue
    }
    const existing = jsonlByPath.get(write.path)
    if (existing) {
      existing.eventIds.push(write.eventId)
      existing.events.push(write.event)
      continue
    }
    const batch = {
      index: write.index,
      kind: write.kind,
      path: write.path,
      eventId: write.eventId,
      eventIds: [write.eventId],
      event: write.event,
      events: [write.event],
    }
    jsonlByPath.set(write.path, batch)
    grouped.push(batch)
  }
  return grouped.sort((left, right) => left.index - right.index)
}

function prepareWrite(target, transactionId, expectedRevision, write) {
  const extension = write.kind === 'json-replace' ? 'json' : write.kind === 'jsonl-append' ? 'jsonl' : write.kind === 'text-write' ? 'txt' : 'tree'
  const stagedPath = `.gse/transactions/${transactionId}/staged/${String(write.index).padStart(4, '0')}.${extension}`
  const beforeImagePath = `.gse/transactions/${transactionId}/before/${String(write.index).padStart(4, '0')}.bin`
  const canonicalPath = resolveInside(target, write.path)
  const beforeBytes = write.kind === 'tree-move' ? null : readFileOrEmpty(canonicalPath)
  const beforeDigest = write.kind === 'tree-move' ? digestTree(resolveInside(target, write.sourcePath)) : digestFile(canonicalPath)

  if (write.kind === 'tree-move') {
    const source = resolveInside(target, write.sourcePath)
    const stagedTree = resolveInside(target, stagedPath)
    copyTreeSafe(source, stagedTree)
    return { ...write, stagedPath, beforeImagePath, beforeDigest: digestTree(source), afterDigest: digestTree(stagedTree), published: false, manifestWrite: { kind: write.kind, path: write.targetPath, sourcePath: write.sourcePath, targetPath: write.targetPath, beforeDigest: digestTree(source), afterDigest: digestTree(stagedTree), stagedPath, beforeImagePath } }
  }

  if (write.kind === 'text-write') {
    const afterBytes = Buffer.from(write.content, 'utf8')
    return { ...write, stagedPath, beforeImagePath, beforeBytes, beforeDigest, afterDigest: digestBytes(afterBytes), published: false, manifestWrite: { kind: write.kind, path: write.path, beforeDigest, afterDigest: digestBytes(afterBytes), stagedPath, beforeImagePath } }
  }

  if (write.kind === 'json-replace') {
    const value = toPosix(write.path) === '.gse/state.json'
      ? { ...write.value, stateRevision: expectedRevision + 1 }
      : write.value
    const afterBytes = serializeJson(value)
    return {
      ...write,
      value,
      stagedPath,
      beforeImagePath,
      beforeBytes,
      beforeDigest,
      afterDigest: digestBytes(afterBytes),
      published: false,
      manifestWrite: {
        kind: write.kind,
        path: write.path,
        beforeDigest,
        afterDigest: digestBytes(afterBytes),
        stagedPath,
        beforeImagePath,
      },
    }
  }

  const committed = readCommittedJsonl(target, write.path, { allowMissing: true })
  if (committed.corruptTail.length > 0) {
    const error = new Error('A JSONL destination has a malformed or incomplete tail.')
    error.code = 'INVALID_JSONL_TAIL'
    throw error
  }
  const committedIds = new Set(committed.records.map((record) => record?.eventId).filter((eventId) => typeof eventId === 'string'))
  const appendEvents = write.events.filter((event) => !committedIds.has(event.eventId))
  const appendBytes = jsonlBatchBytes(appendEvents)
  const afterBytes = appendEvents.length === 0 ? beforeBytes : Buffer.concat([beforeBytes, appendBytes])
  const eventIds = write.events.map((event) => event.eventId)
  return {
    ...write,
    stagedPath,
    beforeImagePath,
    beforeBytes,
    beforeDigest,
    beforeSize: beforeBytes.length,
    afterDigest: digestBytes(afterBytes),
    duplicate: appendEvents.length === 0,
    appendEvents,
    eventIds,
    published: false,
    manifestWrite: {
      kind: write.kind,
      path: write.path,
      beforeDigest,
      afterDigest: digestBytes(afterBytes),
      stagedPath,
      beforeImagePath,
      ...(eventIds.length === 1 ? { eventId: eventIds[0] } : {}),
      eventIds,
      beforeSize: beforeBytes.length,
    },
  }
}

function persistBeforeImages(target, preparedWrites) {
  for (const write of preparedWrites) {
    const beforePath = resolveInside(target, write.beforeImagePath)
    if (write.kind === 'tree-move') {
      copyTreeSafe(resolveInside(target, write.sourcePath), beforePath)
    } else if (write.beforeDigest !== null) {
      writeDurableBytes(beforePath, write.beforeBytes)
    }
  }
}

function stageIntent(target, transactionId, operationId, expectedRevision, writePaths) {
  const intent = {
    schemaVersion: 1,
    eventId: `intent-${transactionId}`,
    transactionId,
    operationId,
    recordType: 'transaction-intent',
    timestamp: new Date().toISOString(),
    expectedRevision,
    writePaths,
  }
  const relativePath = `.gse/transactions/${transactionId}/intent.jsonl`
  stageJsonlAppend(target, relativePath, intent)
  return relativePath
}

function stageWrites(target, preparedWrites) {
  for (const write of preparedWrites) {
    if (write.kind === 'json-replace') {
      stageAtomicJson(target, write.stagedPath, write.value)
    } else if (write.kind === 'jsonl-append') {
      const stagedBytes = jsonlBatchBytes(write.appendEvents)
      const destination = resolveInside(target, write.stagedPath)
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 })
      fs.writeFileSync(destination, stagedBytes)
    } else if (write.kind === 'text-write') {
      const destination = resolveInside(target, write.stagedPath)
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 })
      fs.writeFileSync(destination, write.content, 'utf8')
    } else if (write.kind === 'tree-move') {
      const stagedTree = resolveInside(target, write.stagedPath)
      if (!fs.existsSync(stagedTree)) copyTreeSafe(resolveInside(target, write.sourcePath), stagedTree)
    }
  }
}

function publishWrites(target, preparedWrites) {
  const orderedWrites = [...preparedWrites].sort((left, right) => {
    if (left.kind === 'tree-move' && right.kind !== 'tree-move') return -1
    if (left.kind !== 'tree-move' && right.kind === 'tree-move') return 1
    return left.index - right.index
  })
  for (const write of orderedWrites) {
    if (write.kind === 'json-replace') writeAtomicJson(target, write.path, write.value)
    else if (write.kind === 'jsonl-append' && !write.duplicate) appendStagedJsonl(target, write.path, write.stagedPath, { expectedBeforeSize: write.beforeSize })
    else if (write.kind === 'text-write') writeDurableBytes(resolveInside(target, write.path), Buffer.from(write.content, 'utf8'))
    else if (write.kind === 'tree-move') {
      const source = resolveInside(target, write.sourcePath)
      const destination = resolveInside(target, write.targetPath)
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 })
      if (fs.existsSync(destination)) {
        const error = new Error('Tree move destination already exists.')
        error.code = 'TREE_MOVE_TARGET_EXISTS'
        throw error
      }
      fs.renameSync(source, destination)
    }
    write.published = true
  }
}

export async function executeTransaction(options = {}) {
  const operationId = options.operationId
  const transactionId = options.transactionId ?? (safeIdentifier(operationId) ? `tx-${operationId}` : null)
  const expectedRevision = options.expectedRevision

  if (!safeIdentifier(operationId) || !safeIdentifier(transactionId)) {
    return failure(
      safeIdentifier(operationId) ? operationId : null,
      safeIdentifier(transactionId) ? transactionId : null,
      'INVALID_TRANSACTION_IDENTIFIER',
      'Safe operationId and transactionId values are required.',
    )
  }
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    return failure(operationId, transactionId, 'INVALID_EXPECTED_REVISION', 'A non-negative expectedRevision is required.')
  }
  if (options.faultAfterStep !== null && options.faultAfterStep !== undefined && !FAULT_STEPS.has(options.faultAfterStep)) {
    return failure(operationId, transactionId, 'INVALID_FAULT_STEP', 'The requested test fault step is invalid.')
  }

  let sanitizedWrites
  try {
    sanitizedWrites = applyRevisionWrites(options.target, sanitizeRequestedWrites(options, transactionId, expectedRevision), expectedRevision, options.allowedFieldsByRecordType)
  } catch (error) {
    if (error?.code === 'SUSPECTED_SECRET') {
      return failure(operationId, transactionId, 'SUSPECTED_SECRET', 'The transaction contains suspected secret material.', {
        status: 'blocked',
      })
    }
    return failure(operationId, transactionId, error?.code ?? 'INVALID_TRANSACTION_WRITE', 'The requested transaction writes are invalid.', {
      status: error?.code === 'UNSUPPORTED_WRITE_KIND' ? 'blocked' : 'repair',
    })
  }

  let replay
  try {
    replay = findCommittedReplay(options.target, operationId, sanitizedWrites
      .filter((write) => write.kind === 'jsonl-append')
      .flatMap((write) => write.eventIds))
      ?? existingCommittedResult(options.target, operationId, transactionId)
  } catch {
    return failure(operationId, transactionId, 'INVALID_TARGET', 'The project target is unavailable or unsafe.')
  }
  if (replay !== null) return replay

  const manifestPath = manifestRelativePath(transactionId)
  try {
    if (readAtomicJson(options.target, manifestPath, { allowMissing: true }) !== null) {
      return failure(operationId, transactionId, 'TRANSACTION_PENDING', 'An uncommitted transaction with this transactionId already exists.', {
        status: 'blocked',
        safeToRetry: true,
      })
    }
  } catch {
    return failure(operationId, transactionId, 'INVALID_TARGET', 'The project target is unavailable or unsafe.')
  }

  const lock = acquireProjectLock(options.target, { operationId })
  if (lock.status !== 'proceed') return lock

  let manifest = null
  let preparedWrites = []
  let markerWritten = false
  let injectedFault = false
  try {
    maybeFault(options.faultAfterStep, 'after-lock')

    const state = readAtomicJson(options.target, '.gse/state.json')
    const actualRevision = state?.stateRevision
    const migrationBootstrap = options.migrationBootstrap
    const bootstrapRequested = migrationBootstrap !== null
      && typeof migrationBootstrap === 'object'
      && !Array.isArray(migrationBootstrap)
    const bootstrapDigest = bootstrapRequested ? migrationBootstrap.stateDigest : null
    const bootstrapAllowed = bootstrapRequested
      && expectedRevision === 0
      && typeof bootstrapDigest === 'string'
      && digestFile(resolveInside(options.target, '.gse/state.json')) === bootstrapDigest
      && (!Object.hasOwn(state, 'stateRevision') || state.stateRevision === undefined)
    if ((!Number.isInteger(actualRevision) || actualRevision < 0) && !bootstrapAllowed) {
      releaseProjectLock(lock)
      return failure(operationId, transactionId, 'INVALID_PROJECT_STATE', 'Project state does not contain a valid stateRevision.')
    }
    if (!bootstrapAllowed && actualRevision !== expectedRevision) {
      releaseProjectLock(lock)
      return failure(operationId, transactionId, 'STATE_REVISION_MISMATCH', 'Project state changed after this transaction was prepared.', {
        stateRevision: actualRevision,
        safeToRetry: true,
      })
    }
    if (typeof options.validatePreconditions === 'function') {
      const validation = await Promise.resolve(options.validatePreconditions({ target: options.target, state, expectedRevision }))
      if (validation !== null && validation !== undefined && validation !== true) {
        releaseProjectLock(lock)
        return failure(
          operationId,
          transactionId,
          validation.reasonCode ?? 'TRANSACTION_PRECONDITION_FAILED',
          validation.message ?? 'Transaction preconditions changed before publication.',
          { status: 'blocked', stateRevision: actualRevision, safeToRetry: true },
        )
      }
    }

    preparedWrites = sanitizedWrites.map((write) => prepareWrite(options.target, transactionId, expectedRevision, write))
    manifest = {
      schemaVersion: 1,
      transactionId,
      operationId,
      createdAt: new Date().toISOString(),
      expectedRevision,
      nextRevision: expectedRevision + 1,
      status: 'prepared',
      writes: preparedWrites.map((write) => write.manifestWrite),
      eventIds: preparedWrites
        .filter((write) => write.kind === 'jsonl-append')
        .flatMap((write) => write.eventIds),
    }
    assertTransactionManifestContract(manifest)
    writeAtomicJson(options.target, manifestPath, manifest)
    maybeFault(options.faultAfterStep, 'after-manifest')

    persistBeforeImages(options.target, preparedWrites)
    const intentPath = stageIntent(
      options.target,
      transactionId,
      operationId,
      expectedRevision,
      preparedWrites.map((write) => write.path),
    )
    maybeFault(options.faultAfterStep, 'after-intent')

    stageWrites(options.target, preparedWrites)
    manifest = updateManifest(options.target, manifestPath, manifest, 'staged')
    maybeFault(options.faultAfterStep, 'after-stage')

    publishWrites(options.target, preparedWrites)
    manifest = updateManifest(options.target, manifestPath, manifest, 'published')
    maybeFault(options.faultAfterStep, 'after-publish')

    const markerPath = commitRelativePath(transactionId)
    const marker = {
      schemaVersion: 1,
      transactionId,
      operationId,
      committedAt: new Date().toISOString(),
      stateRevision: expectedRevision + 1,
      status: 'committed',
      eventIds: manifest.eventIds,
    }
    writeAtomicJson(options.target, markerPath, marker)
    markerWritten = true

    const committedResult = result({
      operationId,
      transactionId,
      status: 'complete',
      reasonCode: 'TRANSACTION_COMMITTED',
      message: 'The transaction committed successfully.',
      stateRevision: expectedRevision + 1,
      artifactRefs: [manifestPath, markerPath, intentPath],
      safeToRetry: true,
    })
    if (options.faultAfterStep === 'after-commit-marker') {
      releaseProjectLock(lock)
      return committedResult
    }

    manifest = updateManifest(options.target, manifestPath, manifest, 'committed')
    releaseProjectLock(lock)
    return committedResult
  } catch (error) {
    injectedFault = error?.code === 'TEST_FAULT_INJECTED'
    if (!injectedFault && !markerWritten) {
      try { rollbackPublished(options.target, preparedWrites) } catch {}
      if (manifest !== null) {
        try { updateManifest(options.target, manifestPath, manifest, 'rolled-back') } catch {}
      }
      releaseProjectLock(lock)
      return failure(operationId, transactionId, error?.code ?? 'TRANSACTION_FAILED', 'The transaction failed before its commit marker.', {
        safeToRetry: true,
      })
    }
    if (!injectedFault) releaseProjectLock(lock)
    throw error
  }
}
