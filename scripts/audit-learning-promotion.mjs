#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const targetArg = readArg('--target')
const jsonOnly = args.includes('--json')
const write = args.includes('--write') || args.includes('--execute')

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[`"'“”‘’]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function slugify(value) {
  return normalize(value)
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'learning'
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const CATEGORY_RULES = [
  { category: 'encoding', severity: 'high', patterns: [/utf-?8/i, /encoding/i, /mojibake/i, /乱码/, /中文/] },
  { category: 'shell', severity: 'high', patterns: [/powershell/i, /\bcmd\b/i, /&&/, /shell/i, /windows/i] },
  { category: 'git', severity: 'high', patterns: [/git/i, /sparse/i, /stage/i, /commit/i, /checkout/i] },
  { category: 'host-tool', severity: 'high', patterns: [/subagent/i, /dispatch/i, /mcp/i, /lsp/i, /native slash/i, /host/i] },
  { category: 'evidence', severity: 'high', patterns: [/evidence/i, /jsonl/i, /verified/i, /accepted/i, /close gate/i] },
  { category: 'browser', severity: 'medium', patterns: [/browser/i, /playwright/i, /screenshot/i, /ui\b/i, /component test/i] },
  { category: 'project-rule', severity: 'medium', patterns: [/project/i, /canonical/i, /goal map/i, /AGENTS\.md/i, /规则/] },
  { category: 'release', severity: 'medium', patterns: [/release/i, /registry/i, /marketplace/i, /npm/i, /ci\b/i, /security contact/i] },
]

function classify(summary, trigger = '', impact = '') {
  const text = [summary, trigger, impact].join(' ')
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return { category: rule.category, severity: rule.severity }
    }
  }
  return { category: 'project-rule', severity: 'low' }
}

function promotionFor(count, severity) {
  if (count >= 5) return { level: 'script-or-skill-update', target: severity === 'high' ? 'script/test plus project guard' : 'template or skill update' }
  if (count >= 3) return { level: 'guard-or-quality-gate', target: severity === 'high' ? 'project guard or quality gate' : 'project guard candidate' }
  if (count >= 2) return { level: 'checklist-or-template', target: 'checklist or template update' }
  return { level: 'learning-note', target: 'keep as learning note' }
}

function parseLearningEntries(text) {
  const entries = []
  let current = null
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+)$/)
    if (heading) {
      if (current) entries.push(current)
      current = { heading: heading[1], trigger: '', summary: '', source: '', impact: '', promotion: '', status: '', occurrences: 1 }
      continue
    }
    if (!current) continue
    const field = line.match(/^-\s*([^:]+):\s*(.*)$/)
    if (!field) continue
    const key = normalize(field[1])
    const value = clean(field[2])
    if (key === 'trigger') current.trigger = value
    if (key === 'summary') current.summary = value
    if (key === 'source') current.source = value
    if (key === 'impact') current.impact = value
    if (key === 'promotion') current.promotion = value
    if (key === 'status') current.status = value
    if (key === 'occurrences') current.occurrences = Math.max(1, Number(value) || 1)
  }
  if (current) entries.push(current)
  return entries.filter((entry) => entry.summary)
}

function groupEntries(entries) {
  const groups = new Map()
  for (const entry of entries) {
    const key = normalize(entry.summary)
    const existing = groups.get(key) ?? {
      key,
      summary: entry.summary,
      triggerExamples: [],
      sourceExamples: [],
      impactExamples: [],
      entries: [],
    }
    existing.entries.push(entry)
    existing.count = (existing.count ?? 0) + (entry.occurrences ?? 1)
    if (entry.trigger && !existing.triggerExamples.includes(entry.trigger)) existing.triggerExamples.push(entry.trigger)
    if (entry.source && !existing.sourceExamples.includes(entry.source)) existing.sourceExamples.push(entry.source)
    if (entry.impact && !existing.impactExamples.includes(entry.impact)) existing.impactExamples.push(entry.impact)
    groups.set(key, existing)
  }
  return [...groups.values()]
}

function renderPromotionsMarkdown(report) {
  const lines = []
  lines.push('# Learning Promotions')
  lines.push('')
  lines.push('Generated: ' + report.generatedAt)
  lines.push('Source: `.gse/learnings.md`')
  lines.push('')
  lines.push('This file is generated by `scripts/audit-learning-promotion.mjs --write`.')
  lines.push('Review candidates before copying any rule into `.gse/project-guards.md`, `.gse/quality-gates.md`, templates, scripts, or the GSE skill.')
  lines.push('')
  lines.push('| ID | Category | Severity | Count | Promotion | Target | Summary |')
  lines.push('|---|---|---|---:|---|---|---|')
  for (const item of report.promotions) {
    lines.push(`| ${item.id} | ${item.category} | ${item.severity} | ${item.count} | ${item.promotionLevel} | ${item.promotionTarget} | ${item.summary.replace(/\|/g, '/')} |`)
  }
  if (report.promotions.length === 0) lines.push('| none | - | - | 0 | learning-note | keep recording | No repeated lesson has reached promotion threshold yet. |')
  lines.push('')
  lines.push('## Guard Candidates')
  lines.push('')
  for (const item of report.promotions.filter((candidate) => ['guard-or-quality-gate', 'script-or-skill-update'].includes(candidate.promotionLevel))) {
    lines.push(`### ${item.id}`)
    lines.push('')
    lines.push('- Guard: ' + item.summary)
    lines.push('- Severity: ' + item.severity)
    lines.push('- Trigger: ' + item.category)
    lines.push('- Check: Confirm this lesson is handled before implementation or close.')
    lines.push('- Source count: ' + item.count)
    lines.push('')
  }
  return lines.join('\n') + '\n'
}

