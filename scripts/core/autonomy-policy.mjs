const MODES = Object.freeze(['guided', 'bounded', 'autonomous'])
const DOWNGRADE_SIGNALS = Object.freeze([
  'validationFailure',
  'stateDrift',
  'unauthorizedOperationAttempt',
  'falseCompletionClaim',
  'repeatedRework',
])

export const AUTONOMY_INVARIANTS = Object.freeze({
  permissions: 'unchanged',
  securityBoundaries: 'unchanged',
  evidenceThresholds: 'unchanged',
  externalAuthorization: 'unchanged',
  destructiveAuthorization: 'unchanged',
  acceptanceAuthority: 'unchanged',
})

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasConcreteEvidence(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return normalized.length > 0 && !['-', 'n/a', 'none', 'unknown', 'tbd', 'todo', 'self-claimed'].includes(normalized)
}

function verifiedCapabilityBasis(value) {
  if (!Array.isArray(value)) return []
  const accepted = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const capability = typeof item.capability === 'string' ? item.capability.trim().toLowerCase() : ''
    const source = typeof item.source === 'string' ? item.source.trim().toLowerCase() : ''
    if (
      capability.length === 0
      || item.status !== 'verified'
      || !hasConcreteEvidence(item.evidence)
      || ['model-name', 'model-self-claim', 'runtime-self-claim'].includes(source)
    ) continue
    accepted.push(capability)
  }
  return [...new Set(accepted)].sort()
}

function activeDowngrades(value) {
  if (!isRecord(value)) return []
  return DOWNGRADE_SIGNALS.filter((signal) => value[signal] === true)
}

function policyFor(mode, taskProfile) {
  if (mode === 'autonomous') {
    return {
      planningGranularity: 'outcome-focused',
      checkpointCadence: taskProfile === 'enterprise' ? 'risk-boundary' : 'completion-boundary',
      reportingCadence: 'exception-and-completion',
    }
  }
  if (mode === 'bounded') {
    return {
      planningGranularity: 'bounded',
      checkpointCadence: 'risk-boundary',
      reportingCadence: 'milestone',
    }
  }
  return {
    planningGranularity: 'detailed',
    checkpointCadence: 'each-step',
    reportingCadence: 'frequent',
  }
}

export function resolveAutonomyPolicy(input = {}) {
  const safeInput = isRecord(input) ? input : {}
  const taskProfile = isRecord(safeInput.taskProfile) ? safeInput.taskProfile : {}
  const selectedProfile = ['lite', 'standard', 'enterprise'].includes(taskProfile.taskProfile)
    ? taskProfile.taskProfile
    : ['lite', 'standard', 'enterprise'].includes(taskProfile.selectedProfile)
      ? taskProfile.selectedProfile
      : 'enterprise'
  const capabilityBasis = verifiedCapabilityBasis(safeInput.capabilities)
  const downgradeSignals = activeDowngrades(safeInput.reliabilitySignals)
  const unresolvedRisk = taskProfile.status !== 'proceed'
    || taskProfile.reasonCode === 'HARD_RISK_UNKNOWN'
    || taskProfile.reasonCode === 'HARD_RISK_POLICY_INVALID'

  let mode = 'guided'
  const reasonCodes = []
  if (unresolvedRisk) {
    reasonCodes.push('TASK_RISK_UNRESOLVED')
  } else if (downgradeSignals.length > 0) {
    reasonCodes.push('RELIABILITY_DOWNGRADE')
  } else if (capabilityBasis.length >= 4) {
    mode = 'autonomous'
    reasonCodes.push('VERIFIED_CAPABILITY_THRESHOLD_AUTONOMOUS')
  } else if (capabilityBasis.length >= 2) {
    mode = 'bounded'
    reasonCodes.push('VERIFIED_CAPABILITY_THRESHOLD_BOUNDED')
  } else {
    reasonCodes.push(capabilityBasis.length === 0 ? 'NO_VERIFIED_CAPABILITY' : 'INSUFFICIENT_VERIFIED_CAPABILITY')
  }

  const cadence = policyFor(mode, selectedProfile)
  return {
    mode: MODES.includes(mode) ? mode : 'guided',
    ...cadence,
    reasonCodes,
    capabilityBasis,
    downgradeSignals,
    invariants: { ...AUTONOMY_INVARIANTS },
  }
}
