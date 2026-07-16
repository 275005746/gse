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

function readAllArgs(name) {
  const values = []
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1])
  }
  return values
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const jsonOnly = args.includes('--json')
const strictWarnings = args.includes('--strict-warnings')

function run(script, commandArgs, options = {}) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...commandArgs], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  })
  const stdout = (result.stdout ?? '').trim()
  let parsed = null
  try {
    parsed = JSON.parse(stdout)
  } catch {
    parsed = null
  }
  return {
    script,
    command: [process.execPath, path.join(root, 'scripts', script), ...commandArgs].join(' '),
    status: result.status ?? 1,
    stdout,
    stderr: (result.stderr ?? '').trim(),
    parsed,
  }
}

function check(id, label, status, evidence, recommendation = '') {
  return { id, label, status, evidence, recommendation }
}

function parseTargets() {
  const explicitTargets = readAllArgs('--target')
  const namedTargets = [
    { id: 'aion', root: readArg('--aion-target', process.env.GSE_AION_TARGET || null) },
    { id: 'museflow', root: readArg('--museflow-target', process.env.GSE_MUSEFLOW_TARGET || null) },
  ].filter((item) => item.root)
  const explicit = explicitTargets.map((target, index) => ({
    id: `target-${index + 1}`,
    root: target,
  }))
  return [...namedTargets, ...explicit].map((item) => ({
    ...item,
    root: path.resolve(item.root),
  }))
}

function statusFromRun(runResult) {
  if (!runResult.parsed) return runResult.status === 0 ? 'passed' : 'failed'
  const summaryStatus = runResult.parsed.summary?.status
  if (summaryStatus === 'failed' || summaryStatus === 'not-ready') return 'failed'
  if (summaryStatus === 'warning' || summaryStatus === 'ready-with-warnings') return 'warning'
  if ((runResult.parsed.summary?.failed ?? 0) > 0) return 'failed'
  if ((runResult.parsed.summary?.warnings ?? 0) > 0) return 'warning'
  return runResult.status === 0 ? 'passed' : 'failed'
}

function evidenceFromRun(runResult) {
  const summary = runResult.parsed?.summary
  if (!summary) return runResult.stderr || runResult.stdout.slice(0, 160) || `exit:${runResult.status}`
  const parts = []
  if (summary.status) parts.push(`status:${summary.status}`)
  if (Number.isFinite(summary.passed) && Number.isFinite(summary.total)) parts.push(`checks:${summary.passed}/${summary.total}`)
  if (Number.isFinite(summary.warnings)) parts.push(`warnings:${summary.warnings}`)
  if (Number.isFinite(summary.failed)) parts.push(`failed:${summary.failed}`)
  if (Number.isFinite(summary.blockedGates)) parts.push(`blockedGates:${summary.blockedGates}`)
  if (Number.isFinite(summary.highUnenforced)) parts.push(`highUnenforced:${summary.highUnenforced}`)
  return parts.join(', ') || `exit:${runResult.status}`
}

function compactText(value, limit = 180) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= limit) return text
  return text.slice(0, limit - 3) + '...'
}

function warningChecks(runResult) {
  return (runResult.parsed?.checks ?? [])
    .filter((item) => item.status === 'warning' || item.status === 'failed')
    .map((item) => ({
      id: item.id,
      label: item.label,
      status: item.status,
      evidence: compactText(item.evidence),
      recommendation: compactText(item.recommendation),
    }))
}

function repairIssues(runResult) {
  return (runResult.parsed?.repairActions ?? [])
    .map((item) => ({
      id: item.id,
      label: item.problem,
      status: item.severity === 'hard' ? 'failed' : 'warning',
      evidence: item.targetPath,
      recommendation: compactText(item.command),
    }))
}

