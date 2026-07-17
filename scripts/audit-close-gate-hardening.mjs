#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { deriveActiveChange } from './core/change-state.mjs'
import { deriveCurrentEvidenceDependencies } from './core/evidence-basis.mjs'
import { ALLOWED_FIELDS_BY_RECORD_TYPE } from './core/persistence/record-allowlists.mjs'
import { executeTransaction } from './core/persistence/transaction.mjs'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const jsonOnly = args.includes('--json')

function run(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    command: [command, ...commandArgs].join(' '),
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

function runNode(script, commandArgs, cwd = root) {
  return run(process.execPath, [path.join(root, 'scripts', script), ...commandArgs], cwd)
}

function write(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, text, 'utf8')
}

function rolePacket(realDelegationUsed = 'no', toolStatus = 'unknown') {
  const plannerMode = realDelegationUsed === 'yes' ? 'real-subagent' : 'sequential-role'
  const rows = [
    ['Planner', plannerMode, realDelegationUsed, toolStatus, 'Plan', 'fixture plan', 'Plan accepted', 'read-only'],
    ['Locator', 'sequential-role', 'no', 'unknown', 'File map', 'fixture map', 'Files identified', 'read-only'],
    ['Implementer', 'sequential-role', 'no', 'unknown', 'Patch', 'fixture patch', 'Patch complete', 'assigned files'],
    ['Verifier', 'sequential-role', 'no', 'unknown', 'Test results', 'fixture tests', 'Focused checks pass', 'evidence only'],
    ['Reviewer', 'sequential-role', 'no', 'unknown', 'Review notes', 'fixture review', 'No blocking findings', 'read-only'],
    ['Docs/Evidence', 'sequential-role', 'no', 'unknown', 'Evidence log', 'fixture evidence', 'Evidence recorded', 'docs/evidence only'],
    ['Release', 'sequential-role', 'no', 'unknown', 'Claim boundary', 'fixture release', 'External gates visible', 'read-only'],
  ]
  return [
    '# Role Fallback Packets',
    '',
    '| Role | Mode | Real delegation used | Tool status | Fallback output | Evidence | Stop condition | Write access |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map((row) => '| ' + row.join(' | ') + ' |'),
    '',
  ].join('\n')
}

async function createProject(label, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-close-hardening-' + label + '-'))
  const changeId = 'close-hardening-fixture'
  const changeDir = path.join(dir, '.gse', 'changes', changeId)
  write(path.join(dir, '.gse', 'README.md'), '# GSE\n')
  write(path.join(dir, '.gse', 'project-profile.md'), '# Project Profile\n')
  write(path.join(dir, '.gse', 'goal-map.md'), '# Goal Map\n\nNext action: close fixture.\n')
  write(path.join(dir, '.gse', 'quality-gates.md'), '# Quality Gates\n\n- Evidence required.\n')
  write(path.join(dir, '.gse', 'evidence', '2026-07-08.md'), '# Evidence\n\nVerified fixture.\n')
  for (const [name, content] of [
    ['brief.md', '# Close hardening fixture\n'],
    ['spec.md', '# Spec\n'],
    ['design.md', '# Design\n'],
    ['tasks.md', '# Tasks\n'],
    ['evidence.md', '# Evidence\n'],
    ['review.md', '# Review\n\n## Closure\n'],
  ]) write(path.join(changeDir, name), content)
  const state = {
    schemaVersion: 1,
    stateRevision: 1,
    sourceRevision: 1,
    activeChangeId: changeId,
    projectName: 'close-hardening-fixture',
    mode: 'standard',
    canonicalPlan: '',
    phase: 'verify',
    currentSlice: {
      id: changeId,
      outcome: 'Fixture close gate hardening.',
      status: 'verified',
      nextAction: 'Close fixture.',
    },
    toolStatuses: {
      browser: 'unknown',
      lsp: 'unknown',
      mcp: 'unknown',
      subagents: 'unknown',
      ci: 'unknown',
    },
    lastEvidence: '.gse/evidence/2026-07-08.md',
    residualRisks: [],
  }
  write(path.join(dir, '.gse', 'state.json'), JSON.stringify(state, null, 2) + '\n')
  const activeChange = deriveActiveChange(dir, changeId, { stateRevision: 1 })
  write(path.join(changeDir, 'change.json'), JSON.stringify(activeChange, null, 2) + '\n')
  write(
    path.join(dir, '.gse', 'agents', 'role-fallback-packets.md'),
    rolePacket(options.realDelegationUsed ?? 'no', options.toolStatus ?? 'unknown'),
  )
  run('git', ['init'], dir)
  run('git', ['config', 'user.email', 'gse-fixture@example.local'], dir)
  run('git', ['config', 'user.name', 'GSE Fixture'], dir)
  run('git', ['add', '.'], dir)
  run('git', ['commit', '-m', 'fixture baseline'], dir)
  const dependencies = deriveCurrentEvidenceDependencies(dir, { projectState: state, activeChange })
  await executeTransaction({
    target: dir,
    operationId: `close-hardening-${label}-evidence`,
    expectedRevision: 1,
    writes: [],
    events: [{
      path: '.gse/evidence/index.jsonl',
      event: {
        schemaVersion: 1,
        eventId: `close-hardening-${label}-evidence`,
        date: '2026-07-08',
        timestamp: '2026-07-08T00:00:00.000Z',
        recordType: 'evidence-event',
        changeId,
        taskId: null,
        stateRevision: 2,
        status: 'verified',
        evidenceLevel: 'verified-unit',
        requiredEvidenceLevel: 'verified-unit',
        summary: 'Fixture close gate hardening evidence.',
        claim: 'Fixture close gate hardening evidence.',
        evidenceClass: 'test',
        method: 'fixture',
        dependencies,
        invalidationScope: ['stateRevision', 'dependencies'],
        outcome: 'passed',
        limitations: [],
        actor: 'fixture',
        evidenceFile: '.gse/evidence/2026-07-08.md',
        relatedArtifacts: [],
        commands: ['node scripts/audit-close-gate.mjs --target <fixture> --json'],
        nextAction: 'Close fixture.',
      },
    }],
    allowedFieldsByRecordType: ALLOWED_FIELDS_BY_RECORD_TYPE,
  })
  const revised = deriveActiveChange(dir, changeId, { stateRevision: 2 })
  write(path.join(changeDir, 'change.json'), JSON.stringify(revised, null, 2) + '\n')
  run('git', ['add', '.'], dir)
  run('git', ['commit', '-m', 'fixture evidence'], dir)
  return dir
}

