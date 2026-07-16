#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findCanonicalGoalSource } from './canonical-goal-source.mjs'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const targetArg = readArg('--target', root)
const jsonOnly = args.includes('--json')
const selfTest = args.includes('--self-test')

function slash(value) {
  return String(value || '').replace(/\\/g, '/')
}

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

function lineCount(text) {
  if (!text) return 0
  return text.split(/\r?\n/).length
}

function statFile(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, bytes: 0, lines: 0, text: '' }
  const text = readText(filePath)
  return { exists: true, bytes: fs.statSync(filePath).size, lines: lineCount(text), text }
}

const ledgerSignalPatterns = [
  /^#+\s*(already landed|still missing|current priority|next slice|risks?|evidence|acceptance)\b/im,
  /\b(slice|evidence|smoke|preflight|verified|accepted|next action|current focus|residual risk|risk archive)\b/i,
  /\.gse\/(?:evidence|goal-map|current-slice|state\.json|session-sync)/i,
]

const projectionSignalPatterns = [
  /\.gse\/goal-map\.md/i,
  /\.gse\/state\.json/i,
  /\.gse\/evidence/i,
  /\.gse\/learning/i,
  /\.gse\/learnings/i,
  /execution projection/i,
  /canonical product goal source/i,
]

function countLedgerSignals(text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter((line) => ledgerSignalPatterns.some((pattern) => pattern.test(line))).length
}

function countProjectionSignals(text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter((line) => projectionSignalPatterns.some((pattern) => pattern.test(line))).length
}

function issue(id, severity, file, problem, recommendation, details = {}) {
  return { id, severity, file: slash(file), problem, recommendation, ...details }
}

export function analyzeCanonicalGoalSourceHygiene(target, canonicalPlan) {
  if (!canonicalPlan) {
    return {
      status: 'not-applicable',
      path: '',
      exists: false,
      bytes: 0,
      lines: 0,
      ledgerSignals: 0,
      recommendation: 'No canonical product goal source was discovered.',
    }
  }

  const filePath = path.join(target, canonicalPlan)
  if (!fs.existsSync(filePath)) {
    return {
      status: 'missing',
      path: slash(canonicalPlan),
      exists: false,
      bytes: 0,
      lines: 0,
      ledgerSignals: 0,
      recommendation: 'Restore the canonical product goal source or update .gse/state.json to point at the current source.',
    }
  }

  const file = statFile(filePath)
  const ledgerSignals = countLedgerSignals(file.text)
  const overlong = file.bytes > 60000 || file.lines > 450
  const ledgerHeavy = ledgerSignals >= 24 || (ledgerSignals >= 12 && file.bytes > 30000)
  const warning = overlong || ledgerHeavy
  return {
    status: warning ? 'warning' : 'passed',
    path: slash(canonicalPlan),
    exists: true,
    bytes: file.bytes,
    lines: file.lines,
    ledgerSignals,
    overlong,
    ledgerHeavy,
    recommendation: warning
      ? 'Keep the canonical product goal source as durable product intent. Move execution ledgers, evidence details, repeated landed slices, and next-action churn into .gse/goal-map.md, .gse/evidence/, or project slice logs.'
      : 'Keep canonical product goal source concise; use GSE artifacts for execution projection and evidence logs.',
    limits: [
      'This is a soft hygiene guard, not a hard failure.',
      'Large docs are acceptable when they contain stable product architecture; the warning targets execution-ledger and evidence-log bloat.',
    ],
  }
}