function uniqueIssues(items, limit = 8) {
  const seen = new Set()
  const result = []
  for (const item of items) {
    const key = `${item.id}:${item.label}:${item.evidence}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
    if (result.length >= limit) break
  }
  return result
}

function classifyTargetAdoption({ hasHardFailure, hasWarnings, topLocalIssues }) {
  if (hasHardFailure) return 'target-hard-failure'
  if (topLocalIssues.length > 0) return 'target-local-adoption-hygiene'
  if (hasWarnings) return 'gse-ready-with-soft-warnings'
  return 'gse-ready'
}

function hasDirtyGseIssue(topLocalIssues) {
  return topLocalIssues.some((item) => {
    const id = String(item.id ?? '')
    const evidence = String(item.evidence ?? '').toLowerCase()
    if (id.startsWith('SR')) return false
    return (
      id === 'TPD09' ||
      id === 'CG08' ||
      evidence.includes('.gse/') ||
      evidence.includes('.gse\\')
    )
  })
}

function hasDirtyTargetWorktreeIssue(topLocalIssues) {
  return topLocalIssues.some((item) => {
    const id = String(item.id ?? '')
    const label = String(item.label ?? '').toLowerCase()
    const evidence = String(item.evidence ?? '').toLowerCase()
    return (
      id === 'CG11' ||
      label.includes('worktree') ||
      evidence.includes('staged') ||
      evidence.includes('unstaged') ||
      evidence.includes('untracked') ||
      evidence.includes('conflict')
    )
  })
}

function hasStateRepairIssue(topLocalIssues) {
  return topLocalIssues.some((item) => String(item.id ?? '').startsWith('SR'))
}

function buildRepairPlan({ topLocalIssues, stateRepairSummary }) {
  const dirtyGse = hasDirtyGseIssue(topLocalIssues)
  const dirtyTargetWorktree = hasDirtyTargetWorktreeIssue(topLocalIssues)
  const stateRepairAdvised = hasStateRepairIssue(topLocalIssues) || (stateRepairSummary.actions ?? 0) > 0
  const repairBlockedByDirtyWorktree = dirtyGse || dirtyTargetWorktree
  const steps = []
  if (dirtyTargetWorktree) {
    steps.push({
      id: 'resolve-worktree-ownership',
      status: 'required-first',
      action: 'Review current target worktree ownership, finish or exclude unrelated target-session changes, and stage/commit only the active slice before repair.',
    })
  } else if (dirtyGse) {
    steps.push({
      id: 'resolve-gse-worktree-ownership',
      status: 'required-first',
      action: 'Review current .gse worktree ownership, finish or exclude unrelated target-session changes, and stage/commit only the active slice before repair.',
    })
  }
  if (stateRepairAdvised) {
    steps.push({
      id: 'compact-state-risks',
      status: repairBlockedByDirtyWorktree ? 'blocked-until-worktree-owned' : 'ready',
      action: 'Run `/gse repair --execute` only after the target worktree and .gse state are owned and reversible backup output is acceptable.',
    })
  }
  if (!steps.length) {
    steps.push({
      id: 'no-repair-required',
      status: 'ready',
      action: 'No target adoption repair step is required before normal continuation.',
    })
  }
  return {
    repairBlockedByDirtyGse: dirtyGse && stateRepairAdvised,
    repairBlockedByDirtyWorktree: repairBlockedByDirtyWorktree && stateRepairAdvised,
    stateRepairAdvised,
    dirtyGseWorktree: dirtyGse,
    dirtyTargetWorktree,
    steps,
  }
}

function buildRecommendedNextActions(topLocalIssues, repairPlan) {
  const actions = []
  for (const step of repairPlan.steps) {
    if (step.id === 'no-repair-required') continue
    actions.push(step.action)
  }
  for (const issue of uniqueIssues(topLocalIssues, 8)) {
    if (!issue.recommendation) continue
    if (repairPlan.repairBlockedByDirtyWorktree && String(issue.id ?? '').startsWith('SR')) continue
    actions.push(issue.recommendation)
  }
  return [...new Set(actions)].slice(0, 6)
}

function buildTargetAdoptionSummary(commandRuns, checks) {
  const failed = checks.filter((item) => item.status === 'failed')
  const warnings = checks.filter((item) => item.status === 'warning')
  const continueSummary = commandRuns.continue.parsed?.summary ?? {}
  const stateRepairSummary = commandRuns.stateRepair.parsed?.summary ?? {}
  const portableContinueUsable =
    commandRuns.continue.status === 0 &&
    (continueSummary.failedHardChecks ?? 0) === 0 &&
    (continueSummary.blockedGates ?? 0) === 0
  const activeRiskCount = continueSummary.activeRiskCount ?? continueSummary.riskCount ?? null
  const topLocalIssues = uniqueIssues([
    ...repairIssues(commandRuns.stateRepair),
    ...warningChecks(commandRuns.doctor),
    ...warningChecks(commandRuns.close),
    ...warningChecks(commandRuns.hostCapabilities),
    ...warningChecks(commandRuns.learningDrift),
  ])
  const repairPlan = buildRepairPlan({ topLocalIssues, stateRepairSummary })
  const recommendedNextActions = buildRecommendedNextActions(topLocalIssues, repairPlan)
  const hasHardFailure = failed.length > 0 || (stateRepairSummary.hard ?? 0) > 0
  const hasWarnings = warnings.length > 0 || (stateRepairSummary.warnings ?? 0) > 0
  return {
    classification: classifyTargetAdoption({ hasHardFailure, hasWarnings, topLocalIssues }),
    gseCoreGap: false,
    coreGapAssessment: 'not-assessed-by-target-drill',
    portableContinueUsable,
    hostNativeSlashCommand: 'not-proven',
    longPromptRisk: portableContinueUsable
      ? Number.isFinite(activeRiskCount) && activeRiskCount > 20
        ? 'risk-dump-needs-compaction'
        : 'low'
      : 'unknown',
    activeRiskCount,
    stateRepairStatus: stateRepairSummary.status ?? 'unknown',
    topLocalIssues,
    repairPlan,
    recommendedNextActions,
    limits: [
      'This classifies target-project adoption hygiene, not product readiness.',
      'gseCoreGap=false means this target drill did not find or claim a GSE core gap; full core-gap coverage belongs to GSE self audits.',
      'Portable /gse continue success does not prove host-native slash-command support.',
      'Warnings should be fixed before claiming a target project is fully GSE-ready, but they do not block normal continuation unless project policy says so.',
    ],
  }
}

function validateAdoptionSummary(target) {
  const summary = target.adoptionSummary
  const allowedClassifications = new Set([
    'gse-ready',
    'gse-ready-with-soft-warnings',
    'target-local-adoption-hygiene',
    'target-hard-failure',
  ])
  const failures = []
  if (!summary || typeof summary !== 'object') failures.push('missing adoptionSummary')
  if (summary && !allowedClassifications.has(summary.classification)) failures.push('invalid classification')
  if (summary && typeof summary.gseCoreGap !== 'boolean') failures.push('gseCoreGap is not boolean')
  if (summary && summary.coreGapAssessment !== 'not-assessed-by-target-drill') failures.push('coreGapAssessment boundary is missing')
  if (summary && typeof summary.portableContinueUsable !== 'boolean') failures.push('portableContinueUsable is not boolean')
  if (summary && !Array.isArray(summary.topLocalIssues)) failures.push('topLocalIssues is not an array')
  if (summary && !summary.repairPlan) failures.push('missing repairPlan')
  if (summary?.repairPlan && typeof summary.repairPlan.repairBlockedByDirtyGse !== 'boolean') failures.push('repairPlan.repairBlockedByDirtyGse is not boolean')
  if (summary?.repairPlan && typeof summary.repairPlan.repairBlockedByDirtyWorktree !== 'boolean') failures.push('repairPlan.repairBlockedByDirtyWorktree is not boolean')
  if (summary?.repairPlan && typeof summary.repairPlan.dirtyTargetWorktree !== 'boolean') failures.push('repairPlan.dirtyTargetWorktree is not boolean')
  if (summary?.repairPlan && !Array.isArray(summary.repairPlan.steps)) failures.push('repairPlan.steps is not an array')
  if (summary && !Array.isArray(summary.recommendedNextActions)) failures.push('recommendedNextActions is not an array')
  if (summary?.repairPlan?.repairBlockedByDirtyWorktree) {
    const firstAction = String(summary.recommendedNextActions?.[0] ?? '')
    if (!firstAction.includes('worktree ownership')) failures.push('dirty repair plan does not prioritize worktree ownership')
  }
  if (summary?.classification === 'target-local-adoption-hygiene' && summary.topLocalIssues.length === 0) {
    failures.push('local hygiene classification has no local issues')
  }
  return check(
    `${target.id}-adoption-summary`,
    'target adoption summary is structured and separates soft warnings from local hygiene',
    failures.length === 0 ? 'passed' : 'failed',
    failures.length === 0
      ? `classification:${summary.classification}, portableContinueUsable:${summary.portableContinueUsable}, gseCoreGap:${summary.gseCoreGap}`
      : failures.join('; '),
    'Keep adoptionSummary machine-readable so project adoption reports do not overstate GSE core gaps.',
  )
}

function createFixture(label, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gse-hardening-${label}-`))
  const init = run('init-project.mjs', ['--target', dir, '--mode', 'enterprise', '--json'])
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs', 'productization-architecture.md'), `# ${label} Productization\n`, 'utf8')

  const statePath = path.join(dir, '.gse', 'state.json')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  state.canonicalGoalSource = 'docs/productization-architecture.md'
  state.canonicalPlan = 'docs/productization-architecture.md'
  state.phase = 'verify'
  state.currentSlice = {
    id: `${label}-hardening-fixture`,
    outcome: `${label} hardening fixture.`,
    status: 'verified',
    nextAction: 'Continue target hardening drill.',
  }
  state.lastEvidence = '.gse/evidence/2026-07-09.md'
  state.residualRisks = options.committedRepair
    ? Array.from({ length: 8 }, (_, index) => `Committed fixture residual risk ${index + 1} that should be compacted only after worktree ownership is resolved.`)
    : []
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8')
  fs.appendFileSync(path.join(dir, '.gse', 'README.md'), '\nCanonical plan: `docs/productization-architecture.md`.\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'goal-map.md'), `# Goal Map

Canonical product goal source: \`docs/productization-architecture.md\`.

This file is a GSE execution projection. Canonical product goal source wins if this projection conflicts with product roadmap, architecture, PRD, or vision docs.

When adopting this existing project, keep the projection short and route durable intent to the canonical product goal source, machine-readable continuation state to \`.gse/state.json\`, evidence to \`.gse/evidence/\`, and reusable lessons to \`.gse/learnings.md\` or \`.learnings/\`.

## Current Focus

- Active slice: ${label} hardening fixture.
- Next action: Continue target hardening drill.
`, 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'evidence', '2026-07-09.md'), '# Evidence\n\nFixture hardening evidence.\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'evidence', 'index.jsonl'), JSON.stringify({
    date: '2026-07-09',
    recordType: 'slice',
    status: 'verified',
    evidenceLevel: 'verified-unit',
    requiredEvidenceLevel: 'verified-unit',
    summary: `${label} hardening fixture evidence.`,
    evidenceFile: '.gse/evidence/2026-07-09.md',
    commands: ['node scripts/audit-target-hardening-drills.mjs --self-test'],
    nextAction: 'Continue target hardening drill.',
  }) + '\n', 'utf8')
  spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8', windowsHide: true })
  spawnSync('git', ['config', 'user.email', 'gse-fixture@example.local'], { cwd: dir, encoding: 'utf8', windowsHide: true })
  spawnSync('git', ['config', 'user.name', 'GSE Fixture'], { cwd: dir, encoding: 'utf8', windowsHide: true })
  spawnSync('git', ['add', '.'], { cwd: dir, encoding: 'utf8', windowsHide: true })
  spawnSync('git', ['commit', '-m', 'fixture'], { cwd: dir, encoding: 'utf8', windowsHide: true })
  if (options.dirtyRepair || options.dirtyProductRepair) {
    state.residualRisks = Array.from({ length: 8 }, (_, index) => `Fixture residual risk ${index + 1} that should be compacted after worktree ownership is resolved.`)
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8')
  }
  if (options.dirtyProductRepair) {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'src', 'active-slice.js'), 'export const activeSlice = true\n', 'utf8')
  }
  return { dir, init }
}

