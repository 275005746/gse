import fs from 'node:fs'
import path from 'node:path'

import { digestBytes, resolveInside, toPosix } from './paths.mjs'

function persistenceError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function targetRoot(target) {
  if (typeof target !== 'string' || target.length === 0) {
    throw persistenceError('INVALID_TARGET', 'A project target directory is required.')
  }

  const resolved = path.resolve(target)
  let stats
  try {
    stats = fs.lstatSync(resolved)
  } catch {
    throw persistenceError('INVALID_TARGET', 'The project target directory is unavailable.')
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw persistenceError('INVALID_TARGET', 'The project target must be a real directory, not a symlink.')
  }
  return resolved
}

function ensureSafeDirectory(root, directoryPath, create) {
  const relation = path.relative(root, directoryPath)
  const segments = relation === '' ? [] : relation.split(path.sep)
  let current = root

  for (const segment of segments) {
    current = path.join(current, segment)
    try {
      const stats = fs.lstatSync(current)
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw persistenceError('UNSAFE_PERSISTENCE_PATH', 'A persistence path contains a symlink or non-directory component.')
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      if (!create) throw error
      try {
        fs.mkdirSync(current, { mode: 0o700 })
      } catch (mkdirError) {
        if (mkdirError?.code !== 'EEXIST') throw mkdirError
        const stats = fs.lstatSync(current)
        if (stats.isSymbolicLink() || !stats.isDirectory()) {
          throw persistenceError('UNSAFE_PERSISTENCE_PATH', 'A persistence path contains a symlink or non-directory component.')
        }
      }
    }
  }
}

function safeProjectPath(target, relativePath, { createParent = false, allowMissing = false } = {}) {
  const root = targetRoot(target)
  const filePath = resolveInside(root, relativePath)
  ensureSafeDirectory(root, path.dirname(filePath), createParent)

  try {
    const stats = fs.lstatSync(filePath)
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw persistenceError('UNSAFE_PERSISTENCE_PATH', 'A persistence file must be a regular file, not a symlink.')
    }
  } catch (error) {
    if (error?.code !== 'ENOENT' || !allowMissing) throw error
  }

  return { filePath, relativePath: toPosix(relativePath) }
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

function encodeRecord(record) {
  const serialized = JSON.stringify(record)
  if (serialized === undefined || serialized.includes('\n') || serialized.includes('\r')) {
    throw persistenceError('INVALID_JSONL_RECORD', 'A JSONL record must serialize to one JSON line.')
  }
  return Buffer.from(`${serialized}\n`, 'utf8')
}

function diagnosticForLine(bytes, lineNumber, byteOffset, complete, reasonCode) {
  return {
    lineNumber,
    byteOffset,
    byteLength: bytes.length,
    complete,
    reasonCode,
    digest: digestBytes(bytes),
  }
}

function transactionRecordIsCommitted(target, transactionId) {
  if (typeof transactionId !== 'string' || transactionId.length === 0) return false
  let markerPath
  try {
    markerPath = resolveInside(target, `.gse/transactions/${transactionId}/commit.json`)
  } catch {
    return false
  }
  try {
    const stats = fs.lstatSync(markerPath)
    if (stats.isSymbolicLink() || !stats.isFile()) return false
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8').replace(/^﻿/, ''))
    return marker?.schemaVersion === 1
      && marker?.transactionId === transactionId
      && marker?.status === 'committed'
  } catch {
    return false
  }
}

function isVisibleCommittedRecord(target, record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return true
  if (record.recordType === 'transaction-recovery') {
    return typeof record.transactionId === 'string' && record.transactionId.length > 0
  }
  if (!Object.hasOwn(record, 'transactionId') || record.transactionId === null) return true
  return transactionRecordIsCommitted(target, record.transactionId)
}

