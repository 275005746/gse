import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

function invalidPathError() {
  const error = new Error('Path must be a string.')
  error.code = 'INVALID_PATH'
  return error
}

function outsideTargetError() {
  const error = new Error('Path is outside the target.')
  error.code = 'PATH_OUTSIDE_TARGET'
  return error
}

function invalidDigestBytesError() {
  const error = new Error('Digest input must be a Buffer, Uint8Array, or string.')
  error.code = 'INVALID_DIGEST_BYTES'
  return error
}

function invalidDigestValueError() {
  const error = new Error('Value is not a supported JSON-compatible digest value.')
  error.code = 'INVALID_DIGEST_VALUE'
  return error
}

export function toPosix(relativePath) {
  if (typeof relativePath !== 'string') throw invalidPathError()
  return relativePath.replace(/\\/g, '/')
}

export function resolveInside(target, relativePath) {
  if (typeof target !== 'string' || typeof relativePath !== 'string') {
    throw outsideTargetError()
  }
  if (relativePath.length === 0) throw outsideTargetError()

  const normalized = toPosix(relativePath)
  const isPosixAbsolute = normalized.startsWith('/')
  const isWindowsDriveAbsolute = /^[A-Za-z]:\//.test(normalized)
  const isWindowsDriveRelative = /^[A-Za-z]:[^/]/.test(normalized)
  const isRootedBackslash = relativePath.startsWith('\\')
  const hasParentSegment = normalized.split('/').some((segment) => segment === '..')

  if (isPosixAbsolute || isWindowsDriveAbsolute || isWindowsDriveRelative || isRootedBackslash || hasParentSegment) {
    throw outsideTargetError()
  }

  const root = path.resolve(target)
  const resolved = path.resolve(root, normalized)
  const relation = path.relative(root, resolved)
  if (relation === '' || (!path.isAbsolute(relation) && relation !== '..' && !relation.startsWith(`..${path.sep}`))) {
    return resolved
  }
  throw outsideTargetError()
}

export function digestBytes(bytes) {
  if (typeof bytes !== 'string' && !Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    throw invalidDigestBytesError()
  }
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
}

export function digestFile(filePath) {
  let descriptor
  try {
    descriptor = fs.openSync(filePath, 'r')
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null
    throw error
  }

  try {
    const stats = fs.fstatSync(descriptor)
    if (!stats.isFile()) return null
    return digestBytes(fs.readFileSync(descriptor))
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR' || error?.code === 'EISDIR') return null
    throw error
  } finally {
    fs.closeSync(descriptor)
  }
}

function isArrayIndex(key) {
  if (key === '') return false
  const number = Number(key)
  return Number.isInteger(number) && number >= 0 && number < 0xffffffff && String(number) === key
}

function canonicalize(value, seen) {
  if (value === null) return 'null'

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value)
    case 'boolean':
      return value ? 'true' : 'false'
    case 'number':
      if (!Number.isFinite(value)) throw invalidDigestValueError()
      return JSON.stringify(value)
    case 'undefined':
    case 'function':
    case 'symbol':
    case 'bigint':
      throw invalidDigestValueError()
    case 'object':
      break
    default:
      throw invalidDigestValueError()
  }

  if (seen.has(value)) throw invalidDigestValueError()
  seen.add(value)
  try {
    if (Array.isArray(value)) {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
      if (!lengthDescriptor || !('value' in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value)) {
        throw invalidDigestValueError()
      }

      for (const key of Reflect.ownKeys(value)) {
        if (typeof key === 'symbol') {
          const descriptor = Object.getOwnPropertyDescriptor(value, key)
          if (descriptor?.enumerable) throw invalidDigestValueError()
        } else if (key !== 'length') {
          const descriptor = Object.getOwnPropertyDescriptor(value, key)
          if (descriptor?.enumerable && !isArrayIndex(key)) throw invalidDigestValueError()
        }
      }

      const items = []
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
        if (!descriptor || !('value' in descriptor)) throw invalidDigestValueError()
        items.push(canonicalize(descriptor.value, seen))
      }
      return `[${items.join(',')}]`
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) throw invalidDigestValueError()

    const keys = []
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (typeof key === 'symbol') {
        if (descriptor?.enumerable) throw invalidDigestValueError()
      } else if (descriptor?.enumerable) {
        if (!('value' in descriptor)) throw invalidDigestValueError()
        keys.push(key)
      }
    }

    keys.sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(Object.getOwnPropertyDescriptor(value, key).value, seen)}`).join(',')}}`
  } finally {
    seen.delete(value)
  }
}

export function digestValue(value) {
  try {
    return digestBytes(Buffer.from(canonicalize(value, new WeakSet()), 'utf8'))
  } catch (error) {
    if (error?.code === 'INVALID_DIGEST_VALUE') throw error
    throw invalidDigestValueError()
  }
}