function parseReport(result) {
  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    return { parseError: error.message, stdout: result.stdout, stderr: result.stderr }
  }
}

function getCheck(report, id) {
  return report.checks?.find((item) => item.id === id) ?? null
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const cleanDir = await createProject('clean')
const fakeDir = await createProject('fake-dispatch', { realDelegationUsed: 'yes', toolStatus: 'unknown' })
const dirtyDir = await createProject('dirty')
write(path.join(dirtyDir, 'src', 'changed.txt'), 'dirty fixture\n')
const generatedDir = await createProject('generated')
write(path.join(generatedDir, 'output', 'playwright', 'screen.png'), 'generated artifact\n')
run('git', ['add', 'output/playwright/screen.png'], generatedDir)

const cleanReport = parseReport(runNode('audit-close-gate.mjs', ['--target', cleanDir, '--json']))
const fakeReport = parseReport(runNode('audit-close-gate.mjs', ['--target', fakeDir, '--json']))
const dirtyReport = parseReport(runNode('audit-close-gate.mjs', ['--target', dirtyDir, '--json']))
const generatedReport = parseReport(runNode('audit-close-gate.mjs', ['--target', generatedDir, '--json']))

const checks = [
  check('CGH01', 'clean fixture close gate is ready with honest role fallback', cleanReport.summary?.status === 'ready' && getCheck(cleanReport, 'CG10')?.status === 'passed' && getCheck(cleanReport, 'CG11')?.status === 'passed' && getCheck(cleanReport, 'CG12')?.status === 'passed', 'clean close gate fixture'),
  check('CGH02', 'fake real-subagent claim fails close gate', fakeReport.summary?.status === 'not-ready' && getCheck(fakeReport, 'CG10')?.status === 'failed', getCheck(fakeReport, 'CG10')?.evidence ?? 'missing CG10'),
  check('CGH03', 'dirty worktree is surfaced and invalidates current close evidence', dirtyReport.summary?.status === 'not-ready' && getCheck(dirtyReport, 'CG11')?.status === 'warning' && getCheck(dirtyReport, 'CG16')?.status === 'failed', `${getCheck(dirtyReport, 'CG11')?.evidence ?? 'missing CG11'}; ${getCheck(dirtyReport, 'CG16')?.evidence ?? 'missing CG16'}`),
  check('CGH04', 'staged generated artifacts fail close gate', generatedReport.summary?.status === 'not-ready' && getCheck(generatedReport, 'CG12')?.status === 'failed', getCheck(generatedReport, 'CG12')?.evidence ?? 'missing CG12'),
]

for (const dir of [cleanDir, fakeDir, dirtyDir, generatedDir]) {
  fs.rmSync(dir, { recursive: true, force: true })
}

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: {
    status: failed === 0 ? 'passed' : 'failed',
    passed,
    failed,
    total: checks.length,
  },
  workflows: {
    closeGateHardening: failed === 0 ? 'verified' : 'failed',
    fakeDispatchCloseGate: failed === 0 ? 'verified' : 'failed',
    fileOwnershipCloseGate: failed === 0 ? 'verified' : 'failed',
  },
  checks,
  limits: [
    'This audit verifies close-gate mechanics with local fixtures.',
    'It does not prove real subagent dispatch or native slash-command host support.',
  ],
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))
if (failed > 0) process.exit(1)
