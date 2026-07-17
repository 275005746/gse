import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'

export const CONTEXT_BUDGETS = Object.freeze({
  coordinatorContextTargetPercent: 40,
  workerContextTargetPercent: 25,
  reviewerContextTargetPercent: 20,
  emergencyReservePercent: 15,
  maxContextPackTokens: 8000,
  maxAgentResultTokens: 800,
  maxToolOutputTokens: 1500,
  maxRetrievalCycles: 3,
  maxParallelWriters: 2,
})

const RANK = { unavailable: -1, green: 0, yellow: 1, orange: 2, red: 3 }
const maxHealth = (...values) => values.reduce((best, value) => RANK[value] > RANK[best] ? value : best, 'unavailable')
const usageHealth = (percent) => percent >= 90 ? 'red' : percent >= 80 ? 'orange' : percent >= 65 ? 'yellow' : 'green'
const compactionHealth = (count) => count >= 3 ? 'red' : count >= 2 ? 'orange' : count >= 1 ? 'yellow' : 'green'

export function internalTaskRouting(actionKind) {
  return {
    workClass: 'execution-action',
    scope: 'operational',
    visibility: 'internal',
    persistence: 'internal-only',
    globalTaskEligible: false,
    actionKind,
  }
}

function routeFor(health) {
  return {
    green: ['continue-normal', true, 'normal', 'coordinator', false],
    yellow: ['continue-compact', true, 'compact', 'coordinator-or-one-bounded-worker', false],
    orange: ['finish-atom-and-checkpoint', false, 'capsule-only', 'coordinator-finish-current-atom', true],
    red: ['block-expansion-and-rollover', false, 'handoff-only', 'fresh-context-same-plan-unit', true],
    unavailable: ['continue-portable-policy', true, 'compact-preferred', 'coordinator-without-host-usage-evidence', false],
  }[health]
}

export function classifyContextHealth({ usedTokens = null, contextWindow = null, compactionCount = 0, exhaustionSentinel = false } = {}) {
  const hasUsage = Number.isFinite(usedTokens) && usedTokens >= 0 && Number.isFinite(contextWindow) && contextWindow > 0
  const health = !hasUsage && compactionCount === 0 && !exhaustionSentinel
    ? 'unavailable'
    : exhaustionSentinel ? 'red' : maxHealth(usageHealth(hasUsage ? usedTokens / contextWindow * 100 : 0), compactionHealth(compactionCount))
  const [action, canExpandScope, outputMode, agentRoute, rolloverRequired] = routeFor(health)
  return {
    health,
    usagePercent: hasUsage ? Number(Math.min(100, usedTokens / contextWindow * 100).toFixed(1)) : null,
    action,
    canExpandScope,
    outputMode,
    agentRoute,
    checkpointRequired: rolloverRequired,
    rolloverRequired,
    taskRouting: internalTaskRouting(rolloverRequired ? 'context-rollover' : 'continue-current-slice'),
  }
}

function tokenSample(payload) {
  const info = payload?.info
  const contextWindow = Number(info?.model_context_window)
  const last = Number(info?.last_token_usage?.total_tokens)
  const total = Number(info?.total_token_usage?.total_tokens)
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) return null
  const exhaustionSentinel = last === 0 && total === contextWindow
  return { usedTokens: exhaustionSentinel ? contextWindow : last, contextWindow, exhaustionSentinel }
}

export function inspectGoalPayload(target) {
  const measure = (relative) => {
    const file = path.join(target, relative)
    if (!fs.existsSync(file)) return { path: relative, exists: false, chars: 0, lines: 0, estimatedTokens: 0 }
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
    return { path: relative, exists: true, chars: text.length, lines: text.split(/\r?\n/).length, estimatedTokens: Math.ceil(text.length / 4) }
  }
  const goalMap = measure('.gse/goal-map.md')
  const currentSlice = measure('.gse/current-slice.md')
  return { status: goalMap.chars > 30000 || goalMap.lines > 320 ? 'goal-payload-risk' : 'bounded', goalMap, currentSlice, activeGoalContract: { maxLines: 12, role: 'execution-index-only' }, recommendation: 'Keep active goal at 8-12 lines; keep only current focus, current slice, next verification, and evidence pointers in goal-map; preserve history in evidence/slice logs.' }
}

