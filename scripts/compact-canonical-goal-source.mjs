#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { findCanonicalGoalSource } from './canonical-goal-source.mjs'
import { analyzeCanonicalGoalSourceHygiene } from './document-hygiene.mjs'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const target = path.resolve(readArg('--target', readArg('--root', process.cwd())))
const jsonOnly = args.includes('--json')
const dryRun = args.includes('--dry-run') || !args.includes('--execute')

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(readText(filePath))
  } catch {
    return null
  }
}

function classifyLine(line) {
  if (/^#+\s*(already landed|still missing|current priority|next slice|risks?|evidence|acceptance)\b/i.test(line)) return 'move'
  if (/\.gse\/(?:evidence|goal-map|current-slice|state\.json|session-sync)/i.test(line)) return 'move'
  if (/\b(smoke|preflight|verified|accepted|next action|current focus|residual risk|risk archive)\b/i.test(line)) return 'summarize'
  if (/\b(slice|evidence)\b/i.test(line) && /^\s*[-*]/.test(line)) return 'summarize'
  return 'keep'
}

function buildPlan() {
  const state = readJson(path.join(target, '.gse', 'state.json'))
  const canonical = findCanonicalGoalSource(target, state)
  const hygiene = analyzeCanonicalGoalSourceHygiene(target, canonical)
  const filePath = canonical ? path.join(target, canonical) : ''
  if (!canonical || !fs.existsSync(filePath)) {
    return {
      target,
      generatedAt: new Date().toISOString(),
      mode: dryRun ? 'dry-run' : 'execute-not-supported',
      summary: { status: 'missing-canonical-source', keep: 0, summarize: 0, move: 0, archive: 0, total: 0 },
      canonicalGoalSource: hygiene,
      plan: [],
      limits: ['No canonical product goal source exists; nothing can be compacted.'],
    }
  }
  const lines = readText(filePath).split(/\r?\n/)
  const plan = lines.map((text, index) => {
    const action = classifyLine(text)
    const destination = action === 'keep'
      ? canonical
      : action === 'summarize'
        ? '.gse/goal-map.md or .gse/current-slice.md'
        : '.gse/evidence/ or project slice logs'
    return { line: index + 1, action, destination, text: text.length > 180 ? text.slice(0, 177).trimEnd() + '...' : text }
  })
  const counts = plan.reduce((acc, item) => {
    acc[item.action] = (acc[item.action] || 0) + 1
    return acc
  }, {})
  return {
    target,
    generatedAt: new Date().toISOString(),
    mode: dryRun ? 'dry-run' : 'execute-not-supported',
    summary: {
      status: hygiene.status === 'warning' ? 'plan-ready' : 'no-compaction-needed',
      keep: counts.keep || 0,
      summarize: counts.summarize || 0,
      move: counts.move || 0,
      archive: counts.archive || 0,
      total: plan.length,
    },
    canonicalGoalSource: hygiene,
    plan,
    recommendedNextStep: dryRun
      ? 'Review the keep/summarize/move plan, then edit deliberately. This script does not rewrite canonical product docs.'
      : 'Automatic canonical rewrite is intentionally not supported; use this dry-run plan for deliberate edits.',
    limits: [
      'Default mode is dry-run and read-only.',
      'Canonical product docs carry durable intent; this tool only classifies likely ledger lines for human or agent review.',
      'Move detailed execution history to .gse/evidence/ or slice logs; keep only durable product architecture and decisions in canonical docs.',
    ],
  }
}

const report = buildPlan()
if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else {
  console.log('# Canonical Goal Source Compaction Plan')
  console.log('')
  console.log('Target: ' + report.target)
  console.log('Source: ' + (report.canonicalGoalSource.path || 'not discovered'))
  console.log('Status: ' + report.summary.status)
  console.log(`Keep ${report.summary.keep}, summarize ${report.summary.summarize}, move ${report.summary.move}`)
}

if (report.summary.status === 'missing-canonical-source') process.exit(1)
