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

function run(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, { cwd, encoding: 'utf8', windowsHide: true })
  return {
    command: [command, ...commandArgs].join(' '),
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

function runCommandString(command, cwd) {
  const result = process.platform === 'win32'
    ? spawnSync('cmd', ['/c', command.replace(/^cmd\s+\/c\s+/i, '')], { cwd, encoding: 'utf8', windowsHide: true })
    : spawnSync(command, [], { cwd, encoding: 'utf8', shell: true, windowsHide: true })
  return {
    command,
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

function write(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, text, 'utf8')
}

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-completion-plan-drill-'))
  write(path.join(dir, 'package.json'), JSON.stringify({ scripts: { 'check:encoding': 'node scripts/check-encoding.mjs' } }, null, 2) + '\n')
  write(path.join(dir, 'scripts', 'run-gse-command.mjs'), '#!/usr/bin/env node\n')
  write(path.join(dir, 'scripts', 'check-encoding.mjs'), '#!/usr/bin/env node\n')
  write(path.join(dir, 'references', 'final-readiness.md'), '# Final Readiness\n')
  write(path.join(dir, 'docs', 'productization-architecture.md'), '# Productization\n')
  write(path.join(dir, '.gse', 'README.md'), '# GSE\n')
  write(path.join(dir, '.gse', 'project-profile.md'), '# Project Profile\n\n- Product/system name: Completion Plan Fixture\n')
  write(path.join(dir, '.gse', 'goal-map.md'), '# Goal Map\n\n- Active slice: Completion plan fixture.\n- Next action: Run completion plan drill.\n')
  write(path.join(dir, '.gse', 'quality-gates.md'), '# Quality Gates\n\n- Evidence required.\n')
  write(path.join(dir, '.gse', 'session-sync.jsonl'), '')
  write(path.join(dir, '.gse', 'state.json'), JSON.stringify({
    schemaVersion: 1,
    projectName: 'completion-plan-fixture',
    mode: 'standard',
    canonicalPlan: 'docs/productization-architecture.md',
    phase: 'execute',
    currentSlice: {
      id: 'completion-plan-fixture',
      outcome: 'Completion plan fixture.',
      status: 'planned',
      nextAction: 'Run completion plan drill.',
    },
    toolStatuses: { browser: 'unknown', lsp: 'unknown', mcp: 'unknown', subagents: 'unknown', ci: 'unknown' },
    lastEvidence: '.gse/evidence/2026-07-09.md',
    residualRisks: [],
  }, null, 2) + '\n')
  write(path.join(dir, '.gse', 'evidence', 'index.jsonl'), JSON.stringify({
    date: '2026-07-09',
    recordType: 'slice',
    status: 'verified',
    evidenceLevel: 'verified-unit',
    requiredEvidenceLevel: 'verified-unit',
    summary: 'Completion plan fixture evidence.',
    evidenceFile: '.gse/evidence/2026-07-09.md',
    commands: ['fixture'],
    nextAction: 'Run completion plan drill.',
  }) + '\n')
  write(path.join(dir, '.gse', 'evidence', '2026-07-09.md'), '# Evidence\n')
  write(path.join(dir, '.gse', 'maintenance', 'latest-maintenance-snapshot.json'), JSON.stringify({
    schemaVersion: 1,
    root: dir,
    target: dir,
    generatedAt: '2026-07-09T00:00:00.000Z',
    summary: { status: 'passed', passed: 9, failed: 0, total: 9, installedSyncMode: 'verified', releaseBundleChecked: true },
    workflows: { maintenanceSnapshot: 'verified', installedSync: 'verified', releaseBundleFreshness: 'verified' },
    results: [],
  }, null, 2) + '\n')

  run('git', ['init'], dir)
  run('git', ['config', 'user.email', 'gse-fixture@example.invalid'], dir)
  run('git', ['config', 'user.name', 'GSE Fixture'], dir)
  run('git', ['add', '.'], dir)
  run('git', ['commit', '-m', 'baseline'], dir)
  return dir
}

function continuePacket(target) {
  const result = run(process.execPath, [path.join(root, 'scripts', 'generate-continue-packet.mjs'), '--root', root, '--target', target, '--json'], root)
  return { result, data: parseJson(result.stdout) }
}

function activeIds(data) {
  return (data?.compactState?.completionPlan?.conditionalCloseCommands ?? [])
    .filter((item) => item.active)
    .map((item) => item.id)
    .sort()
}

function hasExactly(data, expected) {
  const actual = activeIds(data)
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length && actual.every((item, index) => item === sortedExpected[index])
}

function drill(label, mutate, expectedActiveIds) {
  const fixture = createFixture()
  try {
    if (mutate) mutate(fixture)
    const { result, data } = continuePacket(fixture)
    return {
      label,
      command: result.command,
      status: result.status,
      expectedActiveIds: [...expectedActiveIds].sort(),
      actualActiveIds: activeIds(data),
      activeCommands: data?.compactState?.completionPlan?.activeCloseCommands ?? [],
      changedPaths: data?.compactState?.completionPlan?.changedPaths ?? [],
      ignoredGeneratedPaths: data?.compactState?.completionPlan?.ignoredGeneratedPaths ?? [],
      ignoredGeneratedPathCount: data?.compactState?.completionPlan?.ignoredGeneratedPathCount ?? 0,
      ok: result.status === 0 && hasExactly(data, expectedActiveIds),
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
}

function encodingCommandCleanlinessDrill() {
  const fixture = createFixture()
  try {
    write(path.join(fixture, 'docs', 'usage.md'), '# Usage\n')
    const { result, data } = continuePacket(fixture)
    const command = data?.compactState?.completionPlan?.conditionalCloseCommands?.find((item) => item.id === 'encoding')?.command ?? ''
    const runResult = command ? runCommandString(command, fixture) : { command: '', status: 1, stdout: '', stderr: 'encoding command missing' }
    const nodeModulesExists = fs.existsSync(path.join(fixture, 'node_modules'))
    const pnpmLockExists = fs.existsSync(path.join(fixture, 'pnpm-lock.yaml'))
    return {
      label: 'encoding close command runs without creating dependency artifacts',
      packetStatus: result.status,
      command,
      status: runResult.status,
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      nodeModulesExists,
      pnpmLockExists,
      ok: result.status === 0 && runResult.status === 0 && command.includes('npm run check:encoding') && !nodeModulesExists && !pnpmLockExists,
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
}

const drills = [
  drill('clean worktree activates no conditionals', null, []),
  drill('docs change activates encoding only', (dir) => { write(path.join(dir, 'docs', 'usage.md'), '# Usage\n') }, ['encoding']),
  drill('script capability change activates installed sync, maintenance, and session sync', (dir) => { write(path.join(dir, 'scripts', 'new-capability.mjs'), '#!/usr/bin/env node\n') }, ['installed-sync', 'maintenance-snapshot', 'session-sync']),
  drill('reference change activates docs, capability, release, maintenance, and session sync checks', (dir) => { write(path.join(dir, 'references', 'new-reference.md'), '# Reference\n') }, ['encoding', 'installed-sync', 'maintenance-snapshot', 'release-bundle', 'session-sync']),
  drill('public acceptance change activates encoding, release bundle, and maintenance only', (dir) => { write(path.join(dir, '.gse', 'acceptance', 'new-acceptance.md'), '# Acceptance\n') }, ['encoding', 'maintenance-snapshot', 'release-bundle']),
  drill('evidence index change activates encoding only', (dir) => {
    fs.appendFileSync(path.join(dir, '.gse', 'evidence', 'index.jsonl'), JSON.stringify({
      date: '2026-07-09',
      recordType: 'drill',
      status: 'verified',
      evidenceLevel: 'verified-unit',
      requiredEvidenceLevel: 'verified-unit',
      summary: 'Additional drill evidence.',
      evidenceFile: '.gse/evidence/2026-07-09.md',
      commands: ['fixture'],
      nextAction: 'Continue drill.',
    }) + '\n', 'utf8')
  }, ['encoding']),
  drill('untracked generated artifacts stay visible but activate no conditionals', (dir) => {
    write(path.join(dir, 'node_modules', '.bin', 'tool'), '')
    write(path.join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
  }, []),
  drill('tracked lockfile change remains actionable', (dir) => {
    write(path.join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
    run('git', ['add', 'pnpm-lock.yaml'], dir)
    run('git', ['commit', '-m', 'add tracked lockfile'], dir)
    write(path.join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\nsettings:\n  strictPeerDependencies: false\n')
  }, ['encoding']),
]
const encodingCleanliness = encodingCommandCleanlinessDrill()

const checks = [
  check('CPD01', 'clean worktree does not falsely activate conditional close commands', drills[0].ok, drills[0].actualActiveIds.join(',') || 'none'),
  check('CPD02', 'docs-only dirty worktree activates encoding only', drills[1].ok, `actual=${drills[1].actualActiveIds.join(',') || 'none'}`),
  check('CPD03', 'script capability changes activate installed-sync, maintenance, and session-sync without encoding', drills[2].ok, `actual=${drills[2].actualActiveIds.join(',') || 'none'}`),
  check('CPD04', 'reference changes activate all relevant docs/capability/release close checks', drills[3].ok, `actual=${drills[3].actualActiveIds.join(',') || 'none'}`),
  check('CPD05', 'public acceptance changes activate release checks without installed/session sync', drills[4].ok, `actual=${drills[4].actualActiveIds.join(',') || 'none'}`),
  check('CPD06', 'evidence index changes activate encoding without release/capability checks', drills[5].ok, `actual=${drills[5].actualActiveIds.join(',') || 'none'}`),
  check('CPD07', 'generated/noisy untracked paths do not activate conditional close commands', drills[6].ok && drills[6].changedPaths.length === 0 && drills[6].ignoredGeneratedPathCount >= 2, `actual=${drills[6].actualActiveIds.join(',') || 'none'} ignored=${drills[6].ignoredGeneratedPaths.join(',') || 'none'}`),
  check('CPD08', 'tracked lockfile changes remain actionable and can trigger configured close checks', drills[7].ok && drills[7].changedPaths.includes('pnpm-lock.yaml') && drills[7].ignoredGeneratedPathCount === 0, `actual=${drills[7].actualActiveIds.join(',') || 'none'} changed=${drills[7].changedPaths.join(',') || 'none'}`),
  check('CPD09', 'non-release capability maintenance uses skip-release-bundle', drills[2].activeCommands.some((item) => item.includes('generate-maintenance-snapshot.mjs') && item.includes('--skip-release-bundle')), drills[2].activeCommands.join(' | ')),
  check('CPD10', 'release-sensitive maintenance keeps full release bundle freshness', drills[3].activeCommands.some((item) => item.includes('generate-maintenance-snapshot.mjs') && !item.includes('--skip-release-bundle')), drills[3].activeCommands.join(' | ')),
  check('CPD11', 'encoding close command does not create dependency artifacts', encodingCleanliness.ok, `command=${encodingCleanliness.command}; node_modules=${encodingCleanliness.nodeModulesExists}; pnpm-lock=${encodingCleanliness.pnpmLockExists}`, encodingCleanliness.stderr),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    completionPlanDrill: failed === 0 ? 'verified' : 'failed',
    cleanWorktreeFalsePositiveGuard: drills[0].ok ? 'verified' : 'failed',
    dirtyWorktreeConditionalRouting: failed === 0 ? 'verified' : 'failed',
    encodingCommandCleanliness: encodingCleanliness.ok ? 'verified' : 'failed',
  },
  drills,
  encodingCleanliness,
  checks,
  limits: [
    'This audit verifies portable /gse continue completionPlan routing in temporary git fixtures.',
    'It does not execute the close commands; it verifies whether the correct commands become active for each worktree state.',
    'Native host slash-command behavior remains a host-specific adapter claim and is not covered by this drill.',
  ],
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Completion Plan Drill Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('')
  lines.push('## Drills')
  lines.push('')
  for (const item of data.drills) {
    lines.push('- ' + (item.ok ? '[x]' : '[ ]') + ' ' + item.label + ': expected `' + item.expectedActiveIds.join(',') + '`, actual `' + item.actualActiveIds.join(',') + '`')
  }
  lines.push('')
  lines.push('## Limits')
  lines.push('')
  for (const item of data.limits) lines.push('- ' + item)
  return lines.join('\n') + '\n'
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(renderMarkdown(report))

if (failed > 0) process.exit(1)
