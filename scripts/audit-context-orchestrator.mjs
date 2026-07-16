#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { classifyContextHealth, inspectRollout } from './context-health.mjs'

const args = process.argv.slice(2)
const rootIndex = args.indexOf('--root')
const root = path.resolve(rootIndex === -1 ? path.join(import.meta.dirname, '..') : args[rootIndex + 1])
const jsonOnly = args.includes('--json')
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-context-orchestrator-'))
fs.mkdirSync(path.join(fixture, '.gse'), { recursive: true })
fs.writeFileSync(path.join(fixture, '.gse', 'state.json'), JSON.stringify({ projectName: 'fixture', currentSlice: { id: 'CTX-1', outcome: 'Protect context.', status: 'in-progress', nextAction: 'Run fixture.' } }), 'utf8')
fs.writeFileSync(path.join(fixture, 'allowed-context.md'), '# Allowed context\\n', 'utf8')
function rollout(name, used, window, compactions = 0, sentinel = false) {
  const file = path.join(fixture, `${name}.jsonl`)
  const records = [{ type: 'session_meta', payload: { id: name, cwd: fixture } }]
  for (let i = 0; i < compactions; i += 1) records.push({ type: 'event_msg', payload: { type: 'context_compacted' } })
  records.push({ type: 'event_msg', payload: { type: 'token_count', info: { model_context_window: window, last_token_usage: { total_tokens: sentinel ? 0 : used }, total_token_usage: { total_tokens: sentinel ? window : used } } } })
  records.push({ type: 'response_item', payload: { type: 'function_call_output', output: 'x'.repeat(7000) } })
  fs.writeFileSync(file, records.map(JSON.stringify).join('\n') + '\n', 'utf8')
  return file
}
const files = {
  green: rollout('green', 60000, 100000), yellow: rollout('yellow', 70000, 100000),
  orange: rollout('orange', 50000, 100000, 2), red: rollout('red', 50000, 100000, 3), sentinel: rollout('sentinel', 0, 100000, 0, true),
}
const reports = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await inspectRollout(file)])))
function run(script, commandArgs) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...commandArgs], { cwd: root, encoding: 'utf8', windowsHide: true })
  let data = null; try { data = JSON.parse((result.stdout || '').trim()) } catch {}
  return { status: result.status ?? 1, data, stderr: (result.stderr || '').trim() }
}
const missing = run('audit-context-health.mjs', ['--target', fixture, '--codex-home', path.join(fixture, 'missing'), '--json'])
const checkpoint = run('generate-context-checkpoint.mjs', ['--root', root, '--target', fixture, '--session', files.orange, '--max-tokens', '8000', '--json'])
const boundedCheckpoint = run('generate-context-checkpoint.mjs', ['--root', root, '--target', fixture, '--session', files.orange, '--include', 'allowed-context.md,../outside.md', '--max-tokens', '8000', '--json'])
const continueOrange = run('run-gse-command.mjs', ['--root', root, '--target', fixture, '--command', '/gse continue --session ' + files.orange, '--json', '--compact'])
const checks = []
const check = (id, label, passed, evidence) => checks.push({ id, label, status: passed ? 'passed' : 'failed', evidence })
check('CTX01', 'usage below 65 percent is green', reports.green.health === 'green', reports.green)
check('CTX02', '65-80 percent is yellow compact mode', reports.yellow.health === 'yellow' && reports.yellow.outputMode === 'compact', reports.yellow)
check('CTX03', 'two compactions force orange checkpoint', reports.orange.health === 'orange' && reports.orange.checkpointRequired && !reports.orange.canExpandScope, reports.orange)
check('CTX04', 'three compactions force red rollover', reports.red.health === 'red' && reports.red.agentRoute === 'new-task-required', reports.red)
check('CTX05', 'host exhaustion sentinel is red', reports.sentinel.health === 'red' && reports.sentinel.exhaustionSentinel, reports.sentinel)
check('CTX06', 'classification boundaries are exact', classifyContextHealth({ usedTokens: 90000, contextWindow: 100000 }).health === 'red' && classifyContextHealth({ usedTokens: 80000, contextWindow: 100000 }).health === 'orange', '80 and 90 percent')
check('CTX07', 'missing host evidence degrades without failure', missing.status === 0 && missing.data?.status === 'unavailable' && missing.data?.health === 'unavailable', missing)
check('CTX08', 'rollout inspection reports aggregate tool pressure only', reports.green.pressureSignals.totalToolOutputEstimatedTokens === 1750 && !JSON.stringify(reports.green).includes('xxxx'), reports.green.pressureSignals)
check('CTX09', 'checkpoint remains within 8000-token pack budget', checkpoint.status === 0 && checkpoint.data?.budget?.withinBudget && checkpoint.data?.budget?.estimatedTokens <= 8000, checkpoint)
check('CTX10', 'checkpoint is dry-run by default', checkpoint.data?.output?.written === false && !fs.existsSync(checkpoint.data?.output?.path), checkpoint.data?.output)
check('CTX11', 'result capsule is capped at 800 tokens with required fields', checkpoint.data?.resultCapsule?.maxEstimatedTokens === 800 && checkpoint.data?.resultCapsule?.requiredFields?.length === 8, checkpoint.data?.resultCapsule)
const source = fs.readFileSync(path.join(root, 'references', 'context-orchestration.md'), 'utf8')
const commandRunner = fs.readFileSync(path.join(root, 'scripts', 'run-gse-command.mjs'), 'utf8')
const validation = fs.readFileSync(path.join(root, 'scripts', 'run-validation-profile.mjs'), 'utf8')
check('CTX12', 'policy documents budgets and honest subagent boundary', source.includes('max_context_pack_tokens: 8000') && source.includes('do not claim lower total token cost'), 'context-orchestration.md')
check('CTX13', 'portable context command is wired', commandRunner.includes("context: {") && commandRunner.includes("verb === 'context'"), 'run-gse-command.mjs')
check('CTX14', 'focused audit is wired into Lite validation', validation.includes('audit-context-orchestrator.mjs'), 'run-validation-profile.mjs')
check('CTX15', 'context pack includes only target-contained files', boundedCheckpoint.status === 0 && boundedCheckpoint.data?.contextPack?.files?.includes('allowed-context.md') && boundedCheckpoint.data?.contextPack?.rejectedFiles?.some((item) => item.path === '../outside.md' && item.reason === 'outside-target'), boundedCheckpoint.data?.contextPack)
check('CTX16', 'orange health is consumed by continue routing', continueOrange.data?.compactState?.contextHealth?.health === 'orange' && continueOrange.data?.compactState?.contextHealth?.canExpandScope === false && continueOrange.data?.compactState?.noGoalMode?.recommendedAction === 'context-rollover', continueOrange.data?.compactState?.noGoalMode)
check('CTX17', 'invalid max token input falls back to the fixed pack budget', boundedCheckpoint.data?.budget?.maxTokens === 8000 && boundedCheckpoint.data?.contextPack?.maxEstimatedTokens === 8000, boundedCheckpoint.data?.budget)
const failed = checks.filter((item) => item.status === 'failed').length
const report = { root, generatedAt: new Date().toISOString(), summary: { status: failed ? 'failed' : 'passed', passed: checks.length - failed, failed, total: checks.length }, workflows: { contextOrchestrator: failed ? 'incomplete' : 'verified' }, checks, limits: ['Fixture routing does not create a host task or prove real subagent execution.'] }
if (jsonOnly) console.log(JSON.stringify(report, null, 2)); else console.log(`# Context Orchestrator Audit\n\nStatus: ${report.summary.status}\nChecks: ${report.summary.passed}/${report.summary.total}`)
if (failed) process.exit(1)
