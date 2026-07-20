import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { assertTransactionManifestContract } from '../contracts.mjs'
import { sanitizeStructuredRecord } from '../redaction.mjs'
import { writeAtomicJson } from './atomic-json.mjs'
import { appendJsonl, readCommittedJsonl } from './jsonl.mjs'
import { acquireProjectLock, releaseProjectLock } from './lock.mjs'
import { digestBytes, digestFile, resolveInside, toPosix } from './paths.mjs'

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const TERMINAL_STATUSES = new Set(['committed', 'rolled-back', 'recovered'])
const SUPPORTED_KINDS = new Set(['json-replace', 'jsonl-append', 'text-write', 'tree-move'])
const TRANSACTIONS_PATH = '.gse/transactions'

function diagnostic(code, options = {}) {
  return {
    code,
    artifact: typeof options.artifact === 'string' ? options.artifact : null,
    field: typeof options.field === 'string' ? options.field : null,
    errorCode: typeof options.errorCode === 'string' ? options.errorCode : null,
    message: typeof options.message === 'string' ? options.message : 'Transaction recovery requires repair.',
  }
}

function inspectionResult(transactions, diagnostics) {
  const blocked = transactions.some((item) => item.status === 'blocked') || diagnostics.length > 0
  return {
    schemaVersion: 1,
    status: blocked ? 'repair' : 'complete',
    reasonCode: blocked
      ? 'TRANSACTION_INSPECTION_BLOCKED'
      : transactions.length > 0
        ? 'PENDING_TRANSACTIONS_FOUND'
        : 'NO_PENDING_TRANSACTIONS',
    message: blocked
      ? 'One or more transaction artifacts require repair before they can be recovered.'
      : transactions.length > 0
        ? 'Pending transactions were found.'
        : 'No pending transactions were found.',
    transactions,
    pending: transactions,
    diagnostics,
    safeToRetry: !blocked,
  }
}

function recoveryResult(transactions, diagnostics) {
  const blocked = transactions.some((item) => item.status === 'blocked') || diagnostics.length > 0
  return {
    schemaVersion: 1,
    status: blocked ? 'blocked' : 'complete',
    reasonCode: blocked ? 'RECOVERY_AUTHORITY_REQUIRED' : 'TRANSACTION_RECOVERY_COMPLETE',
    message: blocked
      ? 'One or more transactions require recovery authority before any canonical state may be changed.'
      : 'Pending transaction recovery completed.',
    transactions,
    recoveries: transactions,
    diagnostics,
    safeToRetry: !blocked,
  }
}

function targetRoot(target) {
  if (typeof target !== 'string' || target.length === 0) {
    const error = new Error('A project target directory is required.')
    error.code = 'INVALID_TARGET'
    throw error
  }
  const root = path.resolve(target)
  const stats = fs.lstatSync(root)
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    const error = new Error('The project target must be a real directory, not a symlink.')
    error.code = 'INVALID_TARGET'
    throw error
  }
  return root
}

function checkedPath(root, relativePath, options = {}) {
  const normalized = toPosix(relativePath)
  const filePath = resolveInside(root, normalized)
  const relation = path.relative(root, filePath)
  const segments = relation === '' ? [] : relation.split(path.sep)
  let current = root

  for (let index = 0; index < segments.length - 1; index += 1) {
    current = path.join(current, segments[index])
    try {
      const stats = fs.lstatSync(current)
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        const error = new Error('A transaction path contains a symlink or non-directory component.')
        error.code = 'UNSAFE_TRANSACTION_PATH'
        throw error
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      if (options.allowMissing === true && options.createParents !== true) {
        return { filePath, relativePath: normalized, stats: null }
      }
      if (options.createParents !== true) throw error
      fs.mkdirSync(current, { mode: 0o700 })
    }
  }

  let stats = null
  try {
    stats = fs.lstatSync(filePath)
  } catch (error) {
    if (error?.code !== 'ENOENT' || options.allowMissing !== true) throw error
  }
  if (stats?.isSymbolicLink()) {
    const error = new Error('A transaction path must not be a symlink.')
    error.code = 'UNSAFE_TRANSACTION_PATH'
    throw error
  }
  if (options.type === 'file' && stats !== null && !stats.isFile()) {
    const error = new Error('A transaction artifact must be a regular file.')
    error.code = 'UNSAFE_TRANSACTION_PATH'
    throw error
  }
  if (options.type === 'directory' && stats !== null && !stats.isDirectory()) {
    const error = new Error('A transaction artifact must be a directory.')
    error.code = 'UNSAFE_TRANSACTION_PATH'
    throw error
  }
  return { filePath, relativePath: normalized, stats }
}

