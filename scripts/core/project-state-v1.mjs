import crypto from 'node:crypto'

export const PROJECT_STATE_V1_FIELDS = Object.freeze([
  'schemaVersion',
  'stateRevision',
  'sourceRevision',
  'projectName',
  'mode',
  'canonicalGoalSource',
  'canonicalPlan',
  'phase',
  'currentSummary',
  'currentSlice',
  'toolStatuses',
  'lastEvidence',
  'blockedGates',
  'nextChecks',
  'residualRisks',
  'riskHistoryPath',
  'archivedRiskCount',
  'activeChangeId',
  'updatedAt',
])

const LEGACY_FIELDS = new Set([...PROJECT_STATE_V1_FIELDS, 'toolStatus', 'riskArchive'])
const ARRAY_FIELDS = new Set(['blockedGates', 'nextChecks', 'residualRisks'])
const OBJECT_FIELDS = new Set(['toolStatuses'])
const LEGACY_OBJECT_OR_STRING_FIELDS = new Set(['currentSummary', 'currentSlice'])
const RISK_HISTORY_PATH = '.gse/risk-history.jsonl'

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!isPlainObject(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
}

function valuesEqual(left, right) {
  try {
    return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right))
  } catch {
    return false
  }
}

function normalizedRiskText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function riskIdentity(risk) {
  return crypto.createHash('sha256').update(risk, 'utf8').digest('hex')
}

function archiveTimestamp(value, fallback) {
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString()
  }
  return fallback
}

function archiveCandidates(state, activeRiskLimit, archivedAt) {
  const residualRisks = Array.isArray(state.residualRisks)
    ? state.residualRisks.map(normalizedRiskText).filter(Boolean)
    : []
  const keep = residualRisks.slice(0, activeRiskLimit)
  const candidates = residualRisks.slice(activeRiskLimit).map((risk) => ({
    risk,
    archivedAt,
    resolution: 'Archived by GSE Core v1 migration to keep active project state compact.',
  }))

  if (Array.isArray(state.riskArchive)) {
    for (const item of state.riskArchive) {
      if (typeof item === 'string') {
        const risk = normalizedRiskText(item)
        if (risk) candidates.push({ risk, archivedAt, resolution: 'Migrated from legacy project-state riskArchive.' })
        continue
      }
      if (!isPlainObject(item)) continue
      const risk = normalizedRiskText(item.risk)
      if (!risk) continue
      candidates.push({
        risk,
        archivedAt: archiveTimestamp(item.archivedAt, archivedAt),
        resolution: typeof item.resolution === 'string' && item.resolution.trim()
          ? item.resolution.trim()
          : 'Migrated from legacy project-state riskArchive.',
      })
    }
  }

  const events = []
  const seen = new Set()
  for (const candidate of candidates) {
    const digest = riskIdentity(candidate.risk)
    if (seen.has(digest)) continue
    seen.add(digest)
    events.push({
      schemaVersion: 1,
      eventId: `risk-${digest}`,
      transactionId: null,
      recordType: 'risk-history',
      riskId: `risk-${digest}`,
      deduplicationKey: `sha256:${digest}`,
      risk: candidate.risk,
      sourceRevision: Number.isInteger(state.stateRevision) && state.stateRevision >= 0 ? state.stateRevision : 0,
      archivedAt: candidate.archivedAt,
      resolution: candidate.resolution,
      stateRevision: 0,
    })
  }

  return { keep, events }
}

function diagnostic(code, field = null) {
  return field === null ? { code } : { code, field }
}

function validateKnownFields(state) {
  const diagnostics = []
  for (const key of Object.keys(state)) {
    if (!LEGACY_FIELDS.has(key)) diagnostics.push(diagnostic('UNSUPPORTED_PROJECT_STATE_FIELD', key))
  }
  for (const field of ARRAY_FIELDS) {
    if (Object.hasOwn(state, field) && !Array.isArray(state[field])) diagnostics.push(diagnostic('INVALID_PROJECT_STATE_FIELD', field))
  }
  for (const field of OBJECT_FIELDS) {
    if (Object.hasOwn(state, field) && state[field] !== null && !isPlainObject(state[field])) diagnostics.push(diagnostic('INVALID_PROJECT_STATE_FIELD', field))
  }
  for (const field of LEGACY_OBJECT_OR_STRING_FIELDS) {
    if (Object.hasOwn(state, field) && state[field] !== null && typeof state[field] !== 'string' && !isPlainObject(state[field])) {
      diagnostics.push(diagnostic('INVALID_PROJECT_STATE_FIELD', field))
    }
  }
  if (Array.isArray(state.residualRisks) && state.residualRisks.some((risk) => typeof risk !== 'string')) {
    diagnostics.push(diagnostic('INVALID_PROJECT_STATE_FIELD', 'residualRisks'))
  }
  if (Object.hasOwn(state, 'riskArchive') && !Array.isArray(state.riskArchive)) {
    diagnostics.push(diagnostic('INVALID_PROJECT_STATE_FIELD', 'riskArchive'))
  }
  if (Object.hasOwn(state, 'archivedRiskCount') && (!Number.isInteger(state.archivedRiskCount) || state.archivedRiskCount < 0)) {
    diagnostics.push(diagnostic('INVALID_PROJECT_STATE_FIELD', 'archivedRiskCount'))
  }
  if (Object.hasOwn(state, 'riskHistoryPath') && state.riskHistoryPath !== RISK_HISTORY_PATH) {
    diagnostics.push(diagnostic('INVALID_PROJECT_STATE_FIELD', 'riskHistoryPath'))
  }
  return diagnostics
}

