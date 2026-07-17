import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const LOCK_RELATIVE_PATH = path.join('.gse', 'locks', 'core')
const STALE_RELATIVE_PATH = path.join('.gse', 'locks', 'stale')
const OWNER_FILE = 'owner.json'
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

function resultFields({
  status,
  reasonCode,
  message,
  operationId = null,
  lockPath = null,
  recoveredStaleOwner = false,
  safeToRetry = true,
  ...extra
}) {
  return {
    schemaVersion: 1,
    status,
    reasonCode,
    message,
    operationId,
    lockPath,
    recoveredStaleOwner,
    safeToRetry,
    ...extra,
  }
}

function invalidResult(reasonCode, message, operationId = null) {
  return resultFields({
    status: 'repair',
    reasonCode,
    message,
    operationId,
    safeToRetry: false,
  })
}

function normalizeOptions(options = {}) {
  const operationId = options?.operationId
  const ttlMs = options?.ttlMs ?? 30000
  const maxAttempts = options?.maxAttempts ?? 3
  const now = options?.now ?? (() => Date.now())

  if (typeof operationId !== 'string' || !IDENTIFIER_PATTERN.test(operationId)) {
    return { error: invalidResult('INVALID_OPERATION_ID', 'A safe operationId is required.') }
  }
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > Number.MAX_SAFE_INTEGER) {
    return { error: invalidResult('INVALID_LOCK_TTL', 'Lock ttlMs must be a positive finite number.', operationId) }
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    return { error: invalidResult('INVALID_LOCK_ATTEMPTS', 'Lock maxAttempts must be a positive integer.', operationId) }
  }
  if (typeof now !== 'function') {
    return { error: invalidResult('INVALID_LOCK_CLOCK', 'Lock now must be a function.', operationId) }
  }

  let timestamp
  try {
    timestamp = now()
  } catch {
    return { error: invalidResult('LOCK_CLOCK_FAILED', 'The lock clock could not be read.', operationId) }
  }
  if (!Number.isFinite(timestamp)) {
    return { error: invalidResult('INVALID_LOCK_CLOCK', 'The lock clock must return a finite number.', operationId) }
  }
  return { operationId, ttlMs, maxAttempts, now, timestamp }
}

function realTarget(target) {
  if (typeof target !== 'string' || target.length === 0) return null
  try {
    const resolved = path.resolve(target)
    const stats = fs.statSync(resolved)
    return stats.isDirectory() ? fs.realpathSync.native(resolved) : null
  } catch {
    return null
  }
}

function ensureDirectoryNoSymlinks(root, relativePath) {
  let current = root
  for (const segment of relativePath.split(path.sep)) {
    current = path.join(current, segment)
    let stats
    try {
      stats = fs.lstatSync(current)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      fs.mkdirSync(current)
      continue
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      const error = new Error('Lock storage contains a symlink or non-directory component.')
      error.code = 'LOCK_STORAGE_UNSAFE'
      throw error
    }
  }
  return current
}

function lockPaths(target) {
  const root = realTarget(target)
  if (!root) return null
  try {
    const gse = ensureDirectoryNoSymlinks(root, '.gse')
    const locks = ensureDirectoryNoSymlinks(gse, 'locks')
    const core = path.join(locks, 'core')
    const stale = path.join(locks, 'stale')
    for (const candidate of [core, stale]) {
      let stats
      try {
        stats = fs.lstatSync(candidate)
      } catch (error) {
        if (error?.code === 'ENOENT') continue
        throw error
      }
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        const unsafe = new Error('Lock storage contains a symlink or non-directory component.')
        unsafe.code = 'LOCK_STORAGE_UNSAFE'
        throw unsafe
      }
    }
    return { root, core, stale, owner: path.join(core, OWNER_FILE) }
  } catch {
    return null
  }
}

function ownerShape(owner) {
  if (!owner || typeof owner !== 'object' || Array.isArray(owner)) return null
  if (typeof owner.operationId !== 'string' || !IDENTIFIER_PATTERN.test(owner.operationId)) return null
  if (!Number.isInteger(owner.pid) || owner.pid < 0) return null
  if (!Number.isFinite(owner.createdAt) || !Number.isFinite(owner.expiresAt)) return null
  if (typeof owner.monotonicStartedNs !== 'string' || !/^\d+$/.test(owner.monotonicStartedNs)) return null
  return {
    operationId: owner.operationId,
    pid: owner.pid,
    createdAt: owner.createdAt,
    expiresAt: owner.expiresAt,
    monotonicStartedNs: owner.monotonicStartedNs,
  }
}

function readOwner(ownerPath) {
  try {
    const stats = fs.lstatSync(ownerPath)
    if (stats.isSymbolicLink() || !stats.isFile()) return null
    return ownerShape(JSON.parse(fs.readFileSync(ownerPath, 'utf8')))
  } catch {
    return null
  }
}