function transactionRelativePath(transactionId, name = '') {
  return `${TRANSACTIONS_PATH}/${transactionId}${name ? `/${name}` : ''}`
}

function beforeImagePath(transactionId, index) {
  return transactionRelativePath(transactionId, `before/${String(index).padStart(4, '0')}.bin`)
}

function readRegularBytes(root, relativePath, options = {}) {
  const resolved = checkedPath(root, relativePath, { allowMissing: options.allowMissing === true, type: 'file' })
  if (resolved.stats === null) return null
  return fs.readFileSync(resolved.filePath)
}

function readJsonArtifact(root, relativePath, options = {}) {
  const bytes = readRegularBytes(root, relativePath, options)
  if (bytes === null) return null
  return JSON.parse(bytes.toString('utf8').replace(/^﻿/, ''))
}

function removeTreeSafe(target, relativePath) {
  const checked = checkedPath(target, relativePath, { allowMissing: true })
  if (checked.stats === null) return
  if (checked.stats.isSymbolicLink()) throw Object.assign(new Error('Tree paths must not be symlinks.'), { code: 'UNSAFE_TRANSACTION_PATH' })
  fs.rmSync(checked.filePath, { recursive: checked.stats.isDirectory(), force: true })
}

function digestTree(rootPath) {
  try {
    const stat = fs.lstatSync(rootPath)
    if (stat.isSymbolicLink()) throw Object.assign(new Error('Tree paths must not be symlinks.'), { code: 'UNSAFE_TRANSACTION_PATH' })
    if (stat.isFile()) return digestBytes(fs.readFileSync(rootPath))
    if (!stat.isDirectory()) return null
    const chunks = []
    for (const entry of fs.readdirSync(rootPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) throw Object.assign(new Error('Tree paths must not contain symlinks.'), { code: 'UNSAFE_TRANSACTION_PATH' })
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
  if (stat.isSymbolicLink()) throw Object.assign(new Error('Tree paths must not be symlinks.'), { code: 'UNSAFE_TRANSACTION_PATH' })
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true, mode: 0o700 })
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) copyTreeSafe(path.join(source, entry.name), path.join(destination, entry.name))
  } else if (stat.isFile()) {
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 })
    fs.copyFileSync(source, destination)
  } else throw Object.assign(new Error('Tree paths must be regular files or directories.'), { code: 'UNSAFE_TRANSACTION_PATH' })
}

function safeErrorDiagnostic(code, error, artifact = null) {
  return diagnostic(code, {
    artifact,
    errorCode: error?.code,
    message: code === 'INVALID_TARGET'
      ? 'The project target is unavailable or unsafe.'
      : 'The transaction artifact is malformed, truncated, missing, or unsafe.',
  })
}

