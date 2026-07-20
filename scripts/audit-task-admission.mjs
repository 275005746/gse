#!/usr/bin/env node
import { evaluateTaskAdmission } from './task-admission.mjs'

const valid = {
  workClass: 'plan-unit',
  scope: 'top-level',
  visibility: 'user-visible',
  persistence: 'global-task-eligible',
  globalTaskEligible: true,
  topLevelPlanUnitId: 'plan-0123456789abcdef',
  taskCreationIntent: 'create',
  selected: true,
}

const checks = []
function check(id, label, ok, evidence) {
  checks.push({ id, label, status: ok ? 'passed' : 'failed', evidence })
}

const admitted = evaluateTaskAdmission({ routing: valid, adapter: { status: 'verified', canCreateTask: true }, workerBudget: { maxTasks: 1, maxWorkers: 2 } })
const reused = evaluateTaskAdmission({ routing: valid, activePlanUnitIds: [valid.topLevelPlanUnitId], adapter: { status: 'verified', canCreateTask: true }, workerBudget: { maxTasks: 1, maxWorkers: 2 } })
const internal = evaluateTaskAdmission({ routing: { ...valid, workClass: 'execution-action', scope: 'operational' } })
const unselected = evaluateTaskAdmission({ routing: { ...valid, selected: false, taskCreationIntent: 'none' } })
const stopped = evaluateTaskAdmission({ routing: valid, hostLifecycleStatus: 'cancelled' })
const exhausted = evaluateTaskAdmission({ routing: valid, adapter: { status: 'verified', canCreateTask: true }, workerBudget: { maxTasks: 1, activeTasks: 1, maxWorkers: 2 } })
const unavailable = evaluateTaskAdmission({ routing: valid, adapter: { status: 'unknown', canCreateTask: false }, workerBudget: { maxTasks: 1, maxWorkers: 2 } })
const invalid = evaluateTaskAdmission({ routing: { ...valid, topLevelPlanUnitId: null } })

check('ADM01', 'selected candidate admits within verified adapter and budget', admitted.decision === 'admit' && admitted.globalTaskEligible && admitted.hostDispatchObserved === false, admitted)
check('ADM02', 'same stable plan unit reuses active admission', reused.decision === 'reuse' && reused.reasonCode === 'plan-unit-already-active', reused)
check('ADM03', 'internal routing is blocked', internal.decision === 'blocked' && internal.reasonCode === 'not-top-level-plan-unit', internal)
check('ADM04', 'unselected alternatives are blocked', unselected.decision === 'blocked' && unselected.reasonCode === 'not-selected-for-admission', unselected)
check('ADM05', 'stopped host lifecycle blocks admission', stopped.decision === 'blocked' && stopped.reasonCode === 'host-lifecycle-stopped', stopped)
check('ADM06', 'exhausted task budget falls back sequentially', exhausted.decision === 'sequential-fallback' && exhausted.fallbackMode === 'sequential-fallback', exhausted)
check('ADM07', 'unavailable adapter falls back without dispatch claim', unavailable.decision === 'sequential-fallback' && unavailable.hostDispatchObserved === false, unavailable)
check('ADM08', 'missing identity fails closed', invalid.decision === 'blocked' && invalid.reasonCode === 'invalid-plan-unit-id', invalid)
check('ADM09', 'every decision preserves the claim boundary', [admitted, reused, internal, unselected, stopped, exhausted, unavailable, invalid].every((item) => item.claimBoundary && item.hostDispatchObserved === false), 'all decisions')

const failed = checks.filter((item) => item.status === 'failed').length
const report = {
  summary: { status: failed ? 'failed' : 'passed', passed: checks.length - failed, failed, total: checks.length },
  workflows: { taskAdmission: failed ? 'incomplete' : 'verified' },
  checks,
  limits: ['Portable decisions do not create host tasks, dispatch workers, or prove external acceptance.'],
}
console.log(JSON.stringify(report, null, 2))
if (failed) process.exit(1)
