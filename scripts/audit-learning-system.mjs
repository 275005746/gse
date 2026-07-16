#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const jsonOnly = args.includes('--json')
const target = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-learning-audit-'))

function run(script, commandArgs) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...commandArgs], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    command: [process.execPath, path.join(root, 'scripts', script), ...commandArgs].join(' '),
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

function parseJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

fs.mkdirSync(target, { recursive: true })
const initRun = run('init-project.mjs', ['--target', target, '--mode', 'lite', '--json'])
const learningsPath = path.join(target, '.gse', 'learnings.md')
const before = fs.existsSync(learningsPath) ? fs.readFileSync(learningsPath, 'utf8') : ''
const summary = 'Prefer UTF-8 safe readers for Chinese docs before judging mojibake'

const waitingRun = run('record-learning.mjs', ['--target', target, '--json'])
const dryRun = run('record-learning.mjs', ['--target', target, '--summary', summary, '--trigger', 'encoding review', '--source', 'audit fixture', '--json'])
const afterDryRun = fs.existsSync(learningsPath) ? fs.readFileSync(learningsPath, 'utf8') : ''
const writeRun = run('record-learning.mjs', ['--target', target, '--summary', summary, '--trigger', 'encoding review', '--source', 'audit fixture', '--impact', 'prevents false mojibake fixes', '--execute', '--json'])
const afterWrite = fs.existsSync(learningsPath) ? fs.readFileSync(learningsPath, 'utf8') : ''
const duplicateRun = run('record-learning.mjs', ['--target', target, '--summary', summary, '--trigger', 'encoding review again', '--source', 'audit fixture', '--execute', '--json'])
const afterDuplicate = fs.existsSync(learningsPath) ? fs.readFileSync(learningsPath, 'utf8') : ''
const commandDryRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', `/gse learn --summary ${summary} via command --trigger command audit --source run-gse-command`, '--json'])
const commandWriteRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse learn --summary Capture tool capability mismatches as reusable lessons --trigger tool mismatch --source command audit', '--execute', '--json'])
const afterCommandWrite = fs.existsSync(learningsPath) ? fs.readFileSync(learningsPath, 'utf8') : ''
const promoteDryRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse learn --promote', '--json'])
const promoteWriteRun = run('run-gse-command.mjs', ['--root', root, '--target', target, '--command', '/gse learn --promote', '--execute', '--json'])
const promotionsPath = path.join(target, '.gse', 'learning-promotions.md')
const promotionsText = fs.existsSync(promotionsPath) ? fs.readFileSync(promotionsPath, 'utf8') : ''

const waiting = parseJson(waitingRun.stdout)
const dry = parseJson(dryRun.stdout)
const written = parseJson(writeRun.stdout)
const duplicate = parseJson(duplicateRun.stdout)
const commandDry = parseJson(commandDryRun.stdout)
const commandDryChild = parseJson(commandDry?.execution?.stdout ?? '')
const commandWrite = parseJson(commandWriteRun.stdout)
const commandWriteChild = parseJson(commandWrite?.execution?.stdout ?? '')
const promoteDry = parseJson(promoteDryRun.stdout)
const promoteDryChild = parseJson(promoteDry?.execution?.stdout ?? '')
const promoteWrite = parseJson(promoteWriteRun.stdout)
const promoteWriteChild = parseJson(promoteWrite?.execution?.stdout ?? '')

const checks = [
  check('LRN01', 'record-learning script exists', fs.existsSync(path.join(root, 'scripts', 'record-learning.mjs')), 'scripts/record-learning.mjs'),
  check('LRN02', 'learning audit script exists', fs.existsSync(path.join(root, 'scripts', 'audit-learning-system.mjs')), 'scripts/audit-learning-system.mjs'),
  check('LRN03', 'init-project creates .gse/learnings.md', initRun.status === 0 && fs.existsSync(learningsPath), '.gse/learnings.md'),
  check('LRN04', 'missing summary returns waiting-for-input without failing', waitingRun.status === 0 && waiting?.status === 'waiting-for-input', 'record-learning without --summary'),
  check('LRN05', 'dry-run previews learning without modifying file', dryRun.status === 0 && dry?.status === 'ready' && before === afterDryRun && dry?.preview?.includes(summary), 'record-learning dry-run'),
  check('LRN06', 'execute appends structured learning entry', writeRun.status === 0 && written?.status === 'written' && afterWrite.includes('- Summary: ' + summary) && afterWrite.includes('- Trigger: encoding review') && afterWrite.includes('- Status: learning-note'), 'record-learning --execute'),
  check('LRN07', 'duplicate summary increments occurrence without appending another entry', duplicateRun.status === 0 && duplicate?.status === 'updated' && afterDuplicate.includes('- Occurrences: 2') && (afterDuplicate.match(new RegExp('- Summary: ' + summary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length === 1, 'duplicate record-learning --execute'),
  check('LRN08', '/gse learn dry-runs through portable command runner', commandDryRun.status === 0 && commandDry?.verb === 'learn' && commandDryChild?.status === 'ready', '/gse learn'),
  check('LRN09', '/gse learn --execute writes through portable command runner', commandWriteRun.status === 0 && commandWrite?.verb === 'learn' && commandWriteChild?.status === 'written' && afterCommandWrite.includes('Capture tool capability mismatches as reusable lessons'), '/gse learn --execute'),
  check('LRN10', '/gse learn --promote dry-runs promotion analysis', promoteDryRun.status === 0 && promoteDry?.verb === 'learn' && promoteDryChild?.workflows?.learningPromotion === 'verified', '/gse learn --promote'),
  check('LRN11', '/gse learn --promote --execute writes candidate-only report', promoteWriteRun.status === 0 && promoteWrite?.verb === 'learn' && promoteWriteChild?.write?.status === 'written' && promotionsText.includes('# Learning Promotions'), '/gse learn --promote --execute'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  target,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    learningCommand: failed === 0 ? 'verified' : 'failed',
    learningStore: failed === 0 ? 'verified' : 'failed',
  },
  commands: [waitingRun.command, dryRun.command, writeRun.command, duplicateRun.command, commandDryRun.command, commandWriteRun.command, promoteDryRun.command, promoteWriteRun.command],
  limits: [
    'This verifies deterministic learning capture and duplicate prevention.',
    'It does not automatically decide which lessons are worth recording; the agent or owner still supplies the summary.',
  ],
  checks,
}

fs.rmSync(target, { recursive: true, force: true })

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))

if (failed > 0) process.exit(1)