export function readCommittedJsonl(target, relativePath, options = {}) {
  let resolved
  try {
    resolved = safeProjectPath(target, relativePath, { allowMissing: options.allowMissing ?? false })
  } catch (error) {
    if ((options.allowMissing ?? false) && error?.code === 'ENOENT') {
      return { path: toPosix(relativePath), records: [], corruptTail: [], committedBytes: 0, totalBytes: 0 }
    }
    throw error
  }

  let bytes
  try {
    bytes = fs.readFileSync(resolved.filePath)
  } catch (error) {
    if ((options.allowMissing ?? false) && (error?.code === 'ENOENT' || error?.code === 'ENOTDIR')) {
      return { path: resolved.relativePath, records: [], corruptTail: [], committedBytes: 0, totalBytes: 0 }
    }
    throw error
  }

  const records = []
  const corruptTail = []
  let offset = 0
  let lineNumber = 1
  let committedBytes = 0

  while (offset < bytes.length) {
    const newline = bytes.indexOf(0x0a, offset)
    const complete = newline !== -1
    const end = complete ? newline : bytes.length
    let lineBytes = bytes.subarray(offset, end)
    if (lineBytes.length > 0 && lineBytes[lineBytes.length - 1] === 0x0d) {
      lineBytes = lineBytes.subarray(0, lineBytes.length - 1)
    }

    if (lineBytes.length === 0) {
      corruptTail.push(diagnosticForLine(lineBytes, lineNumber, offset, complete, 'EMPTY_JSONL_LINE'))
      break
    }

    if (!complete) {
      corruptTail.push(diagnosticForLine(lineBytes, lineNumber, offset, false, 'INCOMPLETE_JSONL_TAIL'))
      break
    }

    try {
      const text = lineBytes.toString('utf8')
      const record = JSON.parse(lineNumber === 1 ? text.replace(/^﻿/, '') : text)
      if (isVisibleCommittedRecord(target, record)) records.push(record)
      committedBytes = newline + 1
    } catch {
      corruptTail.push(diagnosticForLine(
        lineBytes,
        lineNumber,
        offset,
        true,
        'MALFORMED_JSONL_LINE',
      ))
      break
    }

    offset = newline + 1
    lineNumber += 1
  }

  if (corruptTail.length > 0 && options.includeRemainingTail === true) {
    const consumed = corruptTail[0].byteOffset + corruptTail[0].byteLength
    const remainingBytes = Math.max(0, bytes.length - consumed)
    corruptTail[0].remainingBytes = remainingBytes
  }

  return {
    path: resolved.relativePath,
    records,
    corruptTail,
    committedBytes,
    totalBytes: bytes.length,
  }
}

export function stageJsonlAppend(targetOrOptions, stagedRelativePath, record, options = {}) {
  if (targetOrOptions && typeof targetOrOptions === 'object' && !Array.isArray(targetOrOptions)) {
    const { target, transactionDir, relativePath, event } = targetOrOptions
    const existing = readCommittedJsonl(target, relativePath, { allowMissing: true })
    const duplicate = existing.records.some((candidate) => candidate?.eventId === event?.eventId)
    const token = digestBytes(Buffer.from(toPosix(relativePath), 'utf8')).slice('sha256:'.length, 'sha256:'.length + 24)
    const stagedPath = `${toPosix(transactionDir)}/staged/${token}.jsonl`
    const staged = stageJsonlAppend(target, stagedPath, event, options)
    return {
      target,
      kind: 'jsonl-append',
      path: toPosix(relativePath),
      relativePath: toPosix(relativePath),
      stagedPath: staged.stagedPath,
      eventId: event?.eventId ?? null,
      beforeSize: existing.totalBytes,
      beforeDigest: existing.totalBytes === 0 ? null : digestBytes(fs.readFileSync(safeProjectPath(target, relativePath).filePath)),
      afterDigest: duplicate
        ? (existing.totalBytes === 0 ? null : digestBytes(fs.readFileSync(safeProjectPath(target, relativePath).filePath)))
        : digestBytes(Buffer.concat([fs.readFileSync(safeProjectPath(target, relativePath, { allowMissing: true }).filePath), encodeRecord(event)])),
      duplicate,
    }
  }

  const target = targetOrOptions
  const resolved = safeProjectPath(target, stagedRelativePath, {
    createParent: options.createParent ?? true,
    allowMissing: true,
  })
  const bytes = encodeRecord(record)
  let descriptor
  try {
    descriptor = fs.openSync(resolved.filePath, options.exclusive === false ? 'w' : 'wx', options.mode ?? 0o600)
    fs.writeFileSync(descriptor, bytes)
    fs.fsyncSync(descriptor)
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor) } catch {}
    }
  }
  syncDirectory(path.dirname(resolved.filePath))
  return {
    stagedPath: resolved.relativePath,
    bytes: bytes.length,
    digest: digestBytes(bytes),
  }
}