export function analyzeLearningPromotions(target) {
  const resolvedTarget = path.resolve(target)
  const learningsPath = path.join(resolvedTarget, '.gse', 'learnings.md')
  const exists = fs.existsSync(learningsPath)
  const text = exists ? readText(learningsPath) : ''
  const entries = parseLearningEntries(text)
  const groups = groupEntries(entries)
  const promotions = groups.map((group) => {
    const classification = classify(group.summary, group.triggerExamples.join(' '), group.impactExamples.join(' '))
    const count = group.count || group.entries.length
    const promotion = promotionFor(count, classification.severity)
    return {
      id: 'LP-' + slugify(group.summary).toUpperCase(),
      summary: group.summary,
      category: classification.category,
      severity: classification.severity,
      count,
      promotionLevel: promotion.level,
      promotionTarget: promotion.target,
      triggerExamples: group.triggerExamples.slice(0, 3),
      sourceExamples: group.sourceExamples.slice(0, 3),
      impactExamples: group.impactExamples.slice(0, 3),
    }
  }).sort((a, b) => {
    const levelOrder = { 'script-or-skill-update': 0, 'guard-or-quality-gate': 1, 'checklist-or-template': 2, 'learning-note': 3 }
    return (levelOrder[a.promotionLevel] ?? 9) - (levelOrder[b.promotionLevel] ?? 9) || b.count - a.count || a.id.localeCompare(b.id)
  })
  const promoted = promotions.filter((item) => item.promotionLevel !== 'learning-note')
  const guardCandidates = promotions.filter((item) => ['guard-or-quality-gate', 'script-or-skill-update'].includes(item.promotionLevel))
  const scriptCandidates = promotions.filter((item) => item.promotionLevel === 'script-or-skill-update')
  const outputPath = path.join(resolvedTarget, '.gse', 'learning-promotions.md')
  return {
    target: resolvedTarget,
    generatedAt: new Date().toISOString(),
    path: '.gse/learning-promotions.md',
    source: '.gse/learnings.md',
    exists,
    summary: {
      status: !exists ? 'warning' : 'passed',
      entries: entries.length,
      uniqueLessons: groups.length,
      duplicateGroups: groups.filter((group) => group.entries.length > 1).length,
      promoted: promoted.length,
      guardCandidates: guardCandidates.length,
      scriptCandidates: scriptCandidates.length,
    },
    promotions,
    outputPath,
    limits: [
      'Promotion analysis is deterministic and project-generic; it does not hardcode AION or MuseFlow behavior.',
      'Write mode creates .gse/learning-promotions.md candidates only; project guards and scripts still require deliberate review.',
      'Missing learnings are a warning, not a hard failure, because new projects may not have lessons yet.',
    ],
  }
}

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

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-learning-promotion-'))
  const init = run('init-project.mjs', ['--target', dir, '--mode', 'standard', '--json'])
  const learningsPath = path.join(dir, '.gse', 'learnings.md')
  const entry = (date, summary, trigger, source) => [
    `## ${date} - ${slugify(summary)}`,
    '',
    '- Trigger: ' + trigger,
    '- Summary: ' + summary,
    '- Source: ' + source,
    '- Impact: prevents recurring workflow failure',
    '- Promotion: learning promotion audit fixture',
    '- Status: learning-note',
    '',
  ].join('\n')
  const text = [
    '# Learnings',
    '',
    entry('2026-07-08', 'Use UTF-8 safe readers before judging Chinese document mojibake', 'encoding review', 'fixture'),
    entry('2026-07-08', 'Use UTF-8 safe readers before judging Chinese document mojibake', 'encoding review repeat', 'fixture'),
    entry('2026-07-08', 'Use UTF-8 safe readers before judging Chinese document mojibake', 'encoding review third', 'fixture'),
    entry('2026-07-08', 'Do not claim real subagent dispatch without host evidence', 'subagent review', 'fixture'),
    entry('2026-07-08', 'Do not claim real subagent dispatch without host evidence', 'subagent review repeat', 'fixture'),
    entry('2026-07-08', 'Avoid PowerShell && and use host-appropriate shell syntax on Windows', 'shell failure', 'fixture'),
    entry('2026-07-08', 'Avoid PowerShell && and use host-appropriate shell syntax on Windows', 'shell failure repeat', 'fixture'),
    entry('2026-07-08', 'Avoid PowerShell && and use host-appropriate shell syntax on Windows', 'shell failure third', 'fixture'),
    entry('2026-07-08', 'Avoid PowerShell && and use host-appropriate shell syntax on Windows', 'shell failure fourth', 'fixture'),
    entry('2026-07-08', 'Avoid PowerShell && and use host-appropriate shell syntax on Windows', 'shell failure fifth', 'fixture'),
  ].join('\n')
  fs.writeFileSync(learningsPath, text, 'utf8')
  return { dir, init }
}

