import fs from 'node:fs'
import path from 'node:path'
import { compareDerivedChange, deriveActiveChange } from './change-state.mjs'
import { createResultEnvelope } from './contracts.mjs'
import { digestFile, digestValue, resolveInside, toPosix } from './persistence/paths.mjs'

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/
const CONTROL_PATTERN = /[\x00-\x1f\x7f]/
export const EVIDENCE_STATUSES = Object.freeze(['result', 'verified', 'accepted'])
export const CRITERION_DISPOSITIONS = Object.freeze([
  'pending', 'passed', 'failed', 'waived', 'not-applicable',
])
const STATUS_LEVEL_PREFIX = Object.freeze({ result: 'result', verified: 'verified-', accepted: 'accepted-' })
export const EVIDENCE_LEVEL_RANK = Object.freeze({
  result: 0,
  'verified-unit': 1,
  'verified-component': 2,
  'verified-api': 2,
  'verified-browser': 3,
  'verified-ci': 3,
  'accepted-owner': 4,
  'accepted-release': 4,
  'external-required': 0,
})
const FORBIDDEN_INPUT_KEYS = new Set([
  'secret', 'secrets', 'token', 'tokens', 'password', 'credential', 'credentials',
  'stdout', 'stderr', 'output', 'rawOutput', 'raw',
])
const CAPTURE_FIELDS = new Set([
  'sourceRevision', 'dirtyWorktreeDigest', 'inputPaths', 'generatedArtifacts',
  'configuration', 'contractRevision', 'hostCapabilityBasis',
])

function invalidEvidenceInput(message = 'Evidence dependency input is invalid.') {
  const error = new Error(message)
  error.code = 'INVALID_EVIDENCE_INPUT'
  return error
}

function outsideTargetError() {
  const error = new Error('Path is outside the target.')
  error.code = 'PATH_OUTSIDE_TARGET'
  return error
}

function safePlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function ownValue(object, key) {
  if (!safePlainObject(object)) return { present: false, value: undefined }
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (!descriptor || !('value' in descriptor)) return { present: false, value: undefined }
  return { present: true, value: descriptor.value }
}

function boundedString(value, maximum = 512) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maximum
    && !CONTROL_PATTERN.test(value)
}

function validDigest(value) {
  return typeof value === 'string' && DIGEST_PATTERN.test(value)
}

function normalizeRelativePath(relativePath) {
  if (!boundedString(relativePath, 4096) || relativePath.includes('\\')) throw outsideTargetError()
  const normalized = path.posix.normalize(relativePath)
  if (normalized !== relativePath || normalized === '.' || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw outsideTargetError()
  }
  if (normalized.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw outsideTargetError()
  }
  return normalized
}

function isInside(root, candidate) {
  const relation = path.relative(root, candidate)
  return relation === ''
    || (!path.isAbsolute(relation) && relation !== '..' && !relation.startsWith(`..${path.sep}`))
}

function safeFileDigest(target, relativePath) {
  const normalized = normalizeRelativePath(relativePath)
  const root = path.resolve(target)
  const absolutePath = resolveInside(root, normalized)
  let rootReal
  try {
    rootReal = fs.realpathSync.native(root)
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') throw invalidEvidenceInput('Evidence target is unavailable.')
    throw error
  }

  let stats
  try {
    stats = fs.lstatSync(absolutePath)
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') throw invalidEvidenceInput('A declared evidence dependency is missing.')
    throw error
  }
  if (stats.isSymbolicLink() || !stats.isFile()) throw outsideTargetError()

  const realPath = fs.realpathSync.native(absolutePath)
  if (!isInside(rootReal, realPath)) throw outsideTargetError()
  return { path: toPosix(normalized), digest: digestFile(absolutePath) }
}

function pathList(input, field) {
  const value = ownValue(input, field)
  if (!value.present) return []
  if (!Array.isArray(value.value) || value.value.length > 256) throw invalidEvidenceInput()
  const unique = new Set()
  for (const item of value.value) {
    const relativePath = typeof item === 'string' ? item : ownValue(item, 'path').value
    unique.add(normalizeRelativePath(relativePath))
  }
  return [...unique].sort((left, right) => left.localeCompare(right))
}