export async function inspectRollout(sessionPath) {
  const report = {
    status: 'ready', sessionPath: path.resolve(sessionPath), sessionId: null, cwd: null,
    records: 0, malformedRecords: 0, tokenSamples: 0, compactionCount: 0,
    functionCalls: 0, functionOutputs: 0, functionOutputChars: 0, largestFunctionOutputChars: 0,
    lastSample: null, peakUsedTokens: 0,
  }
  const lines = readline.createInterface({ input: fs.createReadStream(sessionPath, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.trim()) continue
    report.records += 1
    let record
    try { record = JSON.parse(line) } catch { report.malformedRecords += 1; continue }
    const payload = record?.payload
    if (record.type === 'session_meta') {
      report.sessionId = payload?.id ?? payload?.session_id ?? report.sessionId
      report.cwd = payload?.cwd ?? report.cwd
    }
    if (record.type === 'event_msg' && payload?.type === 'context_compacted') report.compactionCount += 1
    if (record.type === 'event_msg' && payload?.type === 'token_count') {
      const sample = tokenSample(payload)
      if (sample) {
        report.tokenSamples += 1
        report.lastSample = sample
        report.peakUsedTokens = Math.max(report.peakUsedTokens, sample.usedTokens)
      }
    }
    if (record.type === 'response_item' && payload?.type === 'function_call') report.functionCalls += 1
    if (record.type === 'response_item' && payload?.type === 'function_call_output') {
      const chars = typeof payload.output === 'string' ? payload.output.length : JSON.stringify(payload.output ?? '').length
      report.functionOutputs += 1
      report.functionOutputChars += chars
      report.largestFunctionOutputChars = Math.max(report.largestFunctionOutputChars, chars)
    }
  }
  const sample = report.lastSample
  return {
    ...report,
    usedTokens: sample?.usedTokens ?? null,
    contextWindow: sample?.contextWindow ?? null,
    exhaustionSentinel: sample?.exhaustionSentinel ?? false,
    ...classifyContextHealth({ usedTokens: sample?.usedTokens, contextWindow: sample?.contextWindow, compactionCount: report.compactionCount, exhaustionSentinel: sample?.exhaustionSentinel }),
    budgets: CONTEXT_BUDGETS,
    pressureSignals: {
      largestToolOutputEstimatedTokens: Math.ceil(report.largestFunctionOutputChars / 4),
      totalToolOutputEstimatedTokens: Math.ceil(report.functionOutputChars / 4),
    },
  }
}

const normalize = (value) => path.resolve(value).replace(/\\/g, '/').toLowerCase()
function filesUnder(root) {
  if (!fs.existsSync(root)) return []
  const result = [], stack = [root]
  while (stack.length) {
    const current = stack.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) result.push(full)
    }
  }
  return result
}
function sessionMeta(file) {
  try {
    const fd = fs.openSync(file, 'r'), buffer = Buffer.alloc(131072)
    const count = fs.readSync(fd, buffer, 0, buffer.length, 0); fs.closeSync(fd)
    const record = JSON.parse(buffer.subarray(0, count).toString('utf8').split(/\r?\n/, 1)[0])
    return record.type === 'session_meta' ? record.payload : null
  } catch { return null }
}
export function resolveRollout({ sessionPath = null, sessionId = null, target = null, codexHome = path.join(os.homedir(), '.codex') } = {}) {
  if (sessionPath) return fs.existsSync(sessionPath) ? path.resolve(sessionPath) : null
  const files = [path.join(codexHome, 'sessions'), path.join(codexHome, 'archived_sessions')].flatMap(filesUnder)
  if (sessionId) return files.find((file) => path.basename(file).includes(sessionId) || sessionMeta(file)?.id === sessionId) ?? null
  if (!target) return null
  const wanted = normalize(target)
  return files.map((file) => ({ file, mtime: fs.statSync(file).mtimeMs, meta: sessionMeta(file) }))
    .filter((item) => item.meta?.cwd && normalize(item.meta.cwd) === wanted)
    .sort((a, b) => b.mtime - a.mtime)[0]?.file ?? null
}
export function unavailableReport(reason, target = null) {
  return { status: 'unavailable', target: target ? path.resolve(target) : null, reason, ...classifyContextHealth(), budgets: CONTEXT_BUDGETS }
}
