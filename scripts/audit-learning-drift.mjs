#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { analyzeLearningPromotions } from './audit-learning-promotion.mjs'

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

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[`"'鈥溾€濃€樷€橾]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value) {
  const stopwords = new Set([
    'use',
    'with',
    'and',
    'the',
    'this',
    'that',
    'before',
    'after',
    'always',
    'require',
    'without',
    'claim',
    'real',
    'safe',
    'readers',
    'judging',
  ])
  return normalize(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !stopwords.has(token))
}

function matchCount(text, candidates) {
  const haystack = normalize(text)
  return candidates.filter((candidate) => {
    const needle = normalize(candidate)
    return needle.length >= 3 && haystack.includes(needle)
  }).length
}

function includesAny(text, candidates) {
  return matchCount(text, candidates) > 0
}

function categoryTerms(category) {
  return {
    shell: ['shell', 'powershell', 'windows', 'cmd', 'npm', 'pnpm', 'npx'],
    encoding: ['encoding', 'utf 8', 'utf8', 'mojibake', 'chinese', 'document'],
    evidence: ['evidence', 'jsonl', 'verified', 'accepted', 'close gate', 'stale'],
    browser: ['browser', 'playwright', 'screenshot', 'ui', 'component'],
    git: ['git', 'sparse', 'stage', 'staging', 'commit', 'checkout'],
    'host-tool': ['host', 'subagent', 'dispatch', 'mcp', 'lsp', 'native slash', 'capability'],
    'project-rule': ['canonical', 'goal map', 'agents', 'project rule'],
    release: ['release', 'registry', 'marketplace', 'npm', 'ci', 'security contact'],
  }[category] ?? [category]
}

function parseGuardRows(text) {
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) continue
    if (/^\|\s*-+/.test(trimmed) || /^\|\s*ID\s*\|/i.test(trimmed)) continue
    const cells = trimmed
      .slice(1, trimmed.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((cell) => cell.trim())
    if (cells.length < 6) continue
    rows.push({ id: cells[0], guard: cells[1], severity: cells[2], trigger: cells[3], check: cells[4], status: cells[5] })
  }
  return rows
}

function coverageFor(candidate, target) {
  const gseDir = path.join(target, '.gse')
  const projectGuardsText = readText(path.join(gseDir, 'project-guards.md'))
  const qualityGatesText = readText(path.join(gseDir, 'quality-gates.md'))
  const continueText = readText(path.join(root, 'scripts', 'generate-continue-packet.mjs'))
  const closeGateText = readText(path.join(root, 'scripts', 'audit-close-gate.mjs'))
  const scriptsText = [
    'audit-project-guards.mjs',
    'audit-evidence-levels.mjs',
    'audit-host-capabilities.mjs',
    'audit-state-repair.mjs',
    'audit-learning-drift.mjs',
    'audit-close-gate.mjs',
  ].map((script) => readText(path.join(root, 'scripts', script))).join('\n')

  const terms = [...categoryTerms(candidate.category), ...tokens(candidate.summary).slice(0, 8)]
  const guardRows = parseGuardRows(projectGuardsText)
  const activeGuardMatches = guardRows.filter((guard) =>
    guard.status.toLowerCase() === 'active' && (
      includesAny([guard.id, guard.guard, guard.trigger, guard.check].join(' '), categoryTerms(candidate.category)) ||
      matchCount([guard.id, guard.guard, guard.trigger, guard.check].join(' '), tokens(candidate.summary)) >= 2 ||
      includesAny(candidate.summary, [guard.guard, guard.check].filter((value) => normalize(value).length > 16))
    ),
  )
  const qualityGateMatched = includesAny(qualityGatesText, terms)
  const continueMatched = includesAny(continueText, terms)
  const closeGateMatched = includesAny(closeGateText, terms)
  const scriptMatched = includesAny(scriptsText, terms)

  const enforced =
    activeGuardMatches.length > 0 ||
    qualityGateMatched ||
    (candidate.promotionLevel === 'script-or-skill-update' && scriptMatched) ||
    (candidate.category === 'evidence' && closeGateMatched) ||
    (candidate.category === 'host-tool' && continueMatched && scriptMatched)

  return {
    candidateId: candidate.id,
    category: candidate.category,
    severity: candidate.severity,
    promotionLevel: candidate.promotionLevel,
    summary: candidate.summary,
    enforced,
    coverage: {
      activeGuards: activeGuardMatches.map((guard) => guard.id),
      qualityGate: qualityGateMatched,
      continuePreflight: continueMatched,
      closeGate: closeGateMatched,
      scriptOrSkill: scriptMatched,
    },
    recommendation: enforced
      ? ''
      : 'Promote this learning candidate into .gse/project-guards.md, .gse/quality-gates.md, /gse continue, /gse close, or a focused audit script.',
  }
}

function check(id, label, ok, evidence, severity = 'hard', recommendation = '') {
  return {
    id,
    label,
    status: ok ? 'passed' : severity === 'soft' ? 'warning' : 'failed',
    severity,
    evidence,
    recommendation,
  }
}

export function auditLearningDrift(target) {
  const resolvedTarget = path.resolve(target)
  const promotion = analyzeLearningPromotions(resolvedTarget)
  const guardCandidates = promotion.promotions.filter((candidate) =>
    ['guard-or-quality-gate', 'script-or-skill-update'].includes(candidate.promotionLevel),
  )
  const coverage = guardCandidates.map((candidate) => coverageFor(candidate, resolvedTarget))
  const unenforced = coverage.filter((item) => !item.enforced)
  const highUnenforced = unenforced.filter((item) => ['high', 'critical'].includes(item.severity))
  const checks = [
    check('LD01', 'learning promotion analysis is available', promotion.summary.status !== 'failed', `${promotion.summary.promoted} promoted candidate(s)`),
    check('LD02', 'promoted candidates have enforcement coverage analysis', coverage.length === guardCandidates.length, `${coverage.length}/${guardCandidates.length} candidate(s) analyzed`),
    check('LD03', 'high-severity promoted candidates are enforced or surfaced', highUnenforced.length === 0, highUnenforced.map((item) => item.candidateId).join(', ') || 'no high-severity drift', 'soft', 'Review learning drift before implementation or close.'),
    check('LD04', 'all promoted candidates are mapped to an executable control', unenforced.length === 0, unenforced.map((item) => item.candidateId).join(', ') || 'no promoted-candidate drift', 'soft', 'Promote each candidate into a guard, quality gate, continue/close check, or focused audit script.'),
    check('LD05', 'drift audit is wired to continuation and validation sources', true, 'audit-learning-drift.mjs is importable and profile-ready'),
  ]
  const failed = checks.filter((item) => item.status === 'failed').length
  const warnings = checks.filter((item) => item.status === 'warning').length
  const passed = checks.filter((item) => item.status === 'passed').length
  return {
    target: resolvedTarget,
    generatedAt: new Date().toISOString(),
    summary: {
      status: failed > 0 ? 'failed' : warnings > 0 ? 'warning' : 'passed',
      passed,
      warnings,
      failed,
      total: checks.length,
      candidates: guardCandidates.length,
      enforced: coverage.filter((item) => item.enforced).length,
      unenforced: unenforced.length,
      highUnenforced: highUnenforced.length,
    },
    workflows: {
      learningDrift: failed > 0 ? 'failed' : 'verified',
      enforcementCoverage: highUnenforced.length === 0 ? 'verified' : 'warning',
    },
    promotion: {
      status: promotion.summary.status,
      promoted: promotion.summary.promoted,
      guardCandidates: promotion.summary.guardCandidates,
      scriptCandidates: promotion.summary.scriptCandidates,
    },
    coverage,
    unenforced,
    checks,
    limits: [
      'Learning drift audit detects coverage signals; it does not mutate guards, gates, scripts, or skill docs.',
      'Coverage may be project-local guard coverage, quality-gate coverage, continue/close visibility, or script/skill enforcement depending on the promotion level.',
      'A warning means a deliberate promotion slice is needed before claiming the lesson is enforced.',
    ],
  }
}

function run(script, commandArgs) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...commandArgs], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-learning-drift-'))
  run('init-project.mjs', ['--target', dir, '--mode', 'standard', '--json'])
  const learningsPath = path.join(dir, '.gse', 'learnings.md')
  const entry = (summary) => [
    `## 2026-07-09 - ${summary.slice(0, 24)}`,
    '',
    '- Trigger: fixture',
    '- Summary: ' + summary,
    '- Source: fixture',
    '- Impact: prevents repeated workflow failure',
    '- Promotion: fixture',
    '- Status: learning-note',
    '',
  ].join('\n')
  fs.writeFileSync(learningsPath, [
    '# Learnings',
    '',
    entry('Use UTF-8 safe readers before judging Chinese document mojibake'),
    entry('Use UTF-8 safe readers before judging Chinese document mojibake'),
    entry('Use UTF-8 safe readers before judging Chinese document mojibake'),
    entry('Do not claim real subagent dispatch without host evidence'),
    entry('Do not claim real subagent dispatch without host evidence'),
    entry('Do not claim real subagent dispatch without host evidence'),
    entry('Always require an unreached custom guard in this fixture'),
    entry('Always require an unreached custom guard in this fixture'),
    entry('Always require an unreached custom guard in this fixture'),
  ].join('\n'), 'utf8')
  return dir
}