function configurationEntries(input) {
  const value = ownValue(input, 'configuration')
  if (!value.present) return []
  if (!Array.isArray(value.value) || value.value.length > 256) throw invalidEvidenceInput()

  const entries = new Map()
  for (const item of value.value) {
    if (!safePlainObject(item)) throw invalidEvidenceInput()
    const key = ownValue(item, 'key')
    const rawValue = ownValue(item, 'value')
    const valueDigest = ownValue(item, 'valueDigest')
    if (!boundedString(key.value, 256) || FORBIDDEN_INPUT_KEYS.has(key.value.toLowerCase())) throw invalidEvidenceInput()
    if (entries.has(key.value)) throw invalidEvidenceInput()
    if (valueDigest.present) {
      if (!validDigest(valueDigest.value) || rawValue.present) throw invalidEvidenceInput()
      entries.set(key.value, valueDigest.value)
    } else {
      if (!rawValue.present) throw invalidEvidenceInput()
      entries.set(key.value, digestValue(rawValue.value))
    }
  }
  return [...entries].sort(([left], [right]) => left.localeCompare(right))
    .map(([key, valueDigest]) => ({ key, valueDigest }))
}

function environmentFingerprint() {
  return `node-${process.versions.node.split('.')[0]}-${process.platform}-${process.arch}`
}

function validateCaptureInput(input) {
  if (!safePlainObject(input)) throw invalidEvidenceInput()
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !CAPTURE_FIELDS.has(key) || FORBIDDEN_INPUT_KEYS.has(key.toLowerCase())) {
      throw invalidEvidenceInput()
    }
    const descriptor = Object.getOwnPropertyDescriptor(input, key)
    if (!descriptor?.enumerable || !('value' in descriptor)) throw invalidEvidenceInput()
  }
}

export function captureEvidenceDependencies(target, input) {
  validateCaptureInput(input)
  const sourceRevision = ownValue(input, 'sourceRevision')
  const dirtyWorktreeDigest = ownValue(input, 'dirtyWorktreeDigest')
  const contractRevision = ownValue(input, 'contractRevision')
  const hostCapabilityBasis = ownValue(input, 'hostCapabilityBasis')

  if (!Number.isInteger(sourceRevision.value) || sourceRevision.value < 0) throw invalidEvidenceInput()
  if (!boundedString(contractRevision.value) || !boundedString(hostCapabilityBasis.value)) throw invalidEvidenceInput()
  if (dirtyWorktreeDigest.present && dirtyWorktreeDigest.value !== null && !validDigest(dirtyWorktreeDigest.value)) {
    throw invalidEvidenceInput()
  }

  return {
    sourceRevision: sourceRevision.value,
    dirtyWorktreeDigest: dirtyWorktreeDigest.present ? dirtyWorktreeDigest.value : null,
    inputPaths: pathList(input, 'inputPaths').map((relativePath) => safeFileDigest(target, relativePath)),
    generatedArtifacts: pathList(input, 'generatedArtifacts').map((relativePath) => safeFileDigest(target, relativePath)),
    configuration: configurationEntries(input),
    contractRevision: contractRevision.value,
    environmentFingerprint: environmentFingerprint(),
    hostCapabilityBasis: hostCapabilityBasis.value,
  }
}

function dependencyMetadata(record) {
  const dependencies = ownValue(record, 'dependencies')
  return safePlainObject(dependencies.value) ? dependencies.value : null
}

function checkedPathGroup(target, declared, reasonCodes, mismatchReasonCode) {
  if (!Array.isArray(declared)) return []
  const checked = []
  for (const item of declared) {
    if (!safePlainObject(item)) {
      checked.push({ path: null, declaredDigest: null, currentDigest: null, matches: false })
      reasonCodes.push('EVIDENCE_DEPENDENCIES_INCOMPLETE')
      continue
    }
    const pathField = ownValue(item, 'path')
    const digestField = ownValue(item, 'digest')
    if (!pathField.present || !digestField.present || !boundedString(pathField.value, 4096) || !validDigest(digestField.value)) {
      checked.push({ path: typeof pathField.value === 'string' ? pathField.value : null, declaredDigest: digestField.value ?? null, currentDigest: null, matches: false })
      reasonCodes.push('EVIDENCE_DEPENDENCIES_INCOMPLETE')
      continue
    }
    try {
      const actual = safeFileDigest(target, pathField.value)
      const matches = actual.digest === digestField.value
      checked.push({ path: actual.path, declaredDigest: digestField.value, currentDigest: actual.digest, matches })
      if (!matches) reasonCodes.push(mismatchReasonCode)
    } catch {
      checked.push({ path: pathField.value, declaredDigest: digestField.value, currentDigest: null, matches: false })
      reasonCodes.push(mismatchReasonCode)
    }
  }
  return checked
}