function validateManifest(root, transactionId) {
  const manifestRelativePath = transactionRelativePath(transactionId, 'manifest.json')
  let manifest
  try {
    manifest = readJsonArtifact(root, manifestRelativePath)
    assertTransactionManifestContract(manifest)
  } catch (error) {
    const diagnostics = Array.isArray(error?.diagnostics)
      ? error.diagnostics.map((item) => diagnostic(item.code ?? 'INVALID_TRANSACTION_MANIFEST', {
        artifact: manifestRelativePath,
        field: item.field ?? null,
        errorCode: error?.code,
        message: 'The transaction manifest does not satisfy the Core v1 contract.',
      }))
      : [safeErrorDiagnostic('INVALID_TRANSACTION_MANIFEST', error, manifestRelativePath)]
    return { manifest: null, diagnostics }
  }

  const diagnostics = []
  if (!IDENTIFIER_PATTERN.test(transactionId) || manifest.transactionId !== transactionId) {
    diagnostics.push(diagnostic('TRANSACTION_ID_MISMATCH', {
      artifact: manifestRelativePath,
      field: 'transactionId',
      message: 'The transaction directory and manifest identifiers do not match safely.',
    }))
  }
  if (!IDENTIFIER_PATTERN.test(manifest.operationId)) {
    diagnostics.push(diagnostic('INVALID_OPERATION_ID', {
      artifact: manifestRelativePath,
      field: 'operationId',
      message: 'The transaction manifest operationId is unsafe.',
    }))
  }

  const seenPaths = new Set()
  for (const [index, write] of manifest.writes.entries()) {
    if (!SUPPORTED_KINDS.has(write.kind)) {
      diagnostics.push(diagnostic('UNSUPPORTED_RECOVERY_WRITE_KIND', {
        artifact: manifestRelativePath,
        field: `writes[${index}].kind`,
        message: 'Recovery supports only transaction-local JSON replacements and JSONL appends.',
      }))
    }
    if (seenPaths.has(write.path)) {
      diagnostics.push(diagnostic('DUPLICATE_RECOVERY_PATH', {
        artifact: manifestRelativePath,
        field: `writes[${index}].path`,
        message: 'A transaction manifest cannot recover the same destination more than once.',
      }))
    }
    seenPaths.add(write.path)

    const stagedPrefix = `${transactionRelativePath(transactionId, 'staged')}/`
    if (!write.stagedPath.startsWith(stagedPrefix)) {
      diagnostics.push(diagnostic('STAGED_PATH_OUTSIDE_TRANSACTION', {
        artifact: manifestRelativePath,
        field: `writes[${index}].stagedPath`,
        message: 'A staged write must remain inside its transaction directory.',
      }))
    }
    try {
      if (write.kind === 'tree-move') {
        checkedPath(root, write.sourcePath, { allowMissing: true })
        checkedPath(root, write.targetPath, { allowMissing: true })
      } else {
        checkedPath(root, write.path, { allowMissing: true, type: 'file' })
      }
      checkedPath(root, write.stagedPath, { allowMissing: true, type: write.kind === 'tree-move' ? 'directory' : 'file' })
      if (write.kind !== 'tree-move') checkedPath(root, write.beforeImagePath ?? beforeImagePath(transactionId, index), { allowMissing: true, type: 'file' })
    } catch (error) {
      diagnostics.push(safeErrorDiagnostic('UNSAFE_TRANSACTION_PATH', error, write.path))
    }
  }

  return { manifest: diagnostics.length === 0 ? manifest : null, diagnostics }
}

function commitMarkerState(root, transactionId, manifest) {
  const markerRelativePath = transactionRelativePath(transactionId, 'commit.json')
  let marker
  try {
    marker = readJsonArtifact(root, markerRelativePath, { allowMissing: true })
  } catch (error) {
    return {
      present: true,
      valid: false,
      marker: null,
      diagnostics: [safeErrorDiagnostic('INVALID_COMMIT_MARKER', error, markerRelativePath)],
    }
  }
  if (marker === null) return { present: false, valid: false, marker: null, diagnostics: [] }

  const valid = marker
    && typeof marker === 'object'
    && !Array.isArray(marker)
    && marker.schemaVersion === 1
    && marker.transactionId === transactionId
    && marker.operationId === manifest.operationId
    && marker.status === 'committed'
    && marker.stateRevision === manifest.nextRevision
    && Array.isArray(marker.eventIds)
    && marker.eventIds.length === manifest.eventIds.length
    && marker.eventIds.every((eventId) => manifest.eventIds.includes(eventId))
    && typeof marker.committedAt === 'string'
    && Number.isFinite(Date.parse(marker.committedAt))

  return valid
    ? { present: true, valid: true, marker, diagnostics: [] }
    : {
        present: true,
        valid: false,
        marker: null,
        diagnostics: [diagnostic('INVALID_COMMIT_MARKER', {
          artifact: markerRelativePath,
          message: 'The commit marker exists but is not a valid committed marker for this manifest.',
        })],
      }
}

