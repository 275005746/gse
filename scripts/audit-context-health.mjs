#!/usr/bin/env node
import path from 'node:path'
import { inspectGoalPayload, inspectRollout, resolveRollout, unavailableReport } from './context-health.mjs'

const args = process.argv.slice(2)
const readArg = (name, fallback = null) => { const index = args.indexOf(name); return index === -1 ? fallback : args[index + 1] ?? fallback }
const target = path.resolve(readArg('--target', process.cwd()))
const sessionPath = readArg('--session')
const sessionId = readArg('--session-id')
const codexHome = readArg('--codex-home')
const jsonOnly = args.includes('--json')
let report
try {
  const resolved = resolveRollout({ sessionPath, sessionId, target, ...(codexHome ? { codexHome } : {}) })
  report = resolved ? await inspectRollout(resolved) : unavailableReport(sessionPath || sessionId ? 'requested-session-not-found' : 'no-cwd-matched-codex-rollout', target)
} catch (error) {
  report = unavailableReport(`rollout-read-failed: ${error.message}`, target)
}
report.goalPayload = inspectGoalPayload(target)
report = { ...report, generatedAt: new Date().toISOString(), claimBoundary: 'Read-only host evidence and routing advice; does not compact a host session, create a new task, or prove real subagent dispatch.' }
if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else {
  console.log('# GSE Context Health\n')
  console.log(`Health: ${report.health}`)
  console.log(`Usage: ${report.usagePercent ?? 'unknown'}%`)
  console.log(`Compactions: ${report.compactionCount ?? 'unknown'}`)
  console.log(`Action: ${report.action}`)
  console.log(`Agent route: ${report.agentRoute}`)
  if (report.reason) console.log(`Reason: ${report.reason}`)
}