function validConfigurationArray(value) {
  if (!Array.isArray(value)) return false
  const keys = new Set()
  return value.every((item) => {
    if (!safePlainObject(item)) return false
    const key = ownValue(item, 'key')
    const valueDigest = ownValue(item, 'valueDigest')
    if (!key.present || !valueDigest.present || !boundedString(key.value, 256) || !validDigest(valueDigest.value) || keys.has(key.value)) return false
    keys.add(key.value)
    return true
  })
}

function validPathDependencyArray(value) {
  return Array.isArray(value) && value.every((item) => safePlainObject(item)
    && boundedString(ownValue(item, 'path').value, 4096)
    && validDigest(ownValue(item, 'digest').value))
}

function explicitCurrentValue(current, field, reasonCodes) {
  const value = ownValue(current, field)
  if (!value.present) reasonCodes.push('EVIDENCE_DEPENDENCIES_INCOMPLETE')
  return value
}

export function evaluateEvidenceFreshness(target, record, current = {}) {
  const reasonCodes = []
  const dependencies = dependencyMetadata(record)
  const checkedDependencies = {
    inputPaths: [], generatedArtifacts: [], configuration: [],
    stateRevision: false, sourceRevision: false, dirtyWorktreeDigest: false, contractRevision: false,
    environmentFingerprint: false, hostCapabilityBasis: false,
  }

  const recordStateRevision = ownValue(record, 'stateRevision')
  const declaredDirtyWorktreeDigest = dependencies ? ownValue(dependencies, 'dirtyWorktreeDigest') : { present: false, value: undefined }
  const complete = dependencies
    && Number.isInteger(recordStateRevision.value)
    && recordStateRevision.value >= 0
    && Number.isInteger(ownValue(dependencies, 'sourceRevision').value)
    && ownValue(dependencies, 'sourceRevision').value >= 0
    && declaredDirtyWorktreeDigest.present
    && (declaredDirtyWorktreeDigest.value === null || validDigest(declaredDirtyWorktreeDigest.value))
    && validPathDependencyArray(ownValue(dependencies, 'inputPaths').value)
    && validPathDependencyArray(ownValue(dependencies, 'generatedArtifacts').value)
    && validConfigurationArray(ownValue(dependencies, 'configuration').value)
    && boundedString(ownValue(dependencies, 'contractRevision').value)
    && boundedString(ownValue(dependencies, 'environmentFingerprint').value)
    && boundedString(ownValue(dependencies, 'hostCapabilityBasis').value)

  if (!complete) reasonCodes.push('EVIDENCE_DEPENDENCIES_INCOMPLETE')
  if (dependencies) {
    checkedDependencies.inputPaths = checkedPathGroup(
      target,
      ownValue(dependencies, 'inputPaths').value,
      reasonCodes,
      'EVIDENCE_INPUT_DIGEST_MISMATCH',
    )
    checkedDependencies.generatedArtifacts = checkedPathGroup(
      target,
      ownValue(dependencies, 'generatedArtifacts').value,
      reasonCodes,
      'EVIDENCE_ARTIFACT_DIGEST_MISMATCH',
    )

    const currentStateRevision = explicitCurrentValue(current, 'stateRevision', reasonCodes)
    const currentSourceRevision = explicitCurrentValue(current, 'sourceRevision', reasonCodes)
    const currentDirtyWorktreeDigest = explicitCurrentValue(current, 'dirtyWorktreeDigest', reasonCodes)
    const currentContractRevision = explicitCurrentValue(current, 'contractRevision', reasonCodes)
    const currentEnvironmentFingerprint = explicitCurrentValue(current, 'environmentFingerprint', reasonCodes)
    const currentHostCapabilityBasis = explicitCurrentValue(current, 'hostCapabilityBasis', reasonCodes)
    const comparisons = [
      ['stateRevision', recordStateRevision.value, currentStateRevision.value, 'EVIDENCE_STATE_REVISION_MISMATCH'],
      ['sourceRevision', ownValue(dependencies, 'sourceRevision').value, currentSourceRevision.value, 'EVIDENCE_SOURCE_REVISION_MISMATCH'],
      ['dirtyWorktreeDigest', declaredDirtyWorktreeDigest.value, currentDirtyWorktreeDigest.value, 'EVIDENCE_DIRTY_WORKTREE_MISMATCH'],
      ['contractRevision', ownValue(dependencies, 'contractRevision').value, currentContractRevision.value, 'EVIDENCE_CONTRACT_REVISION_MISMATCH'],
      ['environmentFingerprint', ownValue(dependencies, 'environmentFingerprint').value, currentEnvironmentFingerprint.value, 'EVIDENCE_ENVIRONMENT_MISMATCH'],
      ['hostCapabilityBasis', ownValue(dependencies, 'hostCapabilityBasis').value, currentHostCapabilityBasis.value, 'EVIDENCE_HOST_CAPABILITY_MISMATCH'],
    ]
    for (const [field, declared, actual, reasonCode] of comparisons) {
      const currentPresent = ownValue(current, field).present
      const matches = currentPresent && declared === actual
      checkedDependencies[field] = matches
      if (!matches) reasonCodes.push(reasonCode)
    }

    const currentConfigurationField = explicitCurrentValue(current, 'configuration', reasonCodes)
    const currentConfiguration = currentConfigurationField.value
    if (!validConfigurationArray(currentConfiguration)) reasonCodes.push('EVIDENCE_DEPENDENCIES_INCOMPLETE')
    const currentMap = new Map(validConfigurationArray(currentConfiguration)
      ? currentConfiguration.map((item) => [ownValue(item, 'key').value, ownValue(item, 'valueDigest').value])
      : [])
    const declaredConfiguration = ownValue(dependencies, 'configuration').value
    const declaredMap = new Map(validConfigurationArray(declaredConfiguration)
      ? declaredConfiguration.map((item) => [ownValue(item, 'key').value, ownValue(item, 'valueDigest').value])
      : [])
    const allConfigurationKeys = [...new Set([...declaredMap.keys(), ...currentMap.keys()])].sort((left, right) => left.localeCompare(right))
    for (const key of allConfigurationKeys) {
      const declaredDigest = declaredMap.get(key) ?? null
      const actualDigest = currentMap.get(key) ?? null
      const matches = declaredDigest !== null && actualDigest !== null && declaredDigest === actualDigest
      checkedDependencies.configuration.push({ key, declaredDigest, currentDigest: actualDigest, matches })
      if (!matches) reasonCodes.push('EVIDENCE_CONFIGURATION_MISMATCH')
    }
  }

  const uniqueReasons = [...new Set(reasonCodes)].sort()
  return {
    current: uniqueReasons.length === 0,
    downgraded: uniqueReasons.includes('EVIDENCE_DEPENDENCIES_INCOMPLETE'),
    reasonCodes: uniqueReasons,
    checkedDependencies,
  }
}

