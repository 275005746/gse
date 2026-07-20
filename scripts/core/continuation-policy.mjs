import crypto from 'node:crypto'

export const CONTINUATION_OUTCOMES = Object.freeze([
  'continue-now',
  'await-decision',
  'blocked',
  'rollover-required',
  'top-level-complete',
])

export const HOST_CONTINUATION_MODES = Object.freeze([
  'host-autonomous-continuation',
  'host-turn-controlled',
])

const STOPPED_HOST_STATUSES = new Set([
  'cancelled',
  'canceled',
  'paused',
  'ended',
  'replaced',
  'completed',
])
const COMPLETE_SLICE_STATUSES = new Set([
  'verified',
  'accepted',
  'complete',
  'completed',
  'closed',
  'archived',
])
const MAX_REINJECTION_CHARS = 700
const AUTHORITY_SCOPE = 'same-approved-top-level-plan-unit'
const CLAIM_BOUNDARY = 'GSE continuation is advisory; it does not create, extend, dispatch, or complete a host goal without host evidence.'

function normalizedText(value) {
  return String(value || '').replace(/\\/g, '/').replace(/\s+/g, ' ').trim()
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value)).digest('hex')}`
}

function boundedText(value, maximum = MAX_REINJECTION_CHARS) {
  const text = normalizedText(value)
  if (text.length <= maximum) return text
  return `${text.slice(0, Math.max(0, maximum - 3)).trimEnd()}...`
}

export function stablePlanUnitId(projectName, candidate = {}) {
  const semanticKey = [projectName, candidate.kind, candidate.source, candidate.outcomeHint || candidate.title]
    .map((value) => normalizedText(value).toLowerCase())
    .join('|')
  return `plan-${crypto.createHash('sha256').update(semanticKey).digest('hex').slice(0, 16)}`
}

export function negotiateContinuationMode(requestedMode) {
  return requestedMode === 'host-autonomous-continuation'
    ? 'host-autonomous-continuation'
    : 'host-turn-controlled'
}

export function resolveContinuationReliabilitySignals({
  failedHardChecks = [],
  authorityHardFailures = [],
  stateRepairStatus = 'unknown',
  evidenceLevelAnalysis = {},
} = {}) {
  const failedCheckText = [...failedHardChecks, ...authorityHardFailures]
    .map((item) => `${item?.id || ''} ${item?.label || ''} ${item?.evidence || ''}`.toLowerCase())
    .join(' ')
  return {
    validationFailure: failedHardChecks.length > 0 || authorityHardFailures.length > 0,
    stateDrift: authorityHardFailures.length > 0 || stateRepairStatus === 'repair-required',
    unauthorizedOperationAttempt: /unauthori[sz]ed|permission bypass|permission-bypass|without authorization/.test(failedCheckText),
    falseCompletionClaim: (evidenceLevelAnalysis.invalidLevel?.length || 0) > 0 || (evidenceLevelAnalysis.downgraded?.length || 0) > 0,
    repeatedRework: /repeated rework|rework loop|repeat(ed)? failure/.test(failedCheckText),
  }
}

export function buildContinuationPolicy({
  compactState,
  failedHardChecks = [],
  blockedGates = [],
  hostContinuationMode,
  hostGoalStatus,
}) {
  const mode = negotiateContinuationMode(normalizedText(hostContinuationMode).toLowerCase())
  const contextRollover = ['orange', 'red'].includes(compactState?.contextHealth?.health)
  const currentStatus = normalizedText(compactState?.currentSlice?.status).toLowerCase()
  const currentComplete = COMPLETE_SLICE_STATUSES.has(currentStatus)
  const nextAction = normalizedText(compactState?.currentSlice?.nextAction)
  const nextSlice = compactState?.nextSliceCandidates?.[0] || null
  const hostLifecycleStatus = normalizedText(hostGoalStatus).toLowerCase() || 'unknown'
  const hostLifecycleStopped = STOPPED_HOST_STATUSES.has(hostLifecycleStatus)

  const stopOutcome = hostLifecycleStopped
    ? 'blocked'
    : contextRollover
      ? 'rollover-required'
      : failedHardChecks.length > 0
        ? 'blocked'
        : blockedGates.length > 0
          ? 'await-decision'
          : currentComplete && !nextSlice
            ? 'top-level-complete'
            : 'continue-now'

  const reasonCode = hostLifecycleStopped
    ? 'HOST_LIFECYCLE_STOPPED'
    : contextRollover
      ? 'CONTEXT_ROLLOVER_REQUIRED'
      : failedHardChecks.length > 0
        ? 'HARD_PREFLIGHT_FAILED'
        : blockedGates.length > 0
          ? 'OWNER_OR_EXTERNAL_DECISION_REQUIRED'
          : currentComplete && !nextSlice
            ? 'TOP_LEVEL_PLAN_UNIT_COMPLETE'
            : nextAction
              ? 'NEXT_ACTION_READY'
              : 'CURRENT_SLICE_READY'

  return {
    mode,
    authority: 'host-goal-and-turn-lifecycle',
    stopOutcome,
    reasonCode,
    canAutoContinue: mode === 'host-autonomous-continuation' && stopOutcome === 'continue-now',
    requiresHostReinjection: mode === 'host-turn-controlled' && stopOutcome === 'continue-now',
    hostDispatchObserved: false,
    hostLifecycleStatus,
    claimBoundary: CLAIM_BOUNDARY,
  }
}

export function buildContinuationPacket({
  state,
  projectName,
  policy,
  currentSlice,
  selectedCandidate,
  taskRouting,
  taskAdmission,
  process,
  preflightStatus,
  failedHardChecks = [],
  blockedGates = [],
  contextHealth,
  latestEvidence,
  latestEvidenceLevel,
}) {
  const topLevelPlanUnitId = taskRouting?.topLevelPlanUnitId
    || state?.topLevelPlanUnitId
    || state?.currentSlice?.topLevelPlanUnitId
    || (currentSlice?.id ? `slice:${currentSlice.id}` : null)
  const next = selectedCandidate
    ? {
        kind: 'next-slice',
        sliceId: selectedCandidate.id || null,
        title: boundedText(selectedCandidate.title, 240),
        action: boundedText(selectedCandidate.actionPacket?.nextAction || selectedCandidate.reason, 480),
      }
    : {
        kind: 'current-slice',
        sliceId: currentSlice?.id || null,
        title: boundedText(currentSlice?.outcome, 240),
        action: boundedText(currentSlice?.nextAction, 480),
      }
  const sourceState = {
    revision: Number.isInteger(state?.stateRevision) && state.stateRevision >= 0 ? state.stateRevision : null,
    digest: digest(state ?? null),
  }
  const reinjectionPrompt = policy.requiresHostReinjection
    ? boundedText([
        `Continue GSE project ${projectName} within top-level Plan Unit ${topLevelPlanUnitId || 'unknown'}.`,
        `Packet outcome: ${policy.stopOutcome} (${policy.reasonCode}).`,
        `Next action: ${next.action || next.title}.`,
        'Do not expand scope, bypass permissions, or create a new top-level task.',
      ].join(' '))
    : ''
  const packet = {
    schemaVersion: 1,
    protocol: 'gse-host-native-continuation',
    packetId: '',
    sourceState,
    planUnit: {
      topLevelPlanUnitId,
      currentSliceId: currentSlice?.id || null,
    },
    next,
    decision: {
      stopOutcome: policy.stopOutcome,
      reasonCode: policy.reasonCode,
      canAutoContinue: policy.canAutoContinue,
      requiresHostReinjection: policy.requiresHostReinjection,
    },
    host: {
      negotiatedMode: policy.mode,
      lifecycleStatus: policy.hostLifecycleStatus,
      requiredCapability: policy.mode === 'host-autonomous-continuation'
        ? 'verified-or-runtime-declared-native-goal-lifecycle'
        : 'packet-reinjection',
    },
    authority: {
      owner: policy.authority,
      scope: AUTHORITY_SCOPE,
      prohibited: [
        'new-top-level-plan-unit',
        'permission-bypass',
        'external-or-destructive-action-without-authorization',
        'host-process-spawn',
      ],
      claimBoundary: policy.claimBoundary,
    },
    requirements: {
      preflight: [preflightStatus, ...failedHardChecks.slice(0, 4).map((item) => item.id)].filter(Boolean),
      admission: [taskAdmission?.status || 'unknown'],
      context: [contextHealth?.health || 'unknown', contextHealth?.action || 'none'],
      evidence: [latestEvidenceLevel || 'missing', latestEvidence?.evidenceFile || latestEvidence?.path || 'none'],
      acceptance: blockedGates.slice(0, 4).map((gate) => boundedText(gate.area || gate.id || gate, 160)),
    },
    process,
    reinjection: {
      required: policy.requiresHostReinjection,
      prompt: reinjectionPrompt,
      maxChars: MAX_REINJECTION_CHARS,
    },
    evidence: {
      stage: policy.stopOutcome === 'continue-now' ? 'recommended' : 'none',
      hostDispatchObserved: false,
      expectedReceiptFields: [
        'packetId',
        'host',
        'topLevelPlanUnitId',
        'sliceId',
        'lifecycleStage',
        'timestamp',
        'evidenceRefs',
      ],
    },
  }
  packet.packetId = `continue-${crypto.createHash('sha256').update(canonicalJson({ ...packet, packetId: undefined })).digest('hex').slice(0, 24)}`
  return packet
}