function writeJsonAtomic(filePath, value) {
  const directory = path.dirname(filePath)
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.tmp-${process.pid}-${crypto.randomUUID()}`)
  let descriptor = null
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600)
    fs.writeFileSync(descriptor, `${JSON.stringify(value)}\n`, 'utf8')
    fs.fsyncSync(descriptor)
    fs.closeSync(descriptor)
    descriptor = null
    fs.renameSync(temporaryPath, filePath)
  } finally {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor) } catch {}
    }
    try { fs.rmSync(temporaryPath, { force: true }) } catch {}
  }
}

function ownerDigest(owner) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(owner), 'utf8')
    .digest('hex')
    .slice(0, 24)
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

function monotonicElapsedMs(owner) {
  if (owner.pid !== process.pid) return null
  try {
    const started = BigInt(owner.monotonicStartedNs)
    const current = process.hrtime.bigint()
    if (current < started) return null
    return Number(current - started) / 1_000_000
  } catch {
    return null
  }
}

function ownerIsExpired(owner, currentWallTime, ttlMs = null) {
  const elapsed = monotonicElapsedMs(owner)
  if (elapsed !== null && processIsAlive(owner.pid)) {
    const lifetime = Number.isFinite(ttlMs) ? ttlMs : owner.expiresAt - owner.createdAt
    return elapsed >= lifetime
  }
  return currentWallTime >= owner.expiresAt
}

function archiveStale(paths, owner, archivedAt) {
  try {
    fs.mkdirSync(paths.stale, { recursive: false })
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
  }
  const baseName = `stale-${ownerDigest(owner)}`
  let archivePath = path.join(paths.stale, baseName)
  let suffix = 0
  while (true) {
    try {
      fs.renameSync(paths.core, archivePath)
      break
    } catch (error) {
      if (error?.code === 'EEXIST' || error?.code === 'ENOTEMPTY') {
        suffix += 1
        archivePath = path.join(paths.stale, `${baseName}-${suffix}`)
        continue
      }
      if (error?.code === 'ENOENT') return null
      throw error
    }
  }

  const archiveRecord = {
    schemaVersion: 1,
    recordType: 'stale-lock',
    archiveId: path.basename(archivePath),
    archivedAt,
    reasonCode: 'STALE_LOCK_RECLAIMED',
    owner,
  }
  writeJsonAtomic(path.join(archivePath, 'archive.json'), archiveRecord)
  return archivePath
}

function makeHandle(paths, owner, recoveredStaleOwner) {
  return resultFields({
    status: 'proceed',
    reasonCode: 'LOCK_ACQUIRED',
    message: 'Project lock acquired.',
    operationId: owner.operationId,
    lockPath: paths.core,
    ownerPath: paths.owner,
    owner,
    expiresAt: owner.expiresAt,
    recoveredStaleOwner,
    safeToRetry: false,
  })
}

export function acquireProjectLock(target, options = {}) {
  const normalized = normalizeOptions(options)
  if (normalized.error) return normalized.error
  const paths = lockPaths(target)
  if (!paths) return invalidResult('INVALID_TARGET', 'The project target is unavailable or lock storage is unsafe.', normalized.operationId)

  let recoveredStaleOwner = false
  for (let attempt = 1; attempt <= normalized.maxAttempts; attempt += 1) {
    const createdAt = attempt === 1 ? normalized.timestamp : normalized.now()
    if (!Number.isFinite(createdAt)) return invalidResult('INVALID_LOCK_CLOCK', 'The lock clock must return a finite number.', normalized.operationId)
    const owner = {
      operationId: normalized.operationId,
      pid: process.pid,
      createdAt,
      expiresAt: createdAt + normalized.ttlMs,
      monotonicStartedNs: process.hrtime.bigint().toString(),
    }

    try {
      fs.mkdirSync(paths.core, { recursive: false, mode: 0o700 })
      writeJsonAtomic(paths.owner, owner)
      return makeHandle(paths, owner, recoveredStaleOwner)
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        return invalidResult('LOCK_STORAGE_ERROR', 'The project lock could not be created.', normalized.operationId)
      }
    }

    const existingOwner = readOwner(paths.owner)
    const currentTime = normalized.now()
    if (!Number.isFinite(currentTime)) return invalidResult('INVALID_LOCK_CLOCK', 'The lock clock must return a finite number.', normalized.operationId)
    if (!existingOwner) {
      return resultFields({
        status: 'blocked',
        reasonCode: 'LOCK_METADATA_INVALID',
        message: 'The existing project lock has invalid ownership metadata.',
        operationId: normalized.operationId,
        lockPath: paths.core,
        safeToRetry: false,
      })
    }
    if (!ownerIsExpired(existingOwner, currentTime)) {
      return resultFields({
        status: 'blocked',
        reasonCode: 'LOCK_HELD',
        message: 'The project lock is held by another live operation.',
        operationId: normalized.operationId,
        lockPath: paths.core,
        expiresAt: existingOwner.expiresAt,
        safeToRetry: true,
      })
    }

    try {
      const archivePath = archiveStale(paths, existingOwner, currentTime)
      if (archivePath) recoveredStaleOwner = true
    } catch {
      return resultFields({
        status: 'blocked',
        reasonCode: 'STALE_LOCK_ARCHIVE_FAILED',
        message: 'The stale project lock could not be archived safely.',
        operationId: normalized.operationId,
        lockPath: paths.core,
        safeToRetry: true,
      })
    }
  }

  return resultFields({
    status: 'blocked',
    reasonCode: 'LOCK_HELD',
    message: 'The project lock remains held after the configured attempts.',
    operationId: normalized.operationId,
    lockPath: paths.core,
    safeToRetry: true,
  })
}

export function renewProjectLock(lock, { ttlMs = 30000, now = () => Date.now() } = {}) {
  if (!lock || typeof lock !== 'object' || !lock.ownerPath || !lock.owner || !IDENTIFIER_PATTERN.test(lock.operationId ?? '')) {
    return invalidResult('INVALID_LOCK_HANDLE', 'A valid project lock handle is required.', lock?.operationId ?? null)
  }
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || typeof now !== 'function') {
    return invalidResult('INVALID_LOCK_RENEWAL', 'Lock renewal options are invalid.', lock.operationId)
  }
  let timestamp
  try { timestamp = now() } catch { timestamp = NaN }
  if (!Number.isFinite(timestamp)) return invalidResult('INVALID_LOCK_CLOCK', 'The lock clock must return a finite number.', lock.operationId)

  const current = readOwner(lock.ownerPath)
  if (!current || current.operationId !== lock.operationId || current.monotonicStartedNs !== lock.owner.monotonicStartedNs) {
    return resultFields({ status: 'blocked', reasonCode: 'LOCK_NOT_OWNER', message: 'The operation no longer owns this project lock.', operationId: lock.operationId, lockPath: lock.lockPath, safeToRetry: false })
  }
  if (ownerIsExpired(current, timestamp)) {
    return resultFields({ status: 'blocked', reasonCode: 'LOCK_EXPIRED', message: 'The project lock expired before renewal.', operationId: lock.operationId, lockPath: lock.lockPath, safeToRetry: true })
  }

  const renewedOwner = { ...current, expiresAt: timestamp + ttlMs }
  try {
    writeJsonAtomic(lock.ownerPath, renewedOwner)
  } catch {
    return resultFields({ status: 'blocked', reasonCode: 'LOCK_RENEWAL_FAILED', message: 'The project lock could not be renewed safely.', operationId: lock.operationId, lockPath: lock.lockPath, safeToRetry: true })
  }
  return resultFields({ status: 'proceed', reasonCode: 'LOCK_RENEWED', message: 'Project lock renewed.', operationId: lock.operationId, lockPath: lock.lockPath, ownerPath: lock.ownerPath, owner: renewedOwner, expiresAt: renewedOwner.expiresAt, safeToRetry: false })
}

export function releaseProjectLock(lock) {
  if (!lock || typeof lock !== 'object' || typeof lock.ownerPath !== 'string' || typeof lock.operationId !== 'string') {
    return resultFields({ status: 'complete', reasonCode: 'LOCK_NOT_HELD', message: 'No releasable project lock was provided.', operationId: lock?.operationId ?? null, safeToRetry: true })
  }
  const current = readOwner(lock.ownerPath)
  if (!current || current.operationId !== lock.operationId || current.monotonicStartedNs !== lock.owner?.monotonicStartedNs) {
    return resultFields({ status: 'complete', reasonCode: 'LOCK_NOT_OWNER', message: 'The project lock was already released or belongs to another operation.', operationId: lock.operationId, lockPath: lock.lockPath ?? path.dirname(lock.ownerPath), safeToRetry: true })
  }

  try {
    const corePath = path.dirname(lock.ownerPath)
    const stats = fs.lstatSync(corePath)
    if (stats.isSymbolicLink() || !stats.isDirectory()) return resultFields({ status: 'complete', reasonCode: 'LOCK_NOT_HELD', message: 'The project lock was already released.', operationId: lock.operationId, lockPath: corePath, safeToRetry: true })
    fs.unlinkSync(lock.ownerPath)
    fs.rmdirSync(corePath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return resultFields({ status: 'complete', reasonCode: 'LOCK_NOT_HELD', message: 'The project lock was already released.', operationId: lock.operationId, lockPath: lock.lockPath ?? path.dirname(lock.ownerPath), safeToRetry: true })
    }
    if (error?.code !== 'ENOTEMPTY' && error?.code !== 'EEXIST') {
      return resultFields({ status: 'blocked', reasonCode: 'LOCK_RELEASE_FAILED', message: 'The project lock could not be released safely.', operationId: lock.operationId, lockPath: lock.lockPath ?? path.dirname(lock.ownerPath), safeToRetry: true })
    }
  }
  return resultFields({ status: 'complete', reasonCode: 'LOCK_RELEASED', message: 'Project lock released.', operationId: lock.operationId, lockPath: lock.lockPath ?? path.dirname(lock.ownerPath), safeToRetry: true })
}