function envelope(status, reasonCode, message, projectState, activeChange, evidenceRefs = [], requiredActions = []) {
  return createResultEnvelope({
    status,
    stage: 'close',
    reasonCode,
    message,
    changeId: typeof activeChange?.changeId === 'string' ? activeChange.changeId : null,
    taskId: null,
    stateRevision: Number.isInteger(projectState?.stateRevision) ? projectState.stateRevision : null,
    requiredActions,
    artifactRefs: [],
    evidenceRefs,
    diagnostics: reasonCode === 'READY' ? [] : [{ code: reasonCode }],
    safeToRetry: status !== 'complete',
  })
}

function evidenceId(record) {
  for (const field of ['evidenceId', 'eventId', 'recordId', 'operationId']) {
    const value = ownValue(record, field).value
    if (boundedString(value)) return value
  }
  return null
}

export function isEvidenceLevel(value) {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(EVIDENCE_LEVEL_RANK, value)
}

export function evidenceLevelCompatible(status, evidenceLevel) {
  if (!EVIDENCE_STATUSES.includes(status) || !isEvidenceLevel(evidenceLevel)) return false
  if (status === 'result') return evidenceLevel === 'result' || evidenceLevel === 'external-required'
  if (evidenceLevel === 'external-required') return false
  return evidenceLevel.startsWith(STATUS_LEVEL_PREFIX[status])
}

export function evaluateEvidenceClaim({
  status,
  evidenceLevel,
  requiredEvidenceLevel,
} = {}) {
  if (!evidenceLevelCompatible(status, evidenceLevel)
    || !isEvidenceLevel(requiredEvidenceLevel)) {
    return {
      valid: false,
      reasonCode: 'EVIDENCE_STATUS_LEVEL_MISMATCH',
    }
  }
  if (status !== 'result'
    && (requiredEvidenceLevel === 'external-required'
      || EVIDENCE_LEVEL_RANK[evidenceLevel]
        < EVIDENCE_LEVEL_RANK[requiredEvidenceLevel])) {
    return {
      valid: false,
      reasonCode: 'EVIDENCE_LEVEL_INSUFFICIENT',
    }
  }
  return { valid: true, reasonCode: 'READY' }
}