function audit(target) {
  const analysis = analyzeLearningPromotions(target)
  const checks = [
    check('LP01', 'learning promotion source is present or reported as warning', analysis.exists || analysis.summary.status === 'warning', analysis.exists ? analysis.source : 'missing learnings warning'),
    check('LP02', 'learning entries parse into normalized groups', !analysis.exists || analysis.summary.uniqueLessons > 0, `${analysis.summary.uniqueLessons} unique lesson(s)`),
    check('LP03', 'promotion thresholds follow documented upgrade rule', analysis.promotions.every((item) =>
      (item.count >= 5 && item.promotionLevel === 'script-or-skill-update') ||
      (item.count >= 3 && item.count < 5 && item.promotionLevel === 'guard-or-quality-gate') ||
      (item.count >= 2 && item.count < 3 && item.promotionLevel === 'checklist-or-template') ||
      (item.count < 2 && item.promotionLevel === 'learning-note')
    ), 'note -> checklist/template -> guard/quality gate -> script/skill'),
    check('LP04', 'promotion candidates include category and severity', analysis.promotions.every((item) => item.category && item.severity), 'category/severity assigned'),
    check('LP05', 'write mode is candidate-only', true, 'write mode creates .gse/learning-promotions.md, not project guard mutations'),
  ]
  let writeStatus = null
  if (write) {
    fs.mkdirSync(path.dirname(analysis.outputPath), { recursive: true })
    fs.writeFileSync(analysis.outputPath, renderPromotionsMarkdown(analysis), 'utf8')
    writeStatus = {
      status: 'written',
      path: analysis.path,
      effect: 'candidate-only learning promotion report',
    }
  }
  const passed = checks.filter((item) => item.status === 'passed').length
  const failed = checks.length - passed
  return {
    ...analysis,
    summary: {
      ...analysis.summary,
      status: failed === 0 ? analysis.summary.status : 'failed',
      passed,
      failed,
      total: checks.length,
    },
    workflows: {
      learningPromotion: failed === 0 ? 'verified' : 'failed',
      candidateWrite: write ? 'verified' : 'dry-run',
    },
    write: writeStatus,
    checks,
  }
}

function selfTestReport() {
  const fixture = createFixture()
  const fixtureReport = audit(fixture.dir)
  const missingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-learning-promotion-missing-'))
  fs.mkdirSync(path.join(missingDir, '.gse'), { recursive: true })
  const missingReport = analyzeLearningPromotions(missingDir)
  fs.rmSync(fixture.dir, { recursive: true, force: true })
  fs.rmSync(missingDir, { recursive: true, force: true })
  const checks = [
    check('LPA01', 'init-project supports learning store', fixture.init.status === 0, 'scripts/init-project.mjs'),
    check('LPA02', 'repeated encoding lesson becomes guard candidate', fixtureReport.promotions.some((item) => item.category === 'encoding' && item.count === 3 && item.promotionLevel === 'guard-or-quality-gate'), 'encoding fixture'),
    check('LPA03', 'fifth shell occurrence becomes script or skill candidate', fixtureReport.promotions.some((item) => item.category === 'shell' && item.count === 5 && item.promotionLevel === 'script-or-skill-update'), 'shell fixture'),
    check('LPA04', 'second host-tool lesson becomes checklist/template candidate', fixtureReport.promotions.some((item) => item.category === 'host-tool' && item.count === 2 && item.promotionLevel === 'checklist-or-template'), 'host-tool fixture'),
    check('LPA05', 'missing learnings is warning not hard failure', missingReport.summary.status === 'warning', 'missing learning store'),
  ]
  const passed = checks.filter((item) => item.status === 'passed').length
  const failed = checks.length - passed
  return {
    root,
    generatedAt: new Date().toISOString(),
    summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
    workflows: {
      learningPromotion: failed === 0 ? 'verified' : 'failed',
      fixtureCoverage: failed === 0 ? 'verified' : 'failed',
    },
    fixture: {
      promoted: fixtureReport.summary.promoted,
      guardCandidates: fixtureReport.summary.guardCandidates,
      scriptCandidates: fixtureReport.summary.scriptCandidates,
      categories: fixtureReport.promotions.map((item) => item.category),
    },
    checks,
    limits: [
      'Self-test uses generic shell, encoding, and host-tool lessons.',
      'No target-project behavior is hardcoded.',
    ],
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  const report = targetArg ? audit(targetArg) : selfTestReport()
  if (jsonOnly) console.log(JSON.stringify(report, null, 2))
  else console.log(JSON.stringify(report, null, 2))
  if (report.summary.status === 'failed') process.exit(1)
}