function analyzeFile(target, relativePath, role, options = {}) {
  const filePath = path.join(target, relativePath)
  const file = statFile(filePath)
  if (!file.exists) return null
  const ledgerSignals = countLedgerSignals(file.text)
  const projectionSignals = countProjectionSignals(file.text)
  const issues = []
  const maxBytes = options.maxBytes ?? 50000
  const maxLines = options.maxLines ?? 420
  const maxLedgerSignals = options.maxLedgerSignals ?? 24
  const maxProjectionSignals = options.maxProjectionSignals ?? 12
  if (file.bytes > maxBytes || file.lines > maxLines) {
    issues.push(issue('DH-overlong', 'warning', relativePath, `${role} is large (${file.bytes} bytes, ${file.lines} lines).`, options.overlongRecommendation ?? 'Move long logs and historical detail into evidence files or archived docs.', { bytes: file.bytes, lines: file.lines }))
  }
  if (ledgerSignals > maxLedgerSignals) {
    issues.push(issue('DH-ledger-heavy', 'warning', relativePath, `${role} contains ${ledgerSignals} execution-ledger signal line(s).`, options.ledgerRecommendation ?? 'Keep only decision-useful current state here; move execution history into .gse/evidence/ or slice logs.', { ledgerSignals }))
  }
  if (projectionSignals > maxProjectionSignals) {
    issues.push(issue('DH-projection-heavy', 'warning', relativePath, `${role} contains ${projectionSignals} projection-routing signal line(s).`, options.projectionRecommendation ?? 'Keep project intent, execution projection, state, evidence, and learning in separate files so the canonical document does not become a GSE ledger.', { projectionSignals }))
  }
  return { role, path: slash(relativePath), exists: true, bytes: file.bytes, lines: file.lines, ledgerSignals, projectionSignals, issues }
}

export function auditDocumentHygiene(target) {
  const resolvedTarget = path.resolve(target)
  const state = readJson(path.join(resolvedTarget, '.gse', 'state.json'))
  const canonicalPlan = findCanonicalGoalSource(resolvedTarget, state)
  const files = []

  const canonical = analyzeCanonicalGoalSourceHygiene(resolvedTarget, canonicalPlan)
  if (canonical.path) {
    files.push({
      role: 'canonical-product-goal-source',
      path: canonical.path,
      exists: canonical.exists,
      bytes: canonical.bytes,
      lines: canonical.lines,
      ledgerSignals: canonical.ledgerSignals,
      projectionSignals: canonical.projectionSignals ?? 0,
      issues: canonical.status === 'warning' || canonical.status === 'missing'
        ? [issue('DH-canonical-boundary', canonical.status === 'missing' ? 'hard' : 'warning', canonical.path, canonical.recommendation, canonical.recommendation, canonical)]
        : [],
    })
  }

  const candidates = [
    ['README.md', 'readme', { maxBytes: 70000, maxLines: 700, maxLedgerSignals: 40 }],
    ['README.zh-CN.md', 'readme', { maxBytes: 70000, maxLines: 700, maxLedgerSignals: 40 }],
    ['AGENTS.md', 'agent-instructions', { maxBytes: 45000, maxLines: 450, maxLedgerSignals: 18 }],
    ['CLAUDE.md', 'agent-instructions', { maxBytes: 45000, maxLines: 450, maxLedgerSignals: 18 }],
    ['CONTEXT.md', 'agent-instructions', { maxBytes: 45000, maxLines: 450, maxLedgerSignals: 18 }],
    ['.gse/goal-map.md', 'gse-execution-projection', { maxBytes: 30000, maxLines: 320, maxLedgerSignals: 50 }],
    ['.gse/current-slice.md', 'current-slice', { maxBytes: 24000, maxLines: 260, maxLedgerSignals: 45 }],
  ]
  for (const [relativePath, role, options] of candidates) {
    const analyzed = analyzeFile(resolvedTarget, relativePath, role, options)
    if (analyzed) files.push(analyzed)
  }

  const evidenceDir = path.join(resolvedTarget, '.gse', 'evidence')
  if (fs.existsSync(evidenceDir)) {
    for (const entry of fs.readdirSync(evidenceDir)) {
      if (!/\.md$/i.test(entry)) continue
      const analyzed = analyzeFile(resolvedTarget, path.join('.gse', 'evidence', entry), 'evidence-log', { maxBytes: 90000, maxLines: 900, maxLedgerSignals: 120 })
      if (analyzed) files.push(analyzed)
    }
  }

  const issues = files.flatMap((file) => file.issues)
  const hard = issues.filter((item) => item.severity === 'hard').length
  const warnings = issues.filter((item) => item.severity === 'warning').length
  return {
    root,
    target: resolvedTarget,
    generatedAt: new Date().toISOString(),
    summary: {
      status: hard ? 'failed' : warnings ? 'warning' : 'passed',
      hard,
      warnings,
      files: files.length,
      issues: issues.length,
    },
    canonicalGoalSource: canonical,
    files,
    issues,
    workflows: {
      documentHygiene: hard ? 'failed' : 'verified',
      canonicalGoalSourceBoundary: canonical.status === 'warning' ? 'warning' : canonical.status,
    },
    limits: [
      'Document hygiene is a boundary audit; it does not rewrite project docs.',
      'Warnings flag likely ledger bloat, not every long architecture document.',
      'Use compact-canonical-goal-source.mjs --dry-run before editing canonical product docs.',
    ],
  }
}

