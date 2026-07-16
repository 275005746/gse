#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const targetArg = readArg('--target')
const jsonOnly = args.includes('--json')

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, ok: false, records: [], error: 'missing' }
  const lines = readText(filePath)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const records = []
  for (const [index, line] of lines.entries()) {
    try {
      records.push(JSON.parse(line))
    } catch (error) {
      return { exists: true, ok: false, records, error: `line ${index + 1}: ${error.message}` }
    }
  }
  return { exists: true, ok: true, records, error: '' }
}

function evidenceFileExists(target, record) {
  return typeof record.evidenceFile === 'string' && fs.existsSync(path.join(target, record.evidenceFile))
}

function classifyRecord(record, target, index) {
  const evidenceLevel = record.evidenceLevel || 'missing'
  const requiredEvidenceLevel = record.requiredEvidenceLevel || 'missing'
  const backfilled = record.evidenceLevelBackfill === 'conservative-historical-default'
  const commands = Array.isArray(record.commands) ? record.commands : []
  const status = record.status || 'unknown'
  const closeableStatus = ['verified', 'accepted'].includes(status)
  const hasEvidenceFile = evidenceFileExists(target, record)
  const hasCommands = commands.length > 0
  const eligibleForStrongerReview = backfilled && closeableStatus && hasEvidenceFile && hasCommands

  let category = 'not-queued'
  if (evidenceLevel === 'external-required' || requiredEvidenceLevel === 'external-required') {
    category = 'external-required'
  } else if (backfilled && evidenceLevel === 'result') {
    category = 'needs-review'
  } else if (evidenceLevel === 'result' && requiredEvidenceLevel === 'result') {
    category = 'safe-result'
  } else if (!record.evidenceLevel) {
    category = 'needs-review'
  }

  return {
    index,
    date: record.date || null,
    recordType: record.recordType || null,
    status,
    category,
    evidenceLevel,
    requiredEvidenceLevel,
    backfilled,
    eligibleForStrongerReview,
    evidenceFile: record.evidenceFile || null,
    evidenceFileExists: hasEvidenceFile,
    commandCount: commands.length,
    summary: record.summary || record.recordType || '(unknown evidence record)',
    reviewHint: buildReviewHint({ category, backfilled, eligibleForStrongerReview, hasEvidenceFile, hasCommands }),
  }
}

function buildReviewHint({ category, backfilled, eligibleForStrongerReview, hasEvidenceFile, hasCommands }) {
  if (category === 'external-required') return 'Collect or attach owner, release, CI, marketplace, or host evidence before upgrading this claim.'
  if (eligibleForStrongerReview) return 'Review the referenced evidence file and commands before manually raising this record above result.'
  if (backfilled && !hasEvidenceFile) return 'Keep as result until the referenced evidence file is restored or replaced.'
  if (backfilled && !hasCommands) return 'Keep as result until the original verification command is known.'
  if (category === 'safe-result') return 'No stronger claim is implied; leave as result unless a human review proves otherwise.'
  if (category === 'needs-review') return 'Review this record before using it as stronger proof.'
  return 'No review action required.'
}