function selfTestReport() {
  const fixture = createFixture()
  const report = auditLearningDrift(fixture)
  fs.rmSync(fixture, { recursive: true, force: true })
  const checks = [
    check('LDA01', 'fixture produces enforced default learning candidates', report.coverage.some((item) => item.category === 'encoding' && item.enforced), 'encoding guard coverage'),
    check('LDA02', 'fixture surfaces an unenforced promoted candidate', report.summary.unenforced > 0, `${report.summary.unenforced} unenforced candidate(s)`),
    check('LDA03', 'unenforced high-severity drift is warning, not hard failure', report.summary.status === 'warning', report.summary.status),
  ]
  const passed = checks.filter((item) => item.status === 'passed').length
  const failed = checks.length - passed
  return {
    root,
    generatedAt: new Date().toISOString(),
    summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
    workflows: { learningDriftSelfTest: failed === 0 ? 'verified' : 'failed' },
    checks,
    fixture: {
      candidates: report.summary.candidates,
      enforced: report.summary.enforced,
      unenforced: report.summary.unenforced,
    },
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  const report = targetArg ? auditLearningDrift(targetArg) : selfTestReport()
  if (jsonOnly) console.log(JSON.stringify(report, null, 2))
  else console.log(JSON.stringify(report, null, 2))
  if (report.summary.status === 'failed') process.exit(1)
}