function auditTarget(target) {
  const commandRuns = {
    doctor: run('audit-target-project.mjs', ['--root', root, '--target', target.root, '--json']),
    continue: run('run-gse-command.mjs', ['--root', root, '--target', target.root, '--command', '/gse continue', '--json', '--compact']),
    close: run('audit-close-gate.mjs', ['--target', target.root, '--json']),
    hostCapabilities: run('audit-host-capabilities.mjs', ['--root', root, '--target', target.root, '--json']),
    learningDrift: run('audit-learning-drift.mjs', ['--root', root, '--target', target.root, '--json']),
    stateRepair: run('audit-state-repair.mjs', ['--root', root, '--target', target.root, '--json']),
  }
  const checks = [
    check(`${target.id}-doctor`, 'target project doctor has no hard failures', statusFromRun(commandRuns.doctor), evidenceFromRun(commandRuns.doctor), 'Repair target .gse adoption drift before claiming GSE-ready status.'),
    check(`${target.id}-continue`, '/gse continue hard preflight returns a usable packet', statusFromRun(commandRuns.continue), evidenceFromRun(commandRuns.continue), 'Repair hard preflight failures before implementation starts.'),
    check(`${target.id}-close`, 'close gate exposes close readiness and ownership state', statusFromRun(commandRuns.close), evidenceFromRun(commandRuns.close), 'Resolve close-gate failures before claiming the slice complete.'),
    check(`${target.id}-host`, 'host capability records are audited with claim boundaries', statusFromRun(commandRuns.hostCapabilities), evidenceFromRun(commandRuns.hostCapabilities), 'Record missing host capability facts or keep unknown/external-required boundaries explicit.'),
    check(`${target.id}-learning`, 'learning drift is audited for promoted guard candidates', statusFromRun(commandRuns.learningDrift), evidenceFromRun(commandRuns.learningDrift), 'Promote high-severity learning drift into guards, gates, or scripts before close.'),
  ]
  const adoptionSummary = buildTargetAdoptionSummary(commandRuns, checks)
  checks.push(validateAdoptionSummary({ id: target.id, adoptionSummary }))
  const failed = checks.filter((item) => item.status === 'failed')
  const warnings = checks.filter((item) => item.status === 'warning')
  return {
    id: target.id,
    root: target.root,
    status: failed.length > 0 ? 'failed' : warnings.length > 0 ? 'warning' : 'passed',
    adoptionSummary,
    checks,
    commands: Object.values(commandRuns).map((item) => item.command),
    summaries: Object.fromEntries(Object.entries(commandRuns).map(([key, value]) => [key, value.parsed?.summary ?? { exit: value.status }])),
  }
}