function inspectTransaction(root, transactionId) {
  const artifactRefs = [transactionRelativePath(transactionId, 'manifest.json')]
  const validated = validateManifest(root, transactionId)
  if (validated.manifest === null) {
    return {
      schemaVersion: 1,
      transactionId,
      id: transactionId,
      status: 'blocked',
      reasonCode: 'INVALID_TRANSACTION_ARTIFACTS',
      message: 'The transaction cannot be used as recovery evidence until its artifacts are repaired.',
      manifestStatus: null,
      commitMarker: null,
      recovery: null,
      artifactRefs,
      diagnostics: validated.diagnostics,
      safeToRetry: false,
    }
  }

  const manifest = validated.manifest
  if (TERMINAL_STATUSES.has(manifest.status)) return null
  const markerState = commitMarkerState(root, transactionId, manifest)
  if (markerState.present) artifactRefs.push(transactionRelativePath(transactionId, 'commit.json'))
  if (markerState.present && !markerState.valid) {
    return {
      schemaVersion: 1,
      transactionId,
      id: transactionId,
      operationId: manifest.operationId,
      status: 'blocked',
      reasonCode: 'INVALID_COMMIT_MARKER',
      message: 'The transaction has an invalid commit marker and cannot be rolled forward or rolled back automatically.',
      manifestStatus: manifest.status,
      commitMarker: 'invalid',
      recovery: null,
      artifactRefs,
      diagnostics: markerState.diagnostics,
      safeToRetry: false,
    }
  }

  return {
    schemaVersion: 1,
    transactionId,
    id: transactionId,
    operationId: manifest.operationId,
    status: 'pending',
    reasonCode: markerState.valid ? 'ROLL_FORWARD_REQUIRED' : 'ROLLBACK_REQUIRED',
    message: markerState.valid
      ? 'A valid commit marker requires the transaction to roll forward.'
      : 'The absence of a commit marker requires the transaction to roll back.',
    manifestStatus: manifest.status,
    commitMarker: markerState.valid ? 'committed' : 'absent',
    recovery: markerState.valid ? 'roll-forward' : 'roll-back',
    artifactRefs,
    diagnostics: [],
    safeToRetry: true,
    manifest,
  }
}

