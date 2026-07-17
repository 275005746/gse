#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { CONTEXT_BUDGETS, inspectRollout, internalTaskRouting, resolveRollout, unavailableReport } from './context-health.mjs'

const args = process.argv.slice(2)
const readArg = (name, fallback = null) => { const index = args.indexOf(name); return index === -1 ? fallback : args[index + 1] ?? fallback }
const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const target = path.resolve(readArg('--target', process.cwd()))
const execute = args.includes('--execute')
const jsonOnly = args.includes('--json')
const includeContent = args.includes('--include-content')
const requestedMaxTokens = Number(readArg('--max-tokens', CONTEXT_BUDGETS.maxContextPackTokens))
const maxTokens = Number.isFinite(requestedMaxTokens) && requestedMaxTokens > 0
  ? Math.min(CONTEXT_BUDGETS.maxContextPackTokens, Math.floor(requestedMaxTokens))
  : CONTEXT_BUDGETS.maxContextPackTokens
const maxChars = Math.max(1000, maxTokens * 4)
const read = (relative) => { const full = path.join(target, relative); return fs.existsSync(full) ? fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, '') : '' }
const json = (relative) => { try { return JSON.parse(read(relative)) } catch { return null } }
const state = json('.gse/state.json')
const explicit = readArg('--session')
const sessionId = readArg('--session-id')
let health
try {
  const rollout = resolveRollout({ sessionPath: explicit, sessionId, target })
  health = rollout ? await inspectRollout(rollout) : unavailableReport('no-matched-rollout', target)
} catch (error) { health = unavailableReport(`rollout-read-failed: ${error.message}`, target) }
const requestedFiles = readArg('--include', '').split(',').map((item) => item.trim()).filter(Boolean).slice(0, 8)
const comparable = (value) => process.platform === 'win32' ? value.toLowerCase() : value
const targetReal = fs.realpathSync(target)
const targetPrefix = targetReal.endsWith(path.sep) ? targetReal : `${targetReal}${path.sep}`
const selectedFiles = []
const rejectedFiles = []
for (const requested of requestedFiles) {
  const lexical = path.resolve(target, requested)
  if (lexical !== target && !lexical.startsWith(target.endsWith(path.sep) ? target : `${target}${path.sep}`)) {
    rejectedFiles.push({ path: requested, reason: 'outside-target' })
  } else if (!fs.existsSync(lexical) || !fs.statSync(lexical).isFile()) {
    rejectedFiles.push({ path: requested, reason: 'missing-or-not-file' })
  } else {
    const real = fs.realpathSync(lexical)
    const insideRealTarget = comparable(real) === comparable(targetReal) || comparable(real).startsWith(comparable(targetPrefix))
    if (!insideRealTarget) rejectedFiles.push({ path: requested, reason: 'outside-target-realpath' })
    else selectedFiles.push(path.relative(targetReal, real).replace(/\\/g, '/'))
  }
}
const excerpts = selectedFiles.map((relative) => {
  const value = read(relative)
  return value ? `\n## Selected Context: ${relative}\n\n${value.slice(0, 6000)}` : ''
}).filter(Boolean)
const lines = [
  '# GSE Context Checkpoint', '',
  `Generated: ${new Date().toISOString()}`,
  `Target: ${target}`,
  `Health: ${health.health} (${health.usagePercent ?? 'unknown'}%, compactions=${health.compactionCount ?? 'unknown'})`,
  `Required action: ${health.action}`, '',
  '## Current Goal', '',
  state?.currentSlice?.outcome || 'Read .gse/current-slice.md and confirm the current outcome.', '',
  '## Current Slice', '',
  `- ID: ${state?.currentSlice?.id ?? 'unknown'}`,
  `- Status: ${state?.currentSlice?.status ?? 'unknown'}`,
  `- Next action: ${state?.currentSlice?.nextAction ?? 'Inspect current slice and evidence.'}`, '',
  '## Constraints', '',
  '- Read project rules and current GSE state first.',
  '- Preserve unrelated dirty worktree changes.',
  '- Do not copy raw prior tool logs or full conversation history.',
  '- Keep host-native and real-subagent claims evidence-gated.', '',
  '## Context Pack Budget', '',
  `- Maximum estimated tokens: ${maxTokens}`,
  `- Retrieval cycles: ${CONTEXT_BUDGETS.maxRetrievalCycles}`,
  `- Worker result capsule: ${CONTEXT_BUDGETS.maxAgentResultTokens} estimated tokens`, '',
  '## Result Capsule Contract', '',
  'Return status, concise summary, files inspected/changed, verification, evidence, residual risks, and one next action.', '',
  '## Resume', '',
  health.rolloverRequired ? 'Resume in a fresh execution context within the same top-level plan unit; continue only the recorded next action and do not persist rollover as a global task.' : 'Continue the smallest current atomic step within the same top-level plan unit; checkpoint again before expanding scope.',
  ...excerpts,
]
let markdown = lines.join('\n').trim() + '\n'
let truncated = false
if (markdown.length > maxChars) { markdown = markdown.slice(0, maxChars - 80).trimEnd() + '\n\n[Context pack truncated to budget.]\n'; truncated = true }
const estimatedTokens = Math.ceil(markdown.length / 4)
const defaultOut = path.join(target, '.gse', 'handoffs', `context-checkpoint-${new Date().toISOString().replace(/[:.]/g, '-')}.md`)
const out = path.resolve(readArg('--out', defaultOut))
if (execute) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, markdown, 'utf8') }
const report = {
  status: 'ready', target, root, health: { health: health.health, usagePercent: health.usagePercent, compactionCount: health.compactionCount, action: health.action, rolloverRequired: health.rolloverRequired },
  budget: { maxTokens, estimatedTokens, maxChars, truncated, withinBudget: estimatedTokens <= maxTokens },
  selectedFiles, rejectedFiles,
  contextPack: { maxFiles: 8, files: selectedFiles, rejectedFiles, maxEstimatedTokens: maxTokens, retrievalCycles: CONTEXT_BUDGETS.maxRetrievalCycles },
  output: { path: out, written: execute, contentIncluded: includeContent },
  markdownPreview: markdown.slice(0, 600),
  ...(includeContent ? { markdown } : {}),
  resultCapsule: { maxEstimatedTokens: CONTEXT_BUDGETS.maxAgentResultTokens, requiredFields: ['status', 'summary', 'filesInspected', 'filesChanged', 'verification', 'evidence', 'residualRisks', 'nextAction'] },
  taskRouting: internalTaskRouting(health.rolloverRequired ? 'context-rollover' : 'continue-current-slice'),
  claimBoundary: 'Checkpoint generation continues the same top-level plan unit; it does not create a host task, persist rollover as a global task, or prove subagent dispatch.',
}
if (jsonOnly) console.log(JSON.stringify(report, null, 2)); else console.log(markdown)
if (!report.budget.withinBudget) process.exit(1)
