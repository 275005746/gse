import crypto from 'node:crypto'

export const CORE_STATUSES = Object.freeze(['proceed', 'repair', 'ask_user', 'blocked', 'complete'])
export const LIFECYCLE_STAGES = Object.freeze(['frame', 'specify', 'build', 'verify', 'close'])
export const REQUIRED_ENVELOPE_FIELDS = Object.freeze([
  'schemaVersion', 'operationId', 'status', 'stage', 'reasonCode', 'message',
  'changeId', 'taskId', 'stateRevision', 'requiredActions', 'artifactRefs',
  'evidenceRefs', 'diagnostics', 'safeToRetry',
])

const TRANSACTION_STATUSES = new Set(['prepared', 'staged', 'published', 'committed', 'rolled-back', 'recovered'])
const WRITE_KINDS = new Set(['json-replace', 'jsonl-append', 'text-write', 'tree-move'])
const REQUIRED_WRITE_FIELDS = ['kind', 'path', 'beforeDigest', 'afterDigest', 'stagedPath']
const MANIFEST_FIELDS = new Set(['schemaVersion', 'transactionId', 'operationId', 'createdAt', 'expectedRevision', 'nextRevision', 'status', 'writes', 'eventIds'])
const WRITE_FIELDS = new Set([...REQUIRED_WRITE_FIELDS, 'eventId', 'eventIds', 'beforeSize', 'beforeImagePath', 'sourcePath', 'targetPath'])
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/
const RFC3339_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/
const WINDOWS_DRIVE_PATTERN = /^[A-Za-z]:/
const UNC_OR_ROOT_PATTERN = /^[\\/]/

export function normalizeStatus(value) {
  return value === 'block' ? 'blocked' : value
}

