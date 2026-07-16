#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const jsonOnly = args.includes('--json')
const target = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-goal-discovery-'))

function write(relativePath, content) {
  const absolutePath = path.join(target, relativePath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, content, 'utf8')
}

function run(script, commandArgs) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...commandArgs], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  let data = null
  try {
    data = JSON.parse((result.stdout ?? '').trim())
  } catch {
    data = null
  }
  return {
    status: result.status ?? 1,
    data,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

function check(id, label, passed, evidence, risk = '') {
  return { id, label, status: passed ? 'passed' : 'failed', evidence, risk }
}

write('.gse/state.json', JSON.stringify({
  projectName: 'creator-tools',
  canonicalGoalSource: 'README.md',
  phase: 'intake',
}, null, 2))
write('.gse/project-profile.md', '# Project Profile\n\nLocal-first creator tools.\n')
write('.gse/goal-map.md', '# Goal Map\n\n## Current Focus\n\n- Active slice: none\n- Next action: choose a goal\n\n## Goal Nodes\n\n| ID | Goal | Status | Priority | Evidence | Next Slice |\n|---|---|---|---|---|---|\n\n## Risks\n\n- Existing risk remains.\n')
write('README.md', '# Creator Tools\n')

const intent = 'Build a paid creator cover generator in two weeks with local-first storage and no subscription dependency'
const dryRun = run('generate-goal-discovery-packet.mjs', [
  '--root', root,
  '--target', target,
  '--intent', intent,
  '--session-id', 'creator-cover',
  '--json',
])
const dryRunWroteSession = fs.existsSync(path.join(target, '.gse', 'discovery', 'creator-cover.json'))
const persistedRun = run('generate-goal-discovery-packet.mjs', [
  '--root', root,
  '--target', target,
  '--intent', intent,
  '--session-id', 'creator-cover',
  '--execute',
  '--json',
])
const previewRun = run('promote-goal-discovery.mjs', [
  '--root', root,
  '--target', target,
  '--session', 'creator-cover',
  '--select', 'minimal-proof',
  '--promote',
  '--json',
])
const promotedRun = run('promote-goal-discovery.mjs', [
  '--root', root,
  '--target', target,
  '--session', 'creator-cover',
  '--select', 'minimal-proof',
  '--change-id', 'creator-cover-minimal-proof',
  '--promote',
  '--execute',
  '--json',
])
const repeatedRun = run('promote-goal-discovery.mjs', [
  '--root', root,
  '--target', target,
  '--session', 'creator-cover',
  '--select', 'minimal-proof',
  '--change-id', 'creator-cover-minimal-proof',
  '--promote',
  '--execute',
  '--json',
])
const unknownPathRun = run('promote-goal-discovery.mjs', [
  '--root', root,
  '--target', target,
  '--session', 'creator-cover',
  '--select', 'not-a-path',
  '--promote',
  '--json',
])
write('.gse/discovery/malformed.json', '{broken')
const malformedRun = run('promote-goal-discovery.mjs', [
  '--root', root,
  '--target', target,
  '--session', 'malformed',
  '--select', 'minimal-proof',
  '--promote',
  '--json',
])
const missingGseTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-goal-discovery-missing-'))
const missingGseRun = run('promote-goal-discovery.mjs', [
  '--root', root,
  '--target', missingGseTarget,
  '--session', 'creator-cover',
  '--select', 'minimal-proof',
  '--promote',
  '--json',
])
fs.mkdirSync(path.join(target, '.gse', 'changes', 'conflicting-change'), { recursive: true })
write('.gse/changes/conflicting-change/spec.md', '# Existing unrelated spec\n')
const conflictRun = run('promote-goal-discovery.mjs', [
  '--root', root,
  '--target', target,
  '--session', 'creator-cover',
  '--select', 'minimal-proof',
  '--change-id', 'conflicting-change',
  '--promote',
  '--execute',
  '--json',
])

const packet = dryRun.data
const paths = packet?.paths ?? []
const persistedSession = fs.existsSync(path.join(target, '.gse', 'discovery', 'creator-cover.json'))
  ? JSON.parse(fs.readFileSync(path.join(target, '.gse', 'discovery', 'creator-cover.json'), 'utf8'))
  : null
const changeRoot = path.join(target, '.gse', 'changes', 'creator-cover-minimal-proof')
const expectedArtifacts = ['discovery.json', 'brief.md', 'spec.md', 'design.md', 'tasks.md', 'evidence.md', 'review.md']
const goalMapAfterPromotion = fs.readFileSync(path.join(target, '.gse', 'goal-map.md'), 'utf8')
const promotedSpec = fs.existsSync(path.join(changeRoot, 'spec.md')) ? fs.readFileSync(path.join(changeRoot, 'spec.md'), 'utf8') : ''
const pathContract = paths.length === 3 && paths.every((item) => (
  item?.id
  && item?.summary
  && item?.scope
  && item?.cost
  && item?.benefit
  && Array.isArray(item?.risks) && item.risks.length > 0
  && Array.isArray(item?.assumptions)
  && Array.isArray(item?.acceptance) && item.acceptance.length > 0
  && Array.isArray(item?.evidencePlan) && item.evidencePlan.length > 0
))

const checks = [
  check('GD01', 'natural-language intent produces an awaiting-choice packet', dryRun.status === 0 && packet?.status === 'awaiting-choice' && packet?.intent === intent && packet?.interpretedGoal, JSON.stringify(packet), dryRun.stderr),
  check('GD02', 'packet surfaces constraints and unknowns', Array.isArray(packet?.constraints) && packet.constraints.length > 0 && Array.isArray(packet?.unknowns) && packet.unknowns.length > 0, JSON.stringify({ constraints: packet?.constraints, unknowns: packet?.unknowns })),
  check('GD02b', 'packet preserves the explicit delivery-window constraint', packet?.constraints?.some((item) => item.value === 'Delivery window: two weeks'), JSON.stringify(packet?.constraints)),
  check('GD03', 'packet offers exactly three viable paths', paths.length === 3 && new Set(paths.map((item) => item.id)).size === 3, JSON.stringify(paths)),
  check('GD04', 'every path compares cost benefit risk acceptance and evidence', pathContract, JSON.stringify(paths)),
  check('GD05', 'packet includes recommendation and explicit choice prompt', packet?.recommendation?.pathId && packet?.choicePrompt?.includes('--select'), JSON.stringify({ recommendation: packet?.recommendation, choicePrompt: packet?.choicePrompt })),
  check('GD06', 'dry-run discovery writes no session file', !dryRunWroteSession, path.join(target, '.gse', 'discovery', 'creator-cover.json')),
  check('GD07', 'explicit execution persists a self-consistent discovery session', persistedRun.status === 0 && persistedRun.data?.persistence?.written === true && persistedSession?.persistence?.written === true, JSON.stringify({ returned: persistedRun.data, saved: persistedSession }), persistedRun.stderr),
  check('GD08', 'selection promotion preview remains read-only', previewRun.status === 0 && previewRun.data?.status === 'promotion-preview' && previewRun.data?.selectedPath?.id === 'minimal-proof' && previewRun.data?.writes?.performed === false, JSON.stringify(previewRun.data), previewRun.stderr),
  check('GD09', 'explicit promotion creates the complete Goal Spec change pack', promotedRun.status === 0 && promotedRun.data?.status === 'promoted' && expectedArtifacts.every((file) => fs.existsSync(path.join(changeRoot, file))), JSON.stringify(promotedRun.data), promotedRun.stderr),
  check('GD10', 'promoted spec preserves selection acceptance risk and evidence', promotedSpec.includes('minimal-proof') && promotedSpec.includes('## Acceptance Criteria') && promotedSpec.includes('## Risks') && promotedSpec.includes('## Evidence Plan'), promotedSpec),
  check('GD11', 'promotion adds one goal-map projection node', (goalMapAfterPromotion.match(/^\| creator-cover-minimal-proof \|/gm) || []).length === 1, goalMapAfterPromotion),
  check('GD11b', 'promotion inserts the goal node inside Goal Nodes before later sections', goalMapAfterPromotion.indexOf('| creator-cover-minimal-proof |') > goalMapAfterPromotion.indexOf('## Goal Nodes') && goalMapAfterPromotion.indexOf('| creator-cover-minimal-proof |') < goalMapAfterPromotion.indexOf('## Risks'), goalMapAfterPromotion),
  check('GD11c', 'promotion updates current focus to the selected change', goalMapAfterPromotion.includes('- Active slice: creator-cover-minimal-proof') && goalMapAfterPromotion.includes('- Next action: Implement minimal-proof acceptance criteria'), goalMapAfterPromotion),
  check('GD12', 'identical repeated promotion is idempotent', repeatedRun.status === 0 && repeatedRun.data?.status === 'already-promoted' && repeatedRun.data?.writes?.performed === false, JSON.stringify(repeatedRun.data), repeatedRun.stderr),
  check('GD13', 'unknown path returns valid choices without writes', unknownPathRun.status !== 0 && unknownPathRun.data?.status === 'unknown-path' && unknownPathRun.data?.validPathIds?.length === 3, JSON.stringify(unknownPathRun.data), unknownPathRun.stderr),
  check('GD14', 'malformed session fails explicitly', malformedRun.status !== 0 && malformedRun.data?.status === 'invalid-session', JSON.stringify(malformedRun.data), malformedRun.stderr),
  check('GD15', 'promotion refuses targets without GSE state', missingGseRun.status !== 0 && missingGseRun.data?.status === 'missing-gse', JSON.stringify(missingGseRun.data), missingGseRun.stderr),
  check('GD16', 'conflicting change directory is preserved and rejected', conflictRun.status !== 0 && conflictRun.data?.status === 'conflict' && fs.readFileSync(path.join(target, '.gse', 'changes', 'conflicting-change', 'spec.md'), 'utf8').includes('Existing unrelated spec'), JSON.stringify(conflictRun.data), conflictRun.stderr),
]

const failed = checks.filter((item) => item.status === 'failed').length
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed: checks.length - failed, failed, total: checks.length },
  fixture: { target, dryRun: packet },
  checks,
  limits: [
    'This audit proves deterministic discovery packet structure and dry-run safety only.',
    'Generated paths are planning aids; they do not prove product value, market demand, or user acceptance.',
  ],
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else {
  console.log(`# Goal Discovery Audit\n\nStatus: ${report.summary.status}\nChecks: ${report.summary.passed}/${report.summary.total}`)
  for (const item of checks) console.log(`${item.status === 'passed' ? '[x]' : '[ ]'} ${item.id} ${item.label}`)
}

if (failed > 0) process.exit(1)
