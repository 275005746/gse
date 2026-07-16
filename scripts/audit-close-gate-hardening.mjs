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

function createProject(label, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-close-hardening-' + label + '-'))
  write(path.join(dir, '.gse', 'README.md'), '# GSE\n')
  write(path.join(dir, '.gse', 'project-profile.md'), '# Project Profile\n')
  write(path.join(dir, '.gse', 'goal-map.md'), '# Goal Map\n\nNext action: close fixture.\n')
  write(path.join(dir, '.gse', 'quality-gates.md'), '# Quality Gates\n\n- Evidence required.\n')
  write(path.join(dir, '.gse', 'evidence', '2026-07-08.md'), '# Evidence\n\nVerified fixture.\n')
  write(
    path.join(dir, '.gse', 'state.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        projectName: 'close-hardening-fixture',
        mode: 'standard',
        phase: 'verify',
        currentSlice: {
          id: 'close-hardening-fixture',
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
      },
      null,
      2,
    ) + '\n',
  )
  write(
    path.join(dir, '.gse', 'evidence', 'index.jsonl'),
    JSON.stringify({
      date: '2026-07-08',
      recordType: 'slice',
      status: 'verified',
      evidenceLevel: 'verified-unit',
      requiredEvidenceLevel: 'verified-unit',
      summary: 'Fixture close gate hardening evidence.',
      evidenceFile: '.gse/evidence/2026-07-08.md',
      commands: ['node scripts/audit-close-gate.mjs --target <fixture> --json'],
      nextAction: 'Close fixture.',
    }) + '\n',
  )
  write(
    path.join(dir, '.gse', 'agents', 'role-fallback-packets.md'),
    rolePacket(options.realDelegationUsed ?? 'no', options.toolStatus ?? 'unknown'),
  )
  run('git', ['init'], dir)
  run('git', ['config', 'user.email', 'gse-fixture@example.local'], dir)
  run('git', ['config', 'user.name', 'GSE Fixture'], dir)
  run('git', ['add', '.'], dir)
  run('git', ['commit', '-m', 'fixture'], dir)
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

const cleanDir = createProject('clean')
const fakeDir = createProject('fake-dispatch', { realDelegationUsed: 'yes', toolStatus: 'unknown' })
const dirtyDir = createProject('dirty')
write(path.join(dirtyDir, 'src', 'changed.txt'), 'dirty fixture\n')
const generatedDir = createProject('generated')
write(path.join(generatedDir, 'output', 'playwright', 'screen.png'), 'generated artifact\n')
run('git', ['add', 'output/playwright/screen.png'], generatedDir)

const cleanReport = parseReport(runNode('audit-close-gate.mjs', ['--target', cleanDir, '--json']))
const fakeReport = parseReport(runNode('audit-close-gate.mjs', ['--target', fakeDir, '--json']))
const dirtyReport = parseReport(runNode('audit-close-gate.mjs', ['--target', dirtyDir, '--json']))
const generatedReport = parseReport(runNode('audit-close-gate.mjs', ['--target', generatedDir, '--json']))

const checks = [
  check('CGH01', 'clean fixture close gate is ready with honest role fallback', cleanReport.summary?.status === 'ready' && getCheck(cleanReport, 'CG10')?.status === 'passed' && getCheck(cleanReport, 'CG11')?.status === 'passed' && getCheck(cleanReport, 'CG12')?.status === 'passed', 'clean close gate fixture'),
  check('CGH02', 'fake real-subagent claim fails close gate', fakeReport.summary?.status === 'not-ready' && getCheck(fakeReport, 'CG10')?.status === 'failed', getCheck(fakeReport, 'CG10')?.evidence ?? 'missing CG10'),
  check('CGH03', 'dirty worktree is surfaced before close', dirtyReport.summary?.status === 'ready-with-warnings' && getCheck(dirtyReport, 'CG11')?.status === 'warning', getCheck(dirtyReport, 'CG11')?.evidence ?? 'missing CG11'),
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