export function evaluateCriterionBinding(record = {}) {
  const criterionFields = ['criterionId', 'blocking', 'disposition']
  const fields = [...criterionFields, 'evidenceRefs']
  const values = Object.fromEntries(fields.map((field) => [field, ownValue(record, field)]))
  const declared = criterionFields.some((field) => values[field].present)
  if (!declared) return { valid: true, declared: false, reasonCode: 'READY' }

  if (!fields.every((field) => values[field].present)
    || !boundedString(values.criterionId.value, 128)
    || typeof values.blocking.value !== 'boolean'
    || !CRITERION_DISPOSITIONS.includes(values.disposition.value)
    || !Array.isArray(values.evidenceRefs.value)
    || values.evidenceRefs.value.length === 0
    || values.evidenceRefs.value.length > 256
    || values.evidenceRefs.value.some((reference) => !boundedString(reference, 4096))
    || new Set(values.evidenceRefs.value).size !== values.evidenceRefs.value.length) {
    return {
      valid: false,
      declared: true,
      reasonCode: 'CRITERION_BINDING_INCOMPLETE',
    }
  }

  const status = ownValue(record, 'status').value
  if ((status === 'verified' || status === 'accepted')
    && values.disposition.value !== 'passed') {
    return {
      valid: false,
      declared: true,
      reasonCode: values.blocking.value
        ? 'BLOCKING_CRITERION_UNRESOLVED'
        : 'CRITERION_NOT_PASSED',
    }
  }

  return { valid: true, declared: true, reasonCode: 'READY' }
}

export function evaluatePositiveSliceClaim(state, evidenceRecords = []) {
  const claimedStatus = state?.currentSlice?.status
  if (claimedStatus !== 'verified' && claimedStatus !== 'accepted') {
    return { valid: true, applicable: false, reasonCode: 'READY', proofEventIds: [] }
  }
  if (Array.isArray(state.blockedGates) && state.blockedGates.length > 0) {
    return {
      valid: false,
      applicable: true,
      reasonCode: 'POSITIVE_CLAIM_BLOCKED_GATES',
      proofEventIds: [],
    }
  }

  const scopeIds = new Set([
    state.currentSlice?.id,
    state.activeChangeId,
  ].filter((value) => typeof value === 'string' && value.length > 0))
  const proof = (Array.isArray(evidenceRecords) ? evidenceRecords : []).filter((record) => {
    const statusAuthorizes = record?.status === claimedStatus
      || (claimedStatus === 'verified' && record?.status === 'accepted')
    return record?.stateRevision === state.stateRevision
      && (scopeIds.has(record?.changeId) || scopeIds.has(record?.taskId))
      && statusAuthorizes
      && evaluateEvidenceClaim(record).valid
      && evaluateCriterionBinding(record).valid
  })
  if (proof.length === 0) {
    return {
      valid: false,
      applicable: true,
      reasonCode: 'POSITIVE_CLAIM_PROOF_MISSING',
      proofEventIds: [],
    }
  }

  return {
    valid: true,
    applicable: true,
    reasonCode: 'READY',
    proofEventIds: proof
      .map((record) => (
        record.eventId
        ?? record.evidenceId
        ?? record.recordId
        ?? record.operationId
      ))
      .filter(Boolean),
  }
}

function evidenceFileCurrent(target, record) {
  const evidenceFile = ownValue(record, 'evidenceFile')
  if (!evidenceFile.present || !boundedString(evidenceFile.value, 4096)) return false
  try {
    safeFileDigest(target, evidenceFile.value)
    return true
  } catch {
    return false
  }
}