function transactionDirectories(root) {
  let directory
  try {
    directory = checkedPath(root, TRANSACTIONS_PATH, { allowMissing: true, type: 'directory' })
  } catch (error) {
    return { entries: [], diagnostics: [safeErrorDiagnostic('UNSAFE_TRANSACTIONS_DIRECTORY', error, TRANSACTIONS_PATH)] }
  }
  if (directory.stats === null) return { entries: [], diagnostics: [] }

  try {
    const entries = fs.readdirSync(directory.filePath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
    const transactions = []
    const diagnostics = []
    for (const entry of entries) {
      const relativePath = transactionRelativePath(entry.name)
      if (entry.isSymbolicLink()) {
        diagnostics.push(diagnostic('UNSAFE_TRANSACTION_DIRECTORY', {
          artifact: relativePath,
          message: 'A transaction directory must not be a symlink.',
        }))
      } else if (entry.isDirectory()) {
        transactions.push(entry.name)
      } else {
        diagnostics.push(diagnostic('INVALID_TRANSACTION_DIRECTORY_ENTRY', {
          artifact: relativePath,
          message: 'Transaction storage may contain only real transaction directories.',
        }))
      }
    }
    return { entries: transactions, diagnostics }
  } catch (error) {
    return { entries: [], diagnostics: [safeErrorDiagnostic('TRANSACTION_DIRECTORY_UNREADABLE', error, TRANSACTIONS_PATH)] }
  }
}

export function inspectPendingTransactions(target) {
  let root
  try {
    root = targetRoot(target)
  } catch (error) {
    return inspectionResult([], [safeErrorDiagnostic('INVALID_TARGET', error)])
  }

  const directories = transactionDirectories(root)
  const transactions = []
  for (const transactionId of directories.entries) {
    try {
      const transaction = inspectTransaction(root, transactionId)
      if (transaction !== null) transactions.push(transaction)
    } catch (error) {
      transactions.push({
        schemaVersion: 1,
        transactionId,
        id: transactionId,
        status: 'blocked',
        reasonCode: 'TRANSACTION_INSPECTION_FAILED',
        message: 'The transaction could not be inspected safely.',
        manifestStatus: null,
        commitMarker: null,
        recovery: null,
        artifactRefs: [transactionRelativePath(transactionId)],
        diagnostics: [safeErrorDiagnostic('TRANSACTION_INSPECTION_FAILED', error, transactionRelativePath(transactionId))],
        safeToRetry: false,
      })
    }
  }
  return inspectionResult(transactions, directories.diagnostics)
}

function parseStagedJsonl(bytes, transactionId, eventIds, artifact) {
  if (bytes.length === 0) return []
  if (bytes[bytes.length - 1] !== 0x0a) {
    throw Object.assign(new Error('The staged JSONL artifact must contain complete lines.'), { code: 'INVALID_STAGED_JSONL' })
  }
  const records = []
  for (const line of bytes.toString('utf8').split('\n').slice(0, -1)) {
    if (line.length === 0) throw Object.assign(new Error('The staged JSONL artifact contains an empty line.'), { code: 'INVALID_STAGED_JSONL' })
    const record = JSON.parse(line)
    if (!record || typeof record !== 'object' || Array.isArray(record) || !eventIds.includes(record.eventId) || record.transactionId !== transactionId) {
      throw Object.assign(new Error(`A staged JSONL record does not match ${artifact}.`), { code: 'INVALID_STAGED_JSONL' })
    }
    records.push(record)
  }
  if (new Set(records.map((record) => record.eventId)).size !== records.length) {
    throw Object.assign(new Error('The staged JSONL artifact contains duplicate event IDs.'), { code: 'INVALID_STAGED_JSONL' })
  }
  return records
}

function readBeforeBytes(root, transactionId, index, beforeDigest, required) {
  if (beforeDigest === null) return Buffer.alloc(0)
  const relativePath = beforeImagePath(transactionId, index)
  let bytes
  try {
    bytes = readRegularBytes(root, relativePath, { allowMissing: !required })
  } catch (error) {
    throw Object.assign(error, { artifact: relativePath })
  }
  if (bytes === null) return null
  if (digestBytes(bytes) !== beforeDigest) {
    const error = new Error('A transaction before image does not match its manifest digest.')
    error.code = 'BEFORE_IMAGE_DIGEST_MISMATCH'
    error.artifact = relativePath
    throw error
  }
  return bytes
}

function rollForwardPlan(root, transactionId, manifest) {
  return manifest.writes.map((write, index) => {
    if (write.kind === 'tree-move') {
      const source = checkedPath(root, write.sourcePath, { allowMissing: true })
      const target = checkedPath(root, write.targetPath, { allowMissing: true })
      const staged = checkedPath(root, write.stagedPath, { allowMissing: false, type: 'directory' })
      const currentDigest = digestTree(target.filePath)
      if (currentDigest !== null && currentDigest !== write.beforeDigest && currentDigest !== write.afterDigest) {
        throw Object.assign(new Error('Tree destination is neither before nor after state.'), { code: 'RECOVERY_AUTHORITY_REQUIRED', artifact: write.targetPath })
      }
      if (digestTree(source.filePath) !== null && digestTree(source.filePath) !== write.beforeDigest) {
        throw Object.assign(new Error('Tree source is neither before nor absent state.'), { code: 'RECOVERY_AUTHORITY_REQUIRED', artifact: write.sourcePath })
      }
      return { write, tree: true }
    }
    const canonicalPath = checkedPath(root, write.path, { allowMissing: true, type: 'file' }).filePath
    const currentDigest = digestFile(canonicalPath)
    if (currentDigest !== null && currentDigest !== write.beforeDigest && currentDigest !== write.afterDigest) {
      const error = new Error('The canonical destination is neither the manifest before state nor after state.')
      error.code = 'RECOVERY_AUTHORITY_REQUIRED'
      error.artifact = write.path
      throw error
    }
    const stagedBytes = readRegularBytes(root, write.stagedPath)
    if (write.kind === 'text-write') {
      if (digestBytes(stagedBytes) !== write.afterDigest) throw Object.assign(new Error('A staged text write does not match its manifest digest.'), { code: 'STAGED_DIGEST_MISMATCH', artifact: write.stagedPath })
      return { write, bytes: stagedBytes }
    }
    if (write.kind === 'json-replace') {
      JSON.parse(stagedBytes.toString('utf8').replace(/^﻿/, ''))
      if (digestBytes(stagedBytes) !== write.afterDigest) {
        const error = new Error('A staged JSON replacement does not match its manifest digest.')
        error.code = 'STAGED_DIGEST_MISMATCH'
        error.artifact = write.stagedPath
        throw error
      }
      return { write, bytes: stagedBytes }
    }

    const eventIds = Array.isArray(write.eventIds) ? write.eventIds : [write.eventId]
    parseStagedJsonl(stagedBytes, transactionId, eventIds, write.stagedPath)
    const beforeBytes = readBeforeBytes(root, transactionId, index, write.beforeDigest, true)
    if (beforeBytes.length !== write.beforeSize) {
      const error = new Error('A JSONL before image does not match the manifest size.')
      error.code = 'BEFORE_IMAGE_SIZE_MISMATCH'
      error.artifact = beforeImagePath(transactionId, index)
      throw error
    }
    const afterBytes = write.afterDigest === write.beforeDigest
      ? beforeBytes
      : Buffer.concat([beforeBytes, stagedBytes])
    if (digestBytes(afterBytes) !== write.afterDigest) {
      const error = new Error('The staged JSONL append cannot reconstruct the manifest after state.')
      error.code = 'AFTER_STATE_DIGEST_MISMATCH'
      error.artifact = write.stagedPath
      throw error
    }
    return { write, bytes: afterBytes }
  })
}

function rollbackPlan(root, transactionId, manifest) {
  return manifest.writes.map((write, index) => {
    if (write.kind === 'tree-move') {
      const sourceDigest = digestTree(checkedPath(root, write.sourcePath, { allowMissing: true }).filePath)
      const targetDigest = digestTree(checkedPath(root, write.targetPath, { allowMissing: true }).filePath)
      const before = checkedPath(root, beforeImagePath(transactionId, index), { allowMissing: false })
      const beforeDigest = digestTree(before.filePath)
      const beforeState = sourceDigest === write.beforeDigest && targetDigest === null
      const afterState = sourceDigest === null && targetDigest === write.afterDigest
      if ((!beforeState && !afterState) || beforeDigest !== write.beforeDigest) throw Object.assign(new Error('Tree move canonical state is neither before nor after state.'), { code: 'RECOVERY_AUTHORITY_REQUIRED', artifact: write.sourcePath })
      return { write, tree: true, source: before.filePath }
    }
    const currentDigest = digestFile(checkedPath(root, write.path, { allowMissing: true, type: 'file' }).filePath)
    if (currentDigest !== null && currentDigest !== write.beforeDigest && currentDigest !== write.afterDigest) {
      const error = new Error('The canonical destination is neither the manifest before state nor after state.')
      error.code = 'RECOVERY_AUTHORITY_REQUIRED'
      error.artifact = write.path
      throw error
    }
    if (write.beforeDigest === null) return { write, remove: currentDigest === write.afterDigest, bytes: null }
    if (currentDigest === write.beforeDigest) return { write, remove: false, bytes: null }
    return {
      write,
      remove: false,
      bytes: readBeforeBytes(root, transactionId, index, write.beforeDigest, true),
    }
  })
}

function syncDirectory(directoryPath) {
  let descriptor
  try {
    descriptor = fs.openSync(directoryPath, 'r')
    fs.fsyncSync(descriptor)
  } catch (error) {
    if (!['EACCES', 'EBADF', 'EINVAL', 'EISDIR', 'ENOTSUP', 'EPERM'].includes(error?.code)) throw error
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor) } catch {}
    }
  }
}