export function inspectProjectStateV1(state, options = {}) {
  const activeRiskLimit = Number.isInteger(options.activeRiskLimit) && options.activeRiskLimit >= 0
    ? options.activeRiskLimit
    : 6
  const archivedAt = archiveTimestamp(
    options.archivedAt ?? state?.updatedAt,
    '1970-01-01T00:00:00.000Z',
  )

  if (!isPlainObject(state)) {
    return {
      classification: 'invalid',
      reasonCode: 'INVALID_PROJECT_STATE',
      diagnostics: [diagnostic('PROJECT_STATE_NOT_OBJECT')],
      normalizedState: null,
      riskHistoryEvents: [],
    }
  }

  const isEmpty = Object.keys(state).length === 0
  const diagnostics = validateKnownFields(state)
  if (!isEmpty && state.schemaVersion !== 1) diagnostics.push(diagnostic('UNSUPPORTED_PROJECT_STATE_SCHEMA', 'schemaVersion'))

  const hasToolStatuses = Object.hasOwn(state, 'toolStatuses')
  const hasToolStatus = Object.hasOwn(state, 'toolStatus')
  if (hasToolStatus && !isPlainObject(state.toolStatus)) diagnostics.push(diagnostic('INVALID_TOOL_STATUS_ALIAS', 'toolStatus'))
  if (hasToolStatuses && hasToolStatus && !valuesEqual(state.toolStatuses, state.toolStatus)) {
    diagnostics.push(diagnostic('CONFLICTING_TOOL_STATUS_ALIASES', 'toolStatus'))
  }

  if (diagnostics.length > 0) {
    return {
      classification: 'invalid',
      reasonCode: diagnostics.some((item) => item.code === 'CONFLICTING_TOOL_STATUS_ALIASES')
        ? 'CONFLICTING_TOOL_STATUS_ALIASES'
        : 'INVALID_PROJECT_STATE',
      diagnostics,
      normalizedState: null,
      riskHistoryEvents: [],
    }
  }

  const revisionCanonical = Number.isInteger(state.stateRevision) && state.stateRevision >= 0
  const activeChangeCanonical = Object.hasOwn(state, 'activeChangeId')
    && (state.activeChangeId === null || typeof state.activeChangeId === 'string')
  if (Object.hasOwn(state, 'stateRevision') && !revisionCanonical) {
    return {
      classification: 'invalid',
      reasonCode: 'INVALID_PROJECT_STATE',
      diagnostics: [diagnostic('INVALID_PROJECT_STATE_FIELD', 'stateRevision')],
      normalizedState: null,
      riskHistoryEvents: [],
    }
  }
  if (Object.hasOwn(state, 'activeChangeId') && !activeChangeCanonical) {
    return {
      classification: 'invalid',
      reasonCode: 'INVALID_PROJECT_STATE',
      diagnostics: [diagnostic('INVALID_PROJECT_STATE_FIELD', 'activeChangeId')],
      normalizedState: null,
      riskHistoryEvents: [],
    }
  }

  const { keep, events } = archiveCandidates(state, activeRiskLimit, archivedAt)
  const normalizedState = {}
  for (const field of PROJECT_STATE_V1_FIELDS) {
    if (Object.hasOwn(state, field)) normalizedState[field] = state[field]
  }
  normalizedState.schemaVersion = 1
  normalizedState.stateRevision = revisionCanonical ? state.stateRevision : 0
  normalizedState.activeChangeId = activeChangeCanonical ? state.activeChangeId : null
  if (!hasToolStatuses && hasToolStatus) normalizedState.toolStatuses = state.toolStatus
  if (Object.hasOwn(state, 'residualRisks') || events.length > 0) normalizedState.residualRisks = keep
  if (events.length > 0 || state.riskHistoryPath === RISK_HISTORY_PATH) {
    normalizedState.riskHistoryPath = RISK_HISTORY_PATH
    normalizedState.archivedRiskCount = (Number.isInteger(state.archivedRiskCount) ? state.archivedRiskCount : 0) + events.length
  }

  const canonical = revisionCanonical
    && activeChangeCanonical
    && !hasToolStatus
    && !Object.hasOwn(state, 'riskArchive')
    && events.length === 0
    && valuesEqual(state, normalizedState)

  return {
    classification: canonical ? 'canonical' : 'migratable',
    reasonCode: canonical ? 'PROJECT_STATE_V1_CANONICAL' : 'PROJECT_STATE_V1_MIGRATION_AVAILABLE',
    diagnostics: canonical ? [] : [diagnostic('PROJECT_STATE_V1_MIGRATION_AVAILABLE')],
    normalizedState,
    riskHistoryEvents: events,
    activeRiskCount: keep.length,
    archivedRiskCount: normalizedState.archivedRiskCount ?? 0,
  }
}

export function readCompatibleRiskSummary(state, externalArchivedCount = null) {
  const residualRisks = Array.isArray(state?.residualRisks)
    ? state.residualRisks.filter((risk) => typeof risk === 'string')
    : []
  const embeddedArchivedCount = Array.isArray(state?.riskArchive) ? state.riskArchive.length : 0
  const declaredArchivedCount = Number.isInteger(state?.archivedRiskCount) && state.archivedRiskCount >= 0
    ? state.archivedRiskCount
    : 0
  return {
    residualRisks,
    archivedRiskCount: Number.isInteger(externalArchivedCount) && externalArchivedCount >= 0
      ? externalArchivedCount
      : Math.max(embeddedArchivedCount, declaredArchivedCount),
    riskHistoryPath: state?.riskHistoryPath === RISK_HISTORY_PATH ? RISK_HISTORY_PATH : null,
  }
}