export function createOperationId() {
  return `op-${crypto.randomUUID()}`
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function diagnosticValue(value) {
  if (value === null) return '<null>'
  if (Array.isArray(value)) return '<array>'
  return `<${typeof value}>`
}

function diagnosticsFor(input, skipFields = new Set()) {
  const diagnostics = []
  const status = normalizeStatus(input.status)
  if (!skipFields.has('operationId') && (typeof input.operationId !== 'string' || input.operationId.length === 0)) diagnostics.push({ code: 'INVALID_OPERATION_ID', field: 'operationId', value: diagnosticValue(input.operationId) })
  if (!skipFields.has('status') && !CORE_STATUSES.includes(status)) diagnostics.push({ code: 'INVALID_STATUS', field: 'status', value: diagnosticValue(input.status) })
  if (!skipFields.has('stage') && input.stage !== null && !LIFECYCLE_STAGES.includes(input.stage)) diagnostics.push({ code: 'INVALID_STAGE', field: 'stage', value: diagnosticValue(input.stage) })
  if (!skipFields.has('reasonCode') && (typeof input.reasonCode !== 'string' || input.reasonCode.length === 0)) diagnostics.push({ code: 'INVALID_REASON_CODE', field: 'reasonCode', value: diagnosticValue(input.reasonCode) })
  if (!skipFields.has('message') && typeof input.message !== 'string') diagnostics.push({ code: 'INVALID_MESSAGE', field: 'message', value: null })
  for (const field of ['changeId', 'taskId']) {
    if (input[field] !== null && typeof input[field] !== 'string') diagnostics.push({ code: 'INVALID_IDENTIFIER', field, value: diagnosticValue(input[field]) })
  }
  if (input.stateRevision !== null && (!Number.isInteger(input.stateRevision) || input.stateRevision < 0)) diagnostics.push({ code: 'INVALID_REVISION', field: 'stateRevision', value: diagnosticValue(input.stateRevision) })
  for (const field of ['requiredActions', 'artifactRefs', 'evidenceRefs']) {
    if (!isStringArray(input[field])) diagnostics.push({ code: 'INVALID_STRING_ARRAY', field, value: null })
  }
  if (!Array.isArray(input.diagnostics) || input.diagnostics.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    diagnostics.push({ code: 'INVALID_DIAGNOSTICS', field: 'diagnostics', value: null })
  }
  return diagnostics
}

function sanitizeDiagnostic(input) {
  const output = {}
  if (typeof input.code === 'string' && input.code.length > 0) output.code = input.code
  if (typeof input.field === 'string' || input.field === null) output.field = input.field
  output.value = '<redacted>'
  return output
}

export function createResultEnvelope(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const inputDiagnostics = []
  if (source !== input) inputDiagnostics.push({ code: 'INVALID_INPUT', field: null, value: diagnosticValue(input) })
  for (const field of Object.keys(source)) {
    if (!REQUIRED_ENVELOPE_FIELDS.includes(field)) inputDiagnostics.push({ code: 'UNKNOWN_FIELD', field, value: '<redacted>' })
  }
  if (Object.hasOwn(source, 'schemaVersion') && source.schemaVersion !== 1) inputDiagnostics.push({ code: 'INVALID_SCHEMA_VERSION', field: 'schemaVersion', value: diagnosticValue(source.schemaVersion) })
  if (Object.hasOwn(source, 'operationId') && (typeof source.operationId !== 'string' || source.operationId.length === 0)) inputDiagnostics.push({ code: 'INVALID_OPERATION_ID', field: 'operationId', value: diagnosticValue(source.operationId) })
  if (Object.hasOwn(source, 'status') && !CORE_STATUSES.includes(normalizeStatus(source.status))) inputDiagnostics.push({ code: 'INVALID_STATUS', field: 'status', value: diagnosticValue(source.status) })
  if (Object.hasOwn(source, 'stage') && source.stage !== null && !LIFECYCLE_STAGES.includes(source.stage)) inputDiagnostics.push({ code: 'INVALID_STAGE', field: 'stage', value: diagnosticValue(source.stage) })
  if (Object.hasOwn(source, 'reasonCode') && (typeof source.reasonCode !== 'string' || source.reasonCode.length === 0)) inputDiagnostics.push({ code: 'INVALID_REASON_CODE', field: 'reasonCode', value: diagnosticValue(source.reasonCode) })
  if (Object.hasOwn(source, 'message') && typeof source.message !== 'string') inputDiagnostics.push({ code: 'INVALID_MESSAGE', field: 'message', value: null })
  if (Object.hasOwn(source, 'safeToRetry') && typeof source.safeToRetry !== 'boolean') inputDiagnostics.push({ code: 'INVALID_RETRY_FLAG', field: 'safeToRetry', value: diagnosticValue(source.safeToRetry) })

  const requested = {
    schemaVersion: 1,
    operationId: typeof source.operationId === 'string' && source.operationId.length > 0 ? source.operationId : createOperationId(),
    status: normalizeStatus(source.status ?? 'proceed'),
    stage: source.stage ?? null,
    reasonCode: typeof source.reasonCode === 'string' && source.reasonCode.length > 0 ? source.reasonCode : 'READY',
    message: typeof source.message === 'string' ? source.message : '',
    changeId: source.changeId ?? null,
    taskId: source.taskId ?? null,
    stateRevision: source.stateRevision ?? null,
    requiredActions: Array.isArray(source.requiredActions) ? source.requiredActions : [],
    artifactRefs: Array.isArray(source.artifactRefs) ? source.artifactRefs : [],
    evidenceRefs: Array.isArray(source.evidenceRefs) ? source.evidenceRefs : [],
    diagnostics: Array.isArray(source.diagnostics) ? source.diagnostics : [],
    safeToRetry: typeof source.safeToRetry === 'boolean' ? source.safeToRetry : true,
  }
  const validInputDiagnostics = requested.diagnostics
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map(sanitizeDiagnostic)
  const invalidSourceFields = new Set(inputDiagnostics.map((item) => item.field).filter(Boolean))
  const diagnostics = [...validInputDiagnostics, ...inputDiagnostics, ...diagnosticsFor(requested, invalidSourceFields)]
  if (diagnostics.length === requested.diagnostics.length && validInputDiagnostics.length === requested.diagnostics.length) {
    return { ...requested, diagnostics: validInputDiagnostics }
  }
  return {
    ...requested,
    operationId: typeof requested.operationId === 'string' && requested.operationId.length > 0 ? requested.operationId : createOperationId(),
    status: 'repair',
    stage: LIFECYCLE_STAGES.includes(requested.stage) ? requested.stage : null,
    reasonCode: 'CORE_VALIDATION_FAILED',
    message: 'Core operation input did not satisfy the v1 contract.',
    changeId: requested.changeId === null || typeof requested.changeId === 'string' ? requested.changeId : null,
    taskId: requested.taskId === null || typeof requested.taskId === 'string' ? requested.taskId : null,
    stateRevision: Number.isInteger(requested.stateRevision) && requested.stateRevision >= 0 ? requested.stateRevision : null,
    requiredActions: isStringArray(requested.requiredActions) ? requested.requiredActions : [],
    artifactRefs: isStringArray(requested.artifactRefs) ? requested.artifactRefs : [],
    evidenceRefs: isStringArray(requested.evidenceRefs) ? requested.evidenceRefs : [],
    diagnostics,
    safeToRetry: false,
  }
}

function isDigestOrNull(value) {
  return value === null || (typeof value === 'string' && DIGEST_PATTERN.test(value))
}

function isSafeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value === '.' || WINDOWS_DRIVE_PATTERN.test(value) || UNC_OR_ROOT_PATTERN.test(value)) return false
  const segments = value.replace(/\\/g, '/').split('/')
  const normalized = []
  for (const segment of segments) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (normalized.length === 0) return false
      normalized.pop()
      continue
    }
    normalized.push(segment)
  }
  return normalized.length > 0 && !segments.includes('..')
}