function createFixture(kind) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gse-doc-hygiene-${kind}-`))
  fs.mkdirSync(path.join(dir, '.gse', 'evidence'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.gse', 'state.json'), JSON.stringify({ canonicalPlan: 'docs/productization-architecture.md' }, null, 2) + '\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'goal-map.md'), '# Goal Map\n\nCanonical product goal source: `docs/productization-architecture.md`\n\n.gse execution projection. Canonical product goal source wins.\n', 'utf8')
  const canonical = kind === 'bloated'
    ? '# Productization Architecture\n\n' + Array.from({ length: 80 }, (_, index) => `- Already landed slice ${index}: evidence verified; next action continues preflight ledger.`).join('\n') + '\n'
    : '# Productization Architecture\n\nDurable product intent.\n'
  fs.writeFileSync(path.join(dir, 'docs', 'productization-architecture.md'), canonical, 'utf8')
  fs.writeFileSync(path.join(dir, 'README.md'), '# Fixture\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'evidence', '2026-07-11.md'), '# Evidence\n\n- verified smoke.\n', 'utf8')
  return dir
}

function selfTestReport() {
  const clean = createFixture('clean')
  const bloated = createFixture('bloated')
  const cleanReport = auditDocumentHygiene(clean)
  const bloatedReport = auditDocumentHygiene(bloated)
  const checks = [
    { id: 'DH-T01', status: cleanReport.summary.status === 'passed' ? 'passed' : 'failed', evidence: cleanReport.summary.status },
    { id: 'DH-T02', status: bloatedReport.summary.status === 'warning' && bloatedReport.canonicalGoalSource.status === 'warning' ? 'passed' : 'failed', evidence: bloatedReport.canonicalGoalSource.recommendation },
  ]
  const passed = checks.filter((item) => item.status === 'passed').length
  const failed = checks.length - passed
  fs.rmSync(clean, { recursive: true, force: true })
  fs.rmSync(bloated, { recursive: true, force: true })
  return { root, generatedAt: new Date().toISOString(), summary: { status: failed ? 'failed' : 'passed', passed, failed, total: checks.length }, checks }
}

function renderMarkdown(report) {
  const lines = ['# GSE Document Hygiene', '', 'Generated: ' + report.generatedAt, 'Target: ' + report.target, '', '## Summary', '', '- Status: ' + report.summary.status, '- Files: ' + report.summary.files, '- Issues: ' + report.summary.issues]
  if (report.issues?.length) {
    lines.push('', '## Issues', '')
    for (const item of report.issues) lines.push(`- [${item.severity}] ${item.file}: ${item.problem}`)
  }
  return lines.join('\n') + '\n'
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isCli) {
  const report = selfTest ? selfTestReport() : auditDocumentHygiene(targetArg)
  if (jsonOnly) console.log(JSON.stringify(report, null, 2))
  else console.log(renderMarkdown(report))
  if (report.summary.status === 'failed') process.exit(1)
}