function writeDurableBytes(root, relativePath, bytes) {
  const destination = checkedPath(root, relativePath, { allowMissing: true, createParents: true, type: 'file' })
  const temporaryPath = path.join(path.dirname(destination.filePath), `.${path.basename(destination.filePath)}.recovery-${process.pid}-${crypto.randomUUID()}`)
  let descriptor
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600)
    fs.writeFileSync(descriptor, bytes)
    fs.fsyncSync(descriptor)
    fs.closeSync(descriptor)
    descriptor = undefined
    fs.renameSync(temporaryPath, destination.filePath)
    syncDirectory(path.dirname(destination.filePath))
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor) } catch {}
    }
    try { fs.rmSync(temporaryPath, { force: true }) } catch {}
  }
}

function removeDestination(root, relativePath) {
  const destination = checkedPath(root, relativePath, { allowMissing: true, type: 'file' })
  if (destination.stats === null) return
  fs.unlinkSync(destination.filePath)
  syncDirectory(path.dirname(destination.filePath))
}

function applyPlan(root, plan, rollForward = false) {
  for (const item of plan) {
    if (item.tree) {
      const source = checkedPath(root, item.write.sourcePath, { allowMissing: true })
      const target = checkedPath(root, item.write.targetPath, { allowMissing: true })
      if (rollForward) {
        if (target.stats !== null) fs.rmSync(target.filePath, { recursive: true, force: true })
        fs.mkdirSync(path.dirname(target.filePath), { recursive: true, mode: 0o700 })
        fs.renameSync(checkedPath(root, item.write.stagedPath, { allowMissing: false }).filePath, target.filePath)
      } else {
        if (source.stats !== null) fs.rmSync(source.filePath, { recursive: true, force: true })
        if (target.stats !== null) fs.rmSync(target.filePath, { recursive: true, force: true })
        fs.mkdirSync(path.dirname(source.filePath), { recursive: true, mode: 0o700 })
        copyTreeSafe(item.source, source.filePath)
      }
      continue
    }
    if (item.remove) removeDestination(root, item.write.path)
    else if (item.bytes !== null) writeDurableBytes(root, item.write.path, item.bytes)
  }
}