function isStrictRfc3339(value) {
  if (typeof value !== 'string') return false
  const match = value.match(RFC3339_PATTERN)
  if (!match) return false
  const [, year, month, day, hour, minute, second, zone, offsetHour = '00', offsetMinute = '00'] = match
  const integers = [year, month, day, hour, minute, second, offsetHour, offsetMinute].map(Number)
  const [yearValue, monthValue, dayValue, hourValue, minuteValue, secondValue, offsetHourValue, offsetMinuteValue] = integers
  if (monthValue < 1 || monthValue > 12 || dayValue < 1 || hourValue > 23 || minuteValue > 59 || secondValue > 59 || offsetHourValue > 23 || offsetMinuteValue > 59) return false
  const maximumDay = new Date(Date.UTC(yearValue, monthValue, 0)).getUTCDate()
  if (dayValue > maximumDay) return false
  return zone === 'Z' || /^[+-]\d{2}:\d{2}$/.test(zone)
}

export function assertTransactionManifestContract(manifest) {
  const diagnostics = []
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    diagnostics.push({ code: 'INVALID_MANIFEST', field: null })
  } else {
    for (const field of Object.keys(manifest)) {
      if (!MANIFEST_FIELDS.has(field)) diagnostics.push({ code: 'UNKNOWN_FIELD', field })
    }
    if (manifest.schemaVersion !== 1) diagnostics.push({ code: 'INVALID_SCHEMA_VERSION', field: 'schemaVersion' })
    for (const field of ['transactionId', 'operationId']) {
      if (typeof manifest[field] !== 'string' || manifest[field].length === 0) diagnostics.push({ code: 'REQUIRED_FIELD', field })
    }
    if (!isStrictRfc3339(manifest.createdAt)) diagnostics.push({ code: 'INVALID_TIMESTAMP', field: 'createdAt' })
    if (!Number.isInteger(manifest.expectedRevision) || manifest.expectedRevision < 0) diagnostics.push({ code: 'INVALID_REVISION', field: 'expectedRevision' })
    if (manifest.nextRevision !== manifest.expectedRevision + 1) diagnostics.push({ code: 'INVALID_REVISION_RELATION', field: 'nextRevision' })
    if (!TRANSACTION_STATUSES.has(manifest.status)) diagnostics.push({ code: 'INVALID_STATUS', field: 'status' })
    if (!Array.isArray(manifest.writes)) {
      diagnostics.push({ code: 'INVALID_WRITES', field: 'writes' })
    } else {
      for (const [index, write] of manifest.writes.entries()) {
        const prefix = `writes[${index}]`
        if (!write || typeof write !== 'object' || Array.isArray(write)) {
          diagnostics.push({ code: 'INVALID_WRITE', field: prefix })
          continue
        }
        for (const field of Object.keys(write)) {
          if (!WRITE_FIELDS.has(field)) diagnostics.push({ code: 'UNKNOWN_WRITE_FIELD', field: `${prefix}.${field}` })
        }
        for (const field of REQUIRED_WRITE_FIELDS) {
          if (!Object.hasOwn(write, field)) diagnostics.push({ code: 'REQUIRED_WRITE_FIELD', field: `${prefix}.${field}` })
        }
        if (!WRITE_KINDS.has(write.kind)) diagnostics.push({ code: 'INVALID_WRITE_KIND', field: `${prefix}.kind` })
        for (const field of ['path', 'stagedPath']) {
          if (!isSafeRelativePath(write[field])) diagnostics.push({ code: 'INVALID_WRITE_PATH', field: `${prefix}.${field}` })
        }
        for (const field of ['beforeDigest', 'afterDigest']) {
          if (!isDigestOrNull(write[field])) diagnostics.push({ code: 'INVALID_DIGEST', field: `${prefix}.${field}` })
        }
        if (write.kind !== 'tree-move' && !isSafeRelativePath(write.beforeImagePath)) diagnostics.push({ code: 'INVALID_WRITE_PATH', field: `${prefix}.beforeImagePath` })
        if (write.kind === 'jsonl-append') {
          const eventIds = Array.isArray(write.eventIds) ? write.eventIds : [write.eventId]
          if (
            eventIds.length === 0
            || eventIds.some((eventId) => typeof eventId !== 'string' || eventId.length === 0)
            || new Set(eventIds).size !== eventIds.length
          ) diagnostics.push({ code: 'REQUIRED_WRITE_FIELD', field: `${prefix}.eventIds` })
          if (Object.hasOwn(write, 'eventId') && (eventIds.length !== 1 || write.eventId !== eventIds[0])) {
            diagnostics.push({ code: 'INCONSISTENT_EVENT_IDS', field: `${prefix}.eventId` })
          }
          if (!Number.isInteger(write.beforeSize) || write.beforeSize < 0) diagnostics.push({ code: 'REQUIRED_WRITE_FIELD', field: `${prefix}.beforeSize` })
        }
        if (write.kind === 'tree-move') {
          for (const field of ['sourcePath', 'targetPath']) {
            if (!isSafeRelativePath(write[field])) diagnostics.push({ code: 'INVALID_WRITE_PATH', field: `${prefix}.${field}` })
          }
        }
      }
    }
    const writeEventIds = Array.isArray(manifest.writes)
      ? manifest.writes
        .filter((write) => write?.kind === 'jsonl-append')
        .flatMap((write) => Array.isArray(write.eventIds) ? write.eventIds : [write.eventId])
      : []
    const manifestEventIdsValid = Array.isArray(manifest.eventIds)
      && manifest.eventIds.every((value) => typeof value === 'string' && value.length > 0)
      && new Set(manifest.eventIds).size === manifest.eventIds.length
    if (!manifestEventIdsValid) diagnostics.push({ code: 'INVALID_EVENT_IDS', field: 'eventIds' })
    const writeEventIdsValid = writeEventIds.every((value) => typeof value === 'string' && value.length > 0)
      && new Set(writeEventIds).size === writeEventIds.length
    if (!writeEventIdsValid || !manifestEventIdsValid || writeEventIds.length !== manifest.eventIds.length || !writeEventIds.every((value) => manifest.eventIds.includes(value))) {
      diagnostics.push({ code: 'INCONSISTENT_EVENT_IDS', field: 'eventIds' })
    }
  }

  if (diagnostics.length > 0) {
    const error = new Error('Transaction manifest did not satisfy the Core v1 runtime contract.')
    error.code = 'INVALID_TRANSACTION_MANIFEST'
    error.diagnostics = diagnostics
    throw error
  }
  return manifest
}
