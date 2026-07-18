const STOPPED_HOST_STATUSES = new Set(['cancelled', 'canceled', 'paused', 'ended', 'replaced'])

export const ADMISSION_CLAIM_BOUNDARY = 'Portable GSE admission is advisory and does not create, dispatch, or complete a host task without host evidence.'

function normalized(value) {
  return String(value ?? '').trim().toLowerCase()
}

function validPlanUnitId(value) {
  return /^plan-[a-f0-9]{16}$/.test(String(value ?? '').trim()) || /^[-a-z0-9][a-z0-9._-]{2,127}$/i.test(String(value ?? '').trim())
}

function boundedInteger(value, fallback = 0) {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : fallback
}

function result({ decision, routing, reasonCode, activeCount, workerBudget, fallbackMode = null }) {
  const topLevelPlanUnitId = String(routing?.topLevelPlanUnitId ?? '').trim() || null
  return {
    decision,
    topLevelPlanUnitId,
    reasonCode,
    budget: {
      activeTasks: activeCount,
      maxTasks: workerBudget.maxTasks,
      activeWorkers: workerBudget.activeWorkers,
      maxWorkers: workerBudget.maxWorkers,
      remainingTasks: Math.max(0, workerBudget.maxTasks - activeCount),
      remainingWorkers: Math.max(0, workerBudget.maxWorkers - workerBudget.activeWorkers),
    },
    fallbackMode,
    persistence: decision === 'admit' ? 'global-task-eligible' : 'internal-only',
    visibility: decision === 'admit' ? 'user-visible' : 'internal',
    globalTaskEligible: decision === 'admit',
    hostDispatchObserved: false,
    claimBoundary: ADMISSION_CLAIM_BOUNDARY,
  }
}

export function evaluateTaskAdmission({
  routing = null,
  hostLifecycleStatus = 'unknown',
  activePlanUnitIds = [],
  workerBudget = {},
  adapter = {},
} = {}) {
  const normalizedRouting = routing && typeof routing === 'object' ? routing : null
  const planUnitId = String(normalizedRouting?.topLevelPlanUnitId ?? '').trim()
  const activeIds = new Set((Array.isArray(activePlanUnitIds) ? activePlanUnitIds : []).map((id) => String(id).trim()).filter(Boolean))
  const maxTasks = boundedInteger(workerBudget.maxTasks, 1)
  const maxWorkers = boundedInteger(workerBudget.maxWorkers, 1)
  const activeTasks = boundedInteger(workerBudget.activeTasks, activeIds.size)
  const activeWorkers = boundedInteger(workerBudget.activeWorkers, 0)
  const budget = { maxTasks, maxWorkers, activeTasks, activeWorkers }
  const status = normalized(hostLifecycleStatus)

  if (!normalizedRouting || !validPlanUnitId(planUnitId)) return result({ decision: 'blocked', routing: normalizedRouting, reasonCode: 'invalid-plan-unit-id', activeCount: activeTasks, workerBudget: budget })
  if (STOPPED_HOST_STATUSES.has(status)) return result({ decision: 'blocked', routing: normalizedRouting, reasonCode: 'host-lifecycle-stopped', activeCount: activeTasks, workerBudget: budget })
  if (normalizedRouting.workClass !== 'plan-unit' || normalizedRouting.scope !== 'top-level') return result({ decision: 'blocked', routing: normalizedRouting, reasonCode: 'not-top-level-plan-unit', activeCount: activeTasks, workerBudget: budget })
  if (!normalizedRouting.selected || !normalizedRouting.globalTaskEligible || normalizedRouting.taskCreationIntent !== 'create') return result({ decision: 'blocked', routing: normalizedRouting, reasonCode: 'not-selected-for-admission', activeCount: activeTasks, workerBudget: budget })
  if (activeIds.has(planUnitId)) return result({ decision: 'reuse', routing: normalizedRouting, reasonCode: 'plan-unit-already-active', activeCount: activeTasks, workerBudget: budget })

  const adapterVerified = adapter?.status === 'verified' && adapter?.canCreateTask === true
  const taskAvailable = activeTasks < maxTasks
  const workerAvailable = activeWorkers < maxWorkers
  if (!adapterVerified || !taskAvailable || !workerAvailable) {
    return result({
      decision: 'sequential-fallback',
      routing: normalizedRouting,
      reasonCode: !adapterVerified ? 'adapter-unavailable' : !taskAvailable ? 'task-budget-exhausted' : 'worker-budget-exhausted',
      activeCount: activeTasks,
      workerBudget: budget,
      fallbackMode: 'sequential-fallback',
    })
  }
  return result({ decision: 'admit', routing: normalizedRouting, reasonCode: 'selected-within-budget', activeCount: activeTasks, workerBudget: budget })
}

export { STOPPED_HOST_STATUSES }