function runConfiguredTargets() {
  const targets = parseTargets()
  if (targets.length === 0) return null
  return {
    targets,
    cleanup: () => {},
  }
}

function runSelfTestTargets() {
  const primary = createFixture('primary')
  const secondary = createFixture('secondary', { dirtyRepair: true })
  const dirtyProduct = createFixture('dirty-product', { dirtyProductRepair: true })
  const committedRepairDirtyProduct = createFixture('committed-repair-dirty-product', { committedRepair: true })
  fs.mkdirSync(path.join(committedRepairDirtyProduct.dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(committedRepairDirtyProduct.dir, 'src', 'active-slice.js'), 'export const activeSlice = true\n', 'utf8')
  return {
    targets: [
      { id: 'fixture-primary', root: primary.dir },
      { id: 'fixture-secondary', root: secondary.dir },
      { id: 'fixture-dirty-product', root: dirtyProduct.dir },
      { id: 'fixture-committed-repair-dirty-product', root: committedRepairDirtyProduct.dir },
    ],
    cleanup: () => {
      fs.rmSync(primary.dir, { recursive: true, force: true })
      fs.rmSync(secondary.dir, { recursive: true, force: true })
      fs.rmSync(dirtyProduct.dir, { recursive: true, force: true })
      fs.rmSync(committedRepairDirtyProduct.dir, { recursive: true, force: true })
    },
  }
}

function buildReport() {
  const configured = runConfiguredTargets()
  const targetSet = configured ?? runSelfTestTargets()
  try {
    const reports = targetSet.targets.map(auditTarget)
    const checks = reports.flatMap((report) => report.checks)
    const hardFailures = checks.filter((item) => item.status === 'failed')
    const warnings = checks.filter((item) => item.status === 'warning')
    const passed = checks.filter((item) => item.status === 'passed').length
    const failed = hardFailures.length
    const warningCount = warnings.length
    const status = failed > 0 || (strictWarnings && warningCount > 0) ? 'failed' : warningCount > 0 ? 'warning' : 'passed'
    return {
      root,
      generatedAt: new Date().toISOString(),
      summary: {
        status,
        mode: configured ? 'configured-targets' : 'self-test',
        passed,
        warnings: warningCount,
        failed,
        hardFailures: failed,
        total: checks.length,
        targets: reports.length,
      },
      workflows: {
        targetHardeningDrills: status === 'failed' ? 'failed' : 'verified',
        closeGateHardening: hardFailures.length === 0 ? 'verified' : 'failed',
        hostCapabilityBoundaries: hardFailures.length === 0 ? 'verified' : 'failed',
        learningDriftCoverage: hardFailures.length === 0 ? 'verified' : 'failed',
        targetAdoptionHygieneSummary: hardFailures.length === 0 ? 'verified' : 'failed',
      },
      targets: reports,
      checks,
      limits: [
        'Target hardening drills are read-only for target projects.',
        'They run GSE doctor, /gse continue, close gate, host capability audit, and learning drift audit.',
        'Warnings mean the project can continue only if the current slice accepts that residual risk; hard failures must be fixed before close.',
        'This drill does not run product tests, browser smokes, CI, or native host slash-command invocation.',
      ],
    }
  } finally {
    targetSet.cleanup()
  }
}

function renderMarkdown(report) {
  const lines = []
  lines.push('# GSE Target Hardening Drills')
  lines.push('')
  lines.push('Generated: ' + report.generatedAt)
  lines.push('Root: ' + report.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + report.summary.status)
  lines.push('- Mode: ' + report.summary.mode)
  lines.push('- Targets: ' + report.summary.targets)
  lines.push('- Checks: ' + report.summary.passed + ' passed, ' + report.summary.warnings + ' warnings, ' + report.summary.hardFailures + ' hard failures, ' + report.summary.total + ' total')
  lines.push('')
  lines.push('## Targets')
  lines.push('')
  for (const target of report.targets) {
    lines.push('- ' + target.id + ': ' + target.status + ' at ' + target.root)
    lines.push('  - Classification: ' + target.adoptionSummary.classification)
    lines.push('  - Portable continue usable: ' + target.adoptionSummary.portableContinueUsable)
    lines.push('  - Long prompt risk: ' + target.adoptionSummary.longPromptRisk)
  }
  lines.push('')
  lines.push('## Checks')
  lines.push('')
  for (const item of report.checks) {
    const marker = item.status === 'passed' ? '[x]' : item.status === 'warning' ? '[!]' : '[ ]'
    lines.push('- ' + marker + ' ' + item.id + ' ' + item.label + ': ' + item.evidence)
  }
  lines.push('')
  lines.push('## Limits')
  lines.push('')
  for (const item of report.limits) lines.push('- ' + item)
  return lines.join('\n') + '\n'
}

const report = buildReport()
if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(renderMarkdown(report))

if (report.summary.status === 'failed') process.exit(1)