export function evaluateCloseConsistency(target, {
  projectState,
  activeChange,
  evidenceRecords,
  currentDependencies,
  pendingTransactions,
  requestedStatus = 'verified',
} = {}) {
  if (Array.isArray(pendingTransactions) && pendingTransactions.length > 0) {
    return envelope('blocked', 'RECOVERY_REQUIRED', 'Pending transactions must be recovered before Close.', projectState, activeChange, [], ['Recover pending transactions before retrying Close.'])
  }

  const revisionMatches = Number.isInteger(projectState?.stateRevision)
    && projectState.stateRevision === activeChange?.stateRevision
  const changeMatches = boundedString(projectState?.activeChangeId)
    && projectState.activeChangeId === activeChange?.changeId
  if (!revisionMatches || !changeMatches) {
    return envelope('blocked', 'STATE_ARTIFACT_CONTRADICTION', 'Project state and active Change identity or revision disagree.', projectState, activeChange)
  }

  try {
    const derived = deriveActiveChange(target, activeChange.changeId, { stateRevision: projectState.stateRevision })
    const comparison = derived ? compareDerivedChange(activeChange, derived) : { status: 'blocked' }
    if (!derived || comparison.status !== 'proceed') {
      return envelope('blocked', 'STATE_ARTIFACT_CONTRADICTION', 'The active Change cache contradicts current source artifacts.', projectState, activeChange)
    }
  } catch {
    return envelope('blocked', 'STATE_ARTIFACT_CONTRADICTION', 'The active Change cache could not be reconciled with current source artifacts.', projectState, activeChange)
  }

  if (!Array.isArray(evidenceRecords) || evidenceRecords.some((record) => !safePlainObject(record))) {
    return envelope('blocked', 'EVIDENCE_RECORD_MALFORMED', 'Malformed evidence records cannot authorize Close.', projectState, activeChange)
  }
  const relevant = evidenceRecords.filter((record) => ownValue(record, 'changeId').value === activeChange.changeId
    && ownValue(record, 'stateRevision').value === projectState.stateRevision)

  const invalidRecord = relevant.some((record) => {
    const status = ownValue(record, 'status')
    const evidenceLevel = ownValue(record, 'evidenceLevel')
    const requiredEvidenceLevel = ownValue(record, 'requiredEvidenceLevel')
    const claim = ownValue(record, 'claim')
    const identifier = evidenceId(record)
    const evaluation = evaluateEvidenceClaim({
      status: status.value,
      evidenceLevel: evidenceLevel.value,
      requiredEvidenceLevel: requiredEvidenceLevel.value,
    })
    const criterion = evaluateCriterionBinding(record)
    return !status.present || !evidenceLevel.present
      || !requiredEvidenceLevel.present
      || !claim.present || !boundedString(claim.value)
      || !evaluation.valid
      || !criterion.valid
      || identifier === null
  })
  if (invalidRecord) {
    return envelope('blocked', 'EVIDENCE_LEVEL_INSUFFICIENT', 'Evidence identity, status, and levels must be explicit and compatible before Close.', projectState, activeChange)
  }

  const requestedLevel = EVIDENCE_STATUSES.includes(requestedStatus) ? requestedStatus : null
  const proof = relevant.filter((record) => {
    const status = ownValue(record, 'status').value
    return status === requestedLevel
      || (requestedLevel === 'verified' && status === 'accepted')
  })
  if (proof.length === 0) {
    const resultOnlyPromotion = relevant.some((record) => ownValue(record, 'status').value === 'result')
      && (requestedLevel === 'verified' || requestedLevel === 'accepted')
    if (resultOnlyPromotion) {
      return envelope('blocked', 'EVIDENCE_LEVEL_INSUFFICIENT', 'Close cannot promote evidence above its recorded level.', projectState, activeChange)
    }
    return envelope('blocked', 'EVIDENCE_CURRENT_PROOF_MISSING', 'No current evidence at the requested status proves the active Change.', projectState, activeChange)
  }

  if (!safePlainObject(currentDependencies)) {
    return envelope('blocked', 'EVIDENCE_DEPENDENCIES_INCOMPLETE', 'Independent current evidence dependencies are required for Close.', projectState, activeChange)
  }

  if (proof.some((record) => !evidenceFileCurrent(target, record))) {
    return envelope('blocked', 'EVIDENCE_FILE_MISSING', 'A current authorizing evidence artifact is missing or unsafe.', projectState, activeChange)
  }

  const stale = proof.filter((record) => !evaluateEvidenceFreshness(target, record, currentDependencies).current)
  if (stale.length > 0) {
    return envelope('blocked', 'EVIDENCE_STALE', 'Required evidence is stale for the current project state.', projectState, activeChange)
  }

  const evidenceRefs = [...new Set(proof.map(evidenceId).filter(Boolean))].sort()
  return envelope('complete', 'READY', 'Close consistency checks passed.', projectState, activeChange, evidenceRefs)
}
