import crypto from 'node:crypto'
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

  return { root, filePath, relativePath: toPosix(relativePath) }
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

function writeDurableFile(filePath, bytes, { exclusive = true, mode = 0o600 } = {}) {
  let descriptor
  try {
    descriptor = fs.openSync(filePath, exclusive ? 'wx' : 'w', mode)
    fs.writeFileSync(descriptor, bytes)
    fs.fsyncSync(descriptor)
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor) } catch {}
    }
  }
}

export function serializeJson(value, { space = 2, trailingNewline = true } = {}) {
  const serialized = JSON.stringify(value, null, space)
  if (serialized === undefined) {
    throw persistenceError('INVALID_JSON_VALUE', 'The value cannot be serialized as JSON.')
  }
  return Buffer.from(`${serialized}${trailingNewline ? '\n' : ''}`, 'utf8')
}

export function readAtomicJson(target, relativePath, { allowMissing = false } = {}) {
  let resolved
  try {
    resolved = safeProjectPath(target, relativePath, { allowMissing })
  } catch (error) {
    if (allowMissing && error?.code === 'ENOENT') return null
    throw error
  }

  let text
  try {
    text = fs.readFileSync(resolved.filePath, 'utf8').replace(/^﻿/, '')
  } catch (error) {
    if (allowMissing && (error?.code === 'ENOENT' || error?.code === 'ENOTDIR')) return null
    throw error
  }
  return JSON.parse(text)
}

export function stageAtomicJson(target, stagedRelativePath, value, options = {}) {
  const resolved = safeProjectPath(target, stagedRelativePath, {
    createParent: options.createParent ?? true,
    allowMissing: true,
  })
  const bytes = serializeJson(value, options)
  writeDurableFile(resolved.filePath, bytes, {
    exclusive: options.exclusive ?? true,
    mode: options.mode ?? 0o600,
  })
  syncDirectory(path.dirname(resolved.filePath))
  return {
    stagedPath: resolved.relativePath,
    bytes: bytes.length,
    digest: digestBytes(bytes),
  }
}

export function publishAtomicJson(target, stagedRelativePath, destinationRelativePath) {
  const staged = safeProjectPath(target, stagedRelativePath)
  const destination = safeProjectPath(target, destinationRelativePath, {
    createParent: true,
    allowMissing: true,
  })

  fs.renameSync(staged.filePath, destination.filePath)
  syncDirectory(path.dirname(destination.filePath))
  if (path.dirname(staged.filePath) !== path.dirname(destination.filePath)) {
    syncDirectory(path.dirname(staged.filePath))
  }

  const bytes = fs.readFileSync(destination.filePath)
  return {
    path: destination.relativePath,
    bytes: bytes.length,
    digest: digestBytes(bytes),
  }
}

export function writeAtomicJson(target, relativePath, value, options = {}) {
  const destination = safeProjectPath(target, relativePath, {
    createParent: options.createParent ?? true,
    allowMissing: true,
  })
  const temporaryName = `.${path.basename(destination.filePath)}.tmp-${process.pid}-${crypto.randomUUID()}`
  const temporaryPath = path.join(path.dirname(destination.filePath), temporaryName)
  const bytes = serializeJson(value, options)
  let created = false

  try {
    writeDurableFile(temporaryPath, bytes, { exclusive: true, mode: options.mode ?? 0o600 })
    created = true
    fs.renameSync(temporaryPath, destination.filePath)
    created = false
    syncDirectory(path.dirname(destination.filePath))
  } finally {
    if (created) {
      try { fs.rmSync(temporaryPath, { force: true }) } catch {}
    }
  }

  return {
    path: destination.relativePath,
    bytes: bytes.length,
    digest: digestBytes(bytes),
  }
}

function restoreDurableBytes(target, relativePath, bytes) {
  const destination = safeProjectPath(target, relativePath, {
    createParent: true,
    allowMissing: true,
  })
  if (bytes === null) {
    try { fs.rmSync(destination.filePath, { force: true }) } catch {}
    syncDirectory(path.dirname(destination.filePath))
    return { path: destination.relativePath, restored: true, digest: null, bytes: 0 }
  }

  const temporaryName = `.${path.basename(destination.filePath)}.restore-${process.pid}-${crypto.randomUUID()}`
  const temporaryPath = path.join(path.dirname(destination.filePath), temporaryName)
  let created = false
  try {
    writeDurableFile(temporaryPath, bytes, { exclusive: true, mode: 0o600 })
    created = true
    fs.renameSync(temporaryPath, destination.filePath)
    created = false
    syncDirectory(path.dirname(destination.filePath))
  } finally {
    if (created) {
      try { fs.rmSync(temporaryPath, { force: true }) } catch {}
    }
  }
  return {
    path: destination.relativePath,
    restored: true,
    bytes: bytes.length,
    digest: digestBytes(bytes),
  }
}

export function stageJsonReplacement({ target, transactionDir, relativePath, value }) {
  const transactionPath = toPosix(transactionDir)
  const canonical = safeProjectPath(target, relativePath, { allowMissing: true })
  let beforeBytes = null
  try { beforeBytes = fs.readFileSync(canonical.filePath) } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error
  }
  const token = crypto.createHash('sha256').update(toPosix(relativePath), 'utf8').digest('hex').slice(0, 24)
  const stagedPath = `${transactionPath}/staged/${token}.json`
  const beforePath = `${transactionPath}/before/${token}.bin`
  const staged = stageAtomicJson(target, stagedPath, value)
  if (beforeBytes !== null) {
    const before = safeProjectPath(target, beforePath, { createParent: true, allowMissing: true })
    writeDurableFile(before.filePath, beforeBytes, { exclusive: true, mode: 0o600 })
    syncDirectory(path.dirname(before.filePath))
  }
  return {
    target,
    kind: 'json-replace',
    path: toPosix(relativePath),
    relativePath: toPosix(relativePath),
    stagedPath: staged.stagedPath,
    beforePath: beforeBytes === null ? null : beforePath,
    beforeDigest: beforeBytes === null ? null : digestBytes(beforeBytes),
    afterDigest: staged.digest,
  }
}

export function publishJsonReplacement(stagedWrite) {
  if (!stagedWrite || typeof stagedWrite !== 'object') throw persistenceError('INVALID_STAGED_WRITE', 'A staged JSON replacement is required.')
  return {
    ...publishAtomicJson(stagedWrite.target, stagedWrite.stagedPath, stagedWrite.relativePath ?? stagedWrite.path),
    stagedPath: stagedWrite.stagedPath,
    beforePath: stagedWrite.beforePath ?? null,
    beforeDigest: stagedWrite.beforeDigest ?? null,
    afterDigest: stagedWrite.afterDigest,
  }
}

export function restoreJsonReplacement(stagedWrite) {
  if (!stagedWrite || typeof stagedWrite !== 'object') throw persistenceError('INVALID_STAGED_WRITE', 'A staged JSON replacement is required.')
  const beforeBytes = stagedWrite.beforePath === null || stagedWrite.beforePath === undefined
    ? null
    : fs.readFileSync(safeProjectPath(stagedWrite.target, stagedWrite.beforePath).filePath)
  return restoreDurableBytes(stagedWrite.target, stagedWrite.relativePath ?? stagedWrite.path, beforeBytes)
}

export const readJson = readAtomicJson
export const replaceAtomicJson = writeAtomicJson