export function appendStagedJsonl(target, relativePath, stagedRelativePath, options = {}) {
  const destination = safeProjectPath(target, relativePath, {
    createParent: options.createParent ?? true,
    allowMissing: true,
  })
  const staged = safeProjectPath(target, stagedRelativePath)
  const stagedBytes = fs.readFileSync(staged.filePath)
  if (stagedBytes.length === 0 || stagedBytes[stagedBytes.length - 1] !== 0x0a) {
    throw persistenceError('INVALID_STAGED_JSONL', 'Staged JSONL append bytes must end with a newline.')
  }

  let descriptor
  try {
    descriptor = fs.openSync(destination.filePath, 'a', options.mode ?? 0o600)
    const beforeSize = fs.fstatSync(descriptor).size
    if (options.expectedBeforeSize !== undefined && beforeSize !== options.expectedBeforeSize) {
      throw persistenceError('JSONL_SIZE_MISMATCH', 'The JSONL file size changed before append publication.')
    }
    fs.writeFileSync(descriptor, stagedBytes)
    fs.fsyncSync(descriptor)
    return {
      path: destination.relativePath,
      stagedPath: staged.relativePath,
      beforeSize,
      afterSize: beforeSize + stagedBytes.length,
      bytes: stagedBytes.length,
      digest: digestBytes(stagedBytes),
    }
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor) } catch {}
    }
    syncDirectory(path.dirname(destination.filePath))
  }
}

export function appendJsonl(target, relativePath, record, options = {}) {
  const destination = safeProjectPath(target, relativePath, {
    createParent: options.createParent ?? true,
    allowMissing: true,
  })
  const bytes = encodeRecord(record)
  let descriptor
  try {
    descriptor = fs.openSync(destination.filePath, 'a', options.mode ?? 0o600)
    const beforeSize = fs.fstatSync(descriptor).size
    if (options.expectedBeforeSize !== undefined && beforeSize !== options.expectedBeforeSize) {
      throw persistenceError('JSONL_SIZE_MISMATCH', 'The JSONL file size changed before append publication.')
    }
    fs.writeFileSync(descriptor, bytes)
    fs.fsyncSync(descriptor)
    return {
      path: destination.relativePath,
      beforeSize,
      afterSize: beforeSize + bytes.length,
      bytes: bytes.length,
      digest: digestBytes(bytes),
    }
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor) } catch {}
    }
    syncDirectory(path.dirname(destination.filePath))
  }
}

export const stageJsonlRecord = stageJsonlAppend

export function publishJsonlAppend(targetOrStagedWrite, relativePath, stagedRelativePath, options = {}) {
  if (targetOrStagedWrite && typeof targetOrStagedWrite === 'object' && !Array.isArray(targetOrStagedWrite)) {
    const stagedWrite = targetOrStagedWrite
    if (stagedWrite.duplicate) {
      return {
        path: stagedWrite.relativePath ?? stagedWrite.path,
        stagedPath: stagedWrite.stagedPath,
        beforeSize: stagedWrite.beforeSize,
        afterSize: stagedWrite.beforeSize,
        bytes: 0,
        duplicate: true,
      }
    }
    return appendStagedJsonl(
      stagedWrite.target,
      stagedWrite.relativePath ?? stagedWrite.path,
      stagedWrite.stagedPath,
      { expectedBeforeSize: stagedWrite.beforeSize },
    )
  }
  return appendStagedJsonl(targetOrStagedWrite, relativePath, stagedRelativePath, options)
}

export function restoreJsonlAppend(stagedWrite) {
  if (!stagedWrite || typeof stagedWrite !== 'object') throw persistenceError('INVALID_STAGED_WRITE', 'A staged JSONL append is required.')
  const destination = safeProjectPath(stagedWrite.target, stagedWrite.relativePath ?? stagedWrite.path, {
    createParent: true,
    allowMissing: true,
  })
  if (!Number.isInteger(stagedWrite.beforeSize) || stagedWrite.beforeSize < 0) {
    throw persistenceError('INVALID_BEFORE_SIZE', 'A staged JSONL append requires a valid beforeSize.')
  }
  if (stagedWrite.beforeSize === 0 && !fs.existsSync(destination.filePath)) {
    return { path: destination.relativePath, beforeSize: 0, afterSize: 0, restored: true }
  }
  let descriptor
  try {
    descriptor = fs.openSync(destination.filePath, 'r+')
    fs.ftruncateSync(descriptor, stagedWrite.beforeSize)
    fs.fsyncSync(descriptor)
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor) } catch {}
    }
    syncDirectory(path.dirname(destination.filePath))
  }
  return {
    path: destination.relativePath,
    beforeSize: stagedWrite.beforeSize,
    afterSize: stagedWrite.beforeSize,
    restored: true,
  }
}
