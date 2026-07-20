import crypto from 'node:crypto'

export const CORE_STATUSES = Object.freeze(['proceed', 'repair', 'ask_user', 'blocked', 'complete'])
export const LIFECYCLE_STAGES = Object.freeze(['frame', 'specify', 'build', 'verify', 'close'])
export const EXECUTION_OUTCOMES = Object.freeze(['passed', 'failed', 'warning'])
export const CLAIM_STATUSES = Object.freeze(['result', 'verified', 'accepted', 'blocked', 'not-ready'])
export const REQUIRED_ENVELOPE_FIELDS = Object.freeze([
  'schemaVersion', 'operationId', 'status', 'stage', 'reasonCode', 'message',
  'changeId', 'taskId', 'stateRevision', 'executionOutcome', 'claimStatus',
  'claimScope', 'claimType', 'remainingGates', 'requiredActions', 'artifactRefs',
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
const CONTINUATION_PACKET_FIELDS = new Set([
  'schemaVersion', 'protocol', 'packetId', 'sourceState', 'planUnit', 'next',
  'decision', 'host', 'authority', 'requirements', 'process', 'reinjection', 'evidence',
])
const AUTONOMY_MODES = new Set(['guided', 'bounded', 'autonomous'])
const PLANNING_GRANULARITIES = new Set(['detailed', 'bounded', 'outcome-focused'])
const CHECKPOINT_CADENCES = new Set(['each-step', 'risk-boundary', 'completion-boundary'])
const REPORTING_CADENCES = new Set(['frequent', 'milestone', 'exception-and-completion'])
const AUTONOMY_INVARIANT_FIELDS = Object.freeze([
  'permissions', 'securityBoundaries', 'evidenceThresholds',
  'externalAuthorization', 'destructiveAuthorization', 'acceptanceAuthority',
])
const CONTINUATION_OUTCOMES = new Set(['continue-now', 'await-decision', 'blocked', 'rollover-required', 'top-level-complete'])
const CONTINUATION_MODES = new Set(['host-autonomous-continuation', 'host-turn-controlled'])
const CONTINUATION_EVIDENCE_STAGES = new Set(['none', 'recommended', 'acknowledged', 'dispatched', 'completed'])
const PROHIBITED_CONTINUATION_CONTENT = /(?:permission\s*bypass|--dangerously|--force|spawn\s+(?:claude|codex)|child_process|provider[-_ ]?session[-_ ]?id)/i

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

function defaultExecutionOutcome(status) {
  if (status === 'complete' || status === 'proceed') return 'passed'
  if (status === 'ask_user') return 'warning'
  return 'failed'
}

function defaultClaimStatus(status) {
  if (status === 'blocked') return 'blocked'
  if (status === 'repair' || status === 'ask_user') return 'not-ready'
  return 'result'
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
  if (!EXECUTION_OUTCOMES.includes(input.executionOutcome)) diagnostics.push({ code: 'INVALID_EXECUTION_OUTCOME', field: 'executionOutcome', value: diagnosticValue(input.executionOutcome) })
  if (!CLAIM_STATUSES.includes(input.claimStatus)) diagnostics.push({ code: 'INVALID_CLAIM_STATUS', field: 'claimStatus', value: diagnosticValue(input.claimStatus) })
  for (const field of ['claimScope', 'claimType']) {
    if (typeof input[field] !== 'string' || input[field].length === 0) diagnostics.push({ code: 'INVALID_CLAIM_BOUNDARY', field, value: diagnosticValue(input[field]) })
  }
  for (const field of ['remainingGates', 'requiredActions', 'artifactRefs', 'evidenceRefs']) {
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
  if (Object.hasOwn(source, 'executionOutcome') && !EXECUTION_OUTCOMES.includes(source.executionOutcome)) inputDiagnostics.push({ code: 'INVALID_EXECUTION_OUTCOME', field: 'executionOutcome', value: diagnosticValue(source.executionOutcome) })
  if (Object.hasOwn(source, 'claimStatus') && !CLAIM_STATUSES.includes(source.claimStatus)) inputDiagnostics.push({ code: 'INVALID_CLAIM_STATUS', field: 'claimStatus', value: diagnosticValue(source.claimStatus) })
  for (const field of ['claimScope', 'claimType']) {
    if (Object.hasOwn(source, field) && (typeof source[field] !== 'string' || source[field].length === 0)) inputDiagnostics.push({ code: 'INVALID_CLAIM_BOUNDARY', field, value: diagnosticValue(source[field]) })
  }
  if (Object.hasOwn(source, 'remainingGates') && !isStringArray(source.remainingGates)) inputDiagnostics.push({ code: 'INVALID_STRING_ARRAY', field: 'remainingGates', value: null })
  if (Object.hasOwn(source, 'safeToRetry') && typeof source.safeToRetry !== 'boolean') inputDiagnostics.push({ code: 'INVALID_RETRY_FLAG', field: 'safeToRetry', value: diagnosticValue(source.safeToRetry) })

  const requestedStatus = normalizeStatus(source.status ?? 'proceed')
  const requested = {
    schemaVersion: 1,
    operationId: typeof source.operationId === 'string' && source.operationId.length > 0 ? source.operationId : createOperationId(),
    status: requestedStatus,
    stage: source.stage ?? null,
    reasonCode: typeof source.reasonCode === 'string' && source.reasonCode.length > 0 ? source.reasonCode : 'READY',
    message: typeof source.message === 'string' ? source.message : '',
    changeId: source.changeId ?? null,
    taskId: source.taskId ?? null,
    stateRevision: source.stateRevision ?? null,
    executionOutcome: source.executionOutcome ?? defaultExecutionOutcome(requestedStatus),
    claimStatus: source.claimStatus ?? defaultClaimStatus(requestedStatus),
    claimScope: source.claimScope ?? 'operation',
    claimType: source.claimType ?? 'mechanical',
    remainingGates: Array.isArray(source.remainingGates) ? source.remainingGates : [],
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
    executionOutcome: 'failed',
    claimStatus: 'not-ready',
    claimScope: typeof requested.claimScope === 'string' && requested.claimScope.length > 0 ? requested.claimScope : 'operation',
    claimType: typeof requested.claimType === 'string' && requested.claimType.length > 0 ? requested.claimType : 'mechanical',
    remainingGates: isStringArray(requested.remainingGates) ? requested.remainingGates : [],
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

export function assertContinuationPacketContract(packet) {
  const diagnostics = []
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
    diagnostics.push({ code: 'INVALID_CONTINUATION_PACKET', field: null })
  } else {
    for (const field of Object.keys(packet)) {
      if (!CONTINUATION_PACKET_FIELDS.has(field)) diagnostics.push({ code: 'UNKNOWN_FIELD', field })
    }
    if (packet.schemaVersion !== 1) diagnostics.push({ code: 'INVALID_SCHEMA_VERSION', field: 'schemaVersion' })
    if (packet.protocol !== 'gse-host-native-continuation') diagnostics.push({ code: 'INVALID_PROTOCOL', field: 'protocol' })
    if (typeof packet.packetId !== 'string' || !/^continue-[a-f0-9]{24}$/.test(packet.packetId)) diagnostics.push({ code: 'INVALID_PACKET_ID', field: 'packetId' })
    if (!Number.isInteger(packet.sourceState?.revision) && packet.sourceState?.revision !== null) diagnostics.push({ code: 'INVALID_REVISION', field: 'sourceState.revision' })
    if (!isDigestOrNull(packet.sourceState?.digest) || packet.sourceState?.digest === null) diagnostics.push({ code: 'INVALID_DIGEST', field: 'sourceState.digest' })
    if (!CONTINUATION_OUTCOMES.has(packet.decision?.stopOutcome)) diagnostics.push({ code: 'INVALID_OUTCOME', field: 'decision.stopOutcome' })
    if (!AUTONOMY_MODES.has(packet.process?.mode)) diagnostics.push({ code: 'INVALID_AUTONOMY_MODE', field: 'process.mode' })
    if (!PLANNING_GRANULARITIES.has(packet.process?.planningGranularity)) diagnostics.push({ code: 'INVALID_PLANNING_GRANULARITY', field: 'process.planningGranularity' })
    if (!CHECKPOINT_CADENCES.has(packet.process?.checkpointCadence)) diagnostics.push({ code: 'INVALID_CHECKPOINT_CADENCE', field: 'process.checkpointCadence' })
    if (!REPORTING_CADENCES.has(packet.process?.reportingCadence)) diagnostics.push({ code: 'INVALID_REPORTING_CADENCE', field: 'process.reportingCadence' })
    for (const field of ['reasonCodes', 'capabilityBasis', 'downgradeSignals']) {
      if (!isStringArray(packet.process?.[field])) diagnostics.push({ code: 'INVALID_PROCESS_ARRAY', field: `process.${field}` })
    }
    if (!packet.process?.invariants || typeof packet.process.invariants !== 'object' || Array.isArray(packet.process.invariants)) {
      diagnostics.push({ code: 'INVALID_PROCESS_INVARIANTS', field: 'process.invariants' })
    } else {
      const invariantKeys = Object.keys(packet.process.invariants)
      if (
        invariantKeys.length !== AUTONOMY_INVARIANT_FIELDS.length
        || invariantKeys.some((field) => !AUTONOMY_INVARIANT_FIELDS.includes(field))
        || AUTONOMY_INVARIANT_FIELDS.some((field) => packet.process.invariants[field] !== 'unchanged')
      ) diagnostics.push({ code: 'INVALID_PROCESS_INVARIANTS', field: 'process.invariants' })
    }
    if (!CONTINUATION_MODES.has(packet.host?.negotiatedMode)) diagnostics.push({ code: 'INVALID_CONTINUATION_MODE', field: 'host.negotiatedMode' })
    if (!CONTINUATION_EVIDENCE_STAGES.has(packet.evidence?.stage)) diagnostics.push({ code: 'INVALID_EVIDENCE_STAGE', field: 'evidence.stage' })
    if (packet.evidence?.hostDispatchObserved !== false && !['dispatched', 'completed'].includes(packet.evidence?.stage)) diagnostics.push({ code: 'UNPROVEN_HOST_DISPATCH', field: 'evidence.hostDispatchObserved' })
    if (packet.decision?.canAutoContinue && (packet.host?.negotiatedMode !== 'host-autonomous-continuation' || packet.decision?.stopOutcome !== 'continue-now')) diagnostics.push({ code: 'INVALID_AUTO_CONTINUATION', field: 'decision.canAutoContinue' })
    if (packet.decision?.requiresHostReinjection !== packet.reinjection?.required) diagnostics.push({ code: 'INCONSISTENT_REINJECTION', field: 'reinjection.required' })
    if (typeof packet.reinjection?.prompt !== 'string' || packet.reinjection.prompt.length > 700 || packet.reinjection?.maxChars !== 700) diagnostics.push({ code: 'INVALID_REINJECTION', field: 'reinjection' })
    if (PROHIBITED_CONTINUATION_CONTENT.test(JSON.stringify(packet))) diagnostics.push({ code: 'PROHIBITED_HOST_CONTENT', field: null })
  }
  if (diagnostics.length > 0) {
    const error = new Error('Continuation packet did not satisfy the Core v1 runtime contract.')
    error.code = 'INVALID_CONTINUATION_PACKET'
    error.diagnostics = diagnostics
    throw error
  }
  return packet
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