function verifyPlan(root, plan, expectedField, rollForward = false) {
  for (const item of plan) {
    if (item.tree) {
      const actual = digestTree(checkedPath(root, rollForward ? item.write.targetPath : item.write.sourcePath, { allowMissing: true }).filePath)
      if (actual !== item.write[expectedField]) throw Object.assign(new Error('A recovered tree does not match its manifest digest.'), { code: 'RECOVERY_DIGEST_MISMATCH', artifact: item.write.path })
      continue
    }
    const actual = digestFile(checkedPath(root, item.write.path, { allowMissing: true, type: 'file' }).filePath)
    if (actual !== item.write[expectedField]) {
      const error = new Error('A recovered destination does not match its manifest digest.')
      error.code = 'RECOVERY_DIGEST_MISMATCH'
      error.artifact = item.write.path
      throw error
    }
  }
}

function updateManifestStatus(root, transactionId, manifest, status) {
  const updated = { ...manifest, status }
  assertTransactionManifestContract(updated)
  writeAtomicJson(root, transactionRelativePath(transactionId, 'manifest.json'), updated)
  return updated
}

function cleanupTransactionArtifacts(root, transactionId) {
  for (const name of ['intent.jsonl', 'staged', 'before']) {
    try {
      const artifact = checkedPath(root, transactionRelativePath(transactionId, name), { allowMissing: true })
      if (artifact.stats === null) continue
      fs.rmSync(artifact.filePath, { recursive: artifact.stats.isDirectory(), force: true })
    } catch {}
  }
}

function blockedRecovery(transaction, error) {
  const artifact = typeof error?.artifact === 'string'
    ? error.artifact
    : transactionRelativePath(transaction.transactionId)
  return {
    schemaVersion: 1,
    transactionId: transaction.transactionId,
    id: transaction.transactionId,
    operationId: transaction.operationId ?? null,
    status: 'blocked',
    reasonCode: 'RECOVERY_AUTHORITY_REQUIRED',
    message: 'The transaction could not be recovered without explicit authority because its durable evidence is incomplete, invalid, or contradicted by canonical state.',
    recovered: null,
    action: null,
    artifactRefs: transaction.artifactRefs ?? [artifact],
    diagnostics: transaction.diagnostics?.length > 0
      ? transaction.diagnostics
      : [safeErrorDiagnostic(error?.code ?? 'TRANSACTION_RECOVERY_BLOCKED', error, artifact)],
    safeToRetry: false,
  }
}

function recoveryEvent(transactionId, operationId, recovered, stateRevision, timestamp) {
  return {
    schemaVersion: 1,
    eventId: `recovery-${transactionId}-${recovered}`,
    transactionId,
    date: timestamp.slice(0, 10),
    timestamp,
    recordType: 'transaction-recovery',
    changeId: null,
    taskId: null,
    status: 'result',
    evidenceLevel: 'behavioral',
    requiredEvidenceLevel: 'behavioral',
    claim: `Transaction ${transactionId} was recovered as ${recovered}.`,
    evidenceClass: 'recovery',
    method: 'durable transaction recovery',
    stateRevision,
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
    outcome: recovered,
    limitations: [],
    actor: 'gse-core-recovery',
    evidenceFile: '.gse/evidence/index.jsonl',
    relatedArtifacts: [`.gse/transactions/${transactionId}/manifest.json`],
    nextAction: null,
  }
}