export function analyzeEvidenceReviewQueue(records, target) {
  const items = records.map((record, index) => classifyRecord(record, target, index + 1))
  const queued = items.filter((item) => item.category !== 'not-queued')
  const counts = {
    totalRecords: records.length,
    queued: queued.length,
    needsReview: queued.filter((item) => item.category === 'needs-review').length,
    safeResult: queued.filter((item) => item.category === 'safe-result').length,
    eligibleForStrongerReview: queued.filter((item) => item.eligibleForStrongerReview).length,
    externalRequired: queued.filter((item) => item.category === 'external-required').length,
    missingEvidenceFile: queued.filter((item) => !item.evidenceFileExists).length,
  }
  return { counts, queue: queued }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-evidence-review-'))
  fs.mkdirSync(path.join(dir, '.gse', 'evidence'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.gse', 'evidence', '2026-07-09.md'), '# Evidence\n', 'utf8')
  const records = [
    {
      date: '2026-07-06',
      recordType: 'slice',
      status: 'verified',
      evidenceLevel: 'result',
      requiredEvidenceLevel: 'result',
      evidenceLevelBackfill: 'conservative-historical-default',
      summary: 'Backfilled historical verified record.',
      evidenceFile: '.gse/evidence/2026-07-09.md',
      commands: ['node scripts/old-audit.mjs --json'],
      nextAction: 'Review before stronger claim.',
    },
    {
      date: '2026-07-09',
      recordType: 'note',
      status: 'result',
      evidenceLevel: 'result',
      requiredEvidenceLevel: 'result',
      summary: 'Intentional result-only note.',
      evidenceFile: '.gse/evidence/2026-07-09.md',
      commands: [],
      nextAction: 'Keep as result.',
    },
    {
      date: '2026-07-09',
      recordType: 'release',
      status: 'result',
      evidenceLevel: 'external-required',
      requiredEvidenceLevel: 'accepted-release',
      summary: 'External release gate.',
      evidenceFile: '.gse/evidence/2026-07-09.md',
      commands: ['node scripts/owner-actions.mjs'],
      nextAction: 'Collect owner evidence.',
    },
  ]
  fs.writeFileSync(path.join(dir, '.gse', 'evidence', 'index.jsonl'), records.map((record) => JSON.stringify(record)).join('\n') + '\n', 'utf8')
  return dir
}

function audit(target) {
  const resolvedTarget = path.resolve(target)
  const evidenceIndexPath = path.join(resolvedTarget, '.gse', 'evidence', 'index.jsonl')
  const evidenceIndexBefore = readText(evidenceIndexPath)
  const evidenceIndex = readJsonl(evidenceIndexPath)
  const analysis = analyzeEvidenceReviewQueue(evidenceIndex.records, resolvedTarget)
  const evidenceIndexAfter = readText(evidenceIndexPath)

  const checks = [
    check('ERQ01', 'evidence index parses before review queue analysis', evidenceIndex.ok, evidenceIndex.ok ? `${evidenceIndex.records.length} record(s)` : evidenceIndex.error),
    check('ERQ02', 'conservative historical result records are queued for review', analysis.counts.needsReview > 0 || evidenceIndex.records.every((record) => record.evidenceLevelBackfill !== 'conservative-historical-default'), `${analysis.counts.needsReview} needs-review record(s)`),
    check('ERQ03', 'review queue does not auto-upgrade or rewrite evidence records', evidenceIndexBefore === evidenceIndexAfter, 'queue-only audit'),
    check('ERQ04', 'queue distinguishes safe result records from historical backfills', analysis.queue.some((item) => item.category === 'safe-result') || evidenceIndex.records.every((record) => !(record.evidenceLevel === 'result' && record.requiredEvidenceLevel === 'result' && !record.evidenceLevelBackfill)), `${analysis.counts.safeResult} safe-result record(s)`),
    check('ERQ05', 'queue exposes stronger-review candidates without changing records', analysis.counts.eligibleForStrongerReview <= analysis.counts.needsReview, `${analysis.counts.eligibleForStrongerReview} eligible-for-stronger-review record(s)`),
  ]
  const passed = checks.filter((item) => item.status === 'passed').length
  const failed = checks.length - passed
  return {
    target: resolvedTarget,
    generatedAt: new Date().toISOString(),
    summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
    workflows: {
      evidenceReviewQueue: failed === 0 ? 'verified' : 'failed',
      historicalResultReview: failed === 0 ? 'visible' : 'failed',
    },
    reviewQueue: {
      ...analysis.counts,
      items: analysis.queue.slice(0, 20),
    },
    checks,
    limits: [
      'The review queue is diagnostic and does not mutate evidence records.',
      'Conservative historical result records must be reviewed record by record before claiming stronger proof.',
      'External-required records need owner, release, CI, marketplace, or host evidence before upgrade.',
    ],
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  const target = targetArg || createFixture()
  const report = audit(target)
  if (!targetArg) fs.rmSync(target, { recursive: true, force: true })

  if (jsonOnly) console.log(JSON.stringify(report, null, 2))
  else console.log(JSON.stringify(report, null, 2))

  if (report.summary.status === 'failed') process.exit(1)
}