function appendRecoveryEvent(root, transactionId, operationId, recovered, stateRevision, now) {
  const event = sanitizeStructuredRecord(recoveryEvent(transactionId, operationId, recovered, stateRevision, new Date(now()).toISOString()), [
    'schemaVersion', 'eventId', 'transactionId', 'date', 'timestamp', 'recordType', 'changeId', 'taskId',
    'status', 'evidenceLevel', 'requiredEvidenceLevel', 'claim', 'evidenceClass', 'method', 'stateRevision',
    'dependencies', 'invalidationScope', 'outcome', 'limitations', 'actor', 'evidenceFile', 'relatedArtifacts', 'nextAction',
  ])
  const index = readCommittedJsonl(root, '.gse/evidence/index.jsonl', { allowMissing: true })
  if (index.records.some((record) => record?.eventId === event.eventId)) return event
  appendJsonl(root, '.gse/evidence/index.jsonl', event)
  return event
}

function recoverTransaction(root, transaction, now) {
  if (transaction.status === 'blocked' || !transaction.manifest) return blockedRecovery(transaction, null)
  const manifest = transaction.manifest
  const rollForward = transaction.recovery === 'roll-forward'
  const plan = rollForward
    ? rollForwardPlan(root, transaction.transactionId, manifest)
    : rollbackPlan(root, transaction.transactionId, manifest)

  applyPlan(root, plan, rollForward)
  verifyPlan(root, plan, rollForward ? 'afterDigest' : 'beforeDigest', rollForward)
  updateManifestStatus(root, transaction.transactionId, manifest, rollForward ? 'recovered' : 'rolled-back')
  cleanupTransactionArtifacts(root, transaction.transactionId)

  const recovered = rollForward ? 'rolled-forward' : 'rolled-back'
  const stateRevision = rollForward ? manifest.nextRevision : manifest.expectedRevision
  const event = appendRecoveryEvent(root, transaction.transactionId, manifest.operationId, recovered, stateRevision, now)
  return {
    schemaVersion: 1,
    transactionId: transaction.transactionId,
    id: transaction.transactionId,
    operationId: manifest.operationId,
    status: 'complete',
    reasonCode: rollForward ? 'TRANSACTION_ROLLED_FORWARD' : 'TRANSACTION_ROLLED_BACK',
    message: rollForward
      ? 'The committed transaction was restored to its complete after state.'
      : 'The uncommitted transaction was restored to its before state.',
    recovered,
    action: recovered,
    stateRevision,
    eventId: event.eventId,
    artifactRefs: transaction.artifactRefs,
    diagnostics: [],
    safeToRetry: true,
  }
}

export function recoverTransactions(target, { now = () => Date.now() } = {}) {
  let root
  try {
    root = targetRoot(target)
  } catch (error) {
    return recoveryResult([], [safeErrorDiagnostic('INVALID_TARGET', error)])
  }
  if (typeof now !== 'function') {
    return recoveryResult([], [diagnostic('INVALID_RECOVERY_CLOCK', { message: 'Recovery now must be a function.' })])
  }

  const lock = acquireProjectLock(root, {
    operationId: 'op-core-recovery',
    now,
  })
  if (lock.status !== 'proceed') {
    return recoveryResult([{
      schemaVersion: 1,
      transactionId: null,
      id: null,
      operationId: 'op-core-recovery',
      status: 'blocked',
      reasonCode: lock.reasonCode,
      message: 'Transaction recovery requires the project-local lock.',
      recovered: null,
      action: null,
      artifactRefs: [],
      diagnostics: [diagnostic(lock.reasonCode, { message: lock.message })],
      safeToRetry: lock.safeToRetry,
    }], [])
  }

  try {
    const inspection = inspectPendingTransactions(root)
    const transactions = []
    for (const transaction of inspection.transactions) {
      try {
        transactions.push(recoverTransaction(root, transaction, now))
      } catch (error) {
        transactions.push(blockedRecovery(transaction, error))
      }
    }
    return recoveryResult(transactions, inspection.diagnostics)
  } finally {
    releaseProjectLock(lock)
  }
}
