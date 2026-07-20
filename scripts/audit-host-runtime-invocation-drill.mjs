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
const keepFixture = args.includes('--keep-fixture')
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-host-runtime-drill-'))
const recordsDir = path.join(tempRoot, 'host-invocations')

function run(commandArgs) {
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    command: [process.execPath, ...commandArgs].join(' '),
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function record({
  fileName,
  host,
  hostVersion,
  adapterPath,
  invocationMethod,
  command,
  nativeSlashCommand,
  portableTextCommand,
  generatedPointer,
  continuationStage = 'none',
  packetId = '',
  topLevelPlanUnitId = '',
  sliceId = '',
  lifecycleTimestamp = '',
  continuationEvidenceRefs = '',
}) {
  const commandArgs = [
    path.join(root, 'scripts', 'record-host-invocation.mjs'),
    '--root', root,
    '--host', host,
    '--host-version', hostVersion,
    '--project', 'GSE host runtime fixture',
    '--adapter-path', adapterPath,
    '--invocation-method', invocationMethod,
    '--command', command,
    '--status', 'verified',
    '--evidence-owner', 'host runtime invocation drill',
    '--evidence', 'temporary fixture record; not real host runtime evidence',
    '--files-read', '.gse/README.md,.gse/project-profile.md,.gse/state.json,.gse/goal-map.md,.gse/quality-gates.md',
    '--verification-command', 'node scripts/audit-host-runtime-invocations.mjs --records-dir <fixture>',
    '--native-slash-command', nativeSlashCommand,
    '--portable-text-command', portableTextCommand,
    '--generated-pointer', generatedPointer,
    '--owner-acceptance-required', 'false',
    '--residual-risk', 'Fixture proof only; real host runtime invocation still requires persistent project evidence.',
    '--out', path.join(recordsDir, fileName),
    '--json',
  ]
  if (continuationStage !== 'none') {
    commandArgs.push(
      '--continuation-stage', continuationStage,
      '--packet-id', packetId,
      '--top-level-plan-unit-id', topLevelPlanUnitId,
      '--slice-id', sliceId,
      '--lifecycle-timestamp', lifecycleTimestamp,
      '--continuation-evidence-refs', continuationEvidenceRefs,
    )
  }
  return run(commandArgs)
}

const records = [
  record({
    fileName: 'claude-native-fixture.md',
    host: 'Claude Code-style',
    hostVersion: 'fixture',
    adapterPath: '.claude/commands/gse.md',
    invocationMethod: 'native slash-command fixture',
    command: '/gse continue',
    nativeSlashCommand: 'true',
    portableTextCommand: 'false',
    generatedPointer: 'false',
    continuationStage: 'recommended',
    packetId: 'continue-111111111111111111111111',
    topLevelPlanUnitId: 'plan-unit-fixture',
    sliceId: 'slice-recommended',
    lifecycleTimestamp: '2026-07-20T00:00:00.000Z',
    continuationEvidenceRefs: 'fixture://recommended',
  }),
  record({
    fileName: 'codex-portable-fixture.md',
    host: 'Codex-style',
    hostVersion: 'fixture',
    adapterPath: '.codex/gse-command.md',
    invocationMethod: 'portable text command fixture',
    command: '/gse help',
    nativeSlashCommand: 'false',
    portableTextCommand: 'true',
    generatedPointer: 'true',
    continuationStage: 'acknowledged',
    packetId: 'continue-111111111111111111111111',
    topLevelPlanUnitId: 'plan-unit-fixture',
    sliceId: 'slice-acknowledged',
    lifecycleTimestamp: '2026-07-20T00:01:00.000Z',
    continuationEvidenceRefs: 'fixture://acknowledged',
  }),
  record({
    fileName: 'hermes-runtime-fixture.md',
    host: 'Hermes/AION-style runtime',
    hostVersion: 'fixture',
    adapterPath: '.gse/host-adapters/hermes-runtime.md',
    invocationMethod: 'runtime bridge text-command fixture',
    command: '/gse continue AION',
    nativeSlashCommand: 'false',
    portableTextCommand: 'true',
    generatedPointer: 'true',
    continuationStage: 'dispatched',
    packetId: 'continue-111111111111111111111111',
    topLevelPlanUnitId: 'plan-unit-fixture',
    sliceId: 'slice-dispatched',
    lifecycleTimestamp: '2026-07-20T00:02:00.000Z',
    continuationEvidenceRefs: 'fixture://dispatched',
  }),
  record({
    fileName: 'workbuddy-fixture.md',
    host: 'WorkBuddy/other IDE agents',
    hostVersion: 'fixture',
    adapterPath: '.gse/host-adapters/workbuddy.md',
    invocationMethod: 'IDE command-palette text-command fixture',
    command: '/gse continue',
    nativeSlashCommand: 'false',
    portableTextCommand: 'true',
    generatedPointer: 'true',
    continuationStage: 'completed',
    packetId: 'continue-111111111111111111111111',
    topLevelPlanUnitId: 'plan-unit-fixture',
    sliceId: 'slice-completed',
    lifecycleTimestamp: '2026-07-20T00:03:00.000Z',
    continuationEvidenceRefs: 'fixture://completed',
  }),
  record({
    fileName: 'generic-agent-fixture.md',
    host: 'Unknown or custom host',
    hostVersion: 'fixture',
    adapterPath: '.gse/host-adapters/generic-agent.md',
    invocationMethod: 'generic natural-language command fixture',
    command: 'gse continue',
    nativeSlashCommand: 'false',
    portableTextCommand: 'true',
    generatedPointer: 'true',
  }),
]

const audit = run([
  path.join(root, 'scripts', 'audit-host-runtime-invocations.mjs'),
  '--root',
  root,
  '--records-dir',
  recordsDir,
  '--json',
])
const auditData = parseJson(audit.stdout)
const recordData = records.map((item) => parseJson(item.stdout))
const recordWrites = recordData.filter((item) => item?.status === 'written').length
const hostSet = new Set(auditData?.inventory?.hosts ?? [])
const expectedHosts = [
  'Claude Code-style',
  'Codex-style',
  'Hermes/AION-style runtime',
  'WorkBuddy/other IDE agents',
  'Unknown or custom host',
]

const checks = [
  check('HRD01', 'all fixture host records are written', records.every((item) => item.status === 0) && recordWrites === records.length, `${recordWrites}/${records.length} fixture records`),
  check('HRD02', 'host runtime invocation audit passes over fixture records', audit.status === 0 && auditData?.summary?.status === 'passed', audit.command),
  check('HRD03', 'fixture inventory covers expected host families', expectedHosts.every((host) => hostSet.has(host)), expectedHosts.join(', ')),
  check('HRD04', 'native slash-command evidence stays isolated to the Claude fixture', auditData?.inventory?.nativeSlashCommandRecords === 1, `${auditData?.inventory?.nativeSlashCommandRecords ?? 'unknown'} native record(s)`),
  check('HRD05', 'portable text-command evidence covers non-native fixtures', auditData?.inventory?.portableTextCommandRecords === 4, `${auditData?.inventory?.portableTextCommandRecords ?? 'unknown'} portable record(s)`),
  check('HRD06', 'drill evidence is not persisted as real host evidence', !fs.existsSync(path.join(root, '.gse', 'evidence', 'host-invocations', 'claude-native-fixture.md')), 'fixture stays outside persistent evidence directory'),
  check('HRD07', 'fixture lifecycle covers recommendation through completion without upgrading the generic record', ['recommended', 'acknowledged', 'dispatched', 'completed'].every((stage) => auditData?.inventory?.continuationStageCounts?.[stage] === 1) && auditData?.inventory?.continuationStageCounts?.none === 1, auditData?.inventory?.continuationStageCounts),
  check('HRD08', 'only dispatched and completed fixtures report observed host dispatch', auditData?.inventory?.hostDispatchObservedRecords === 2, `${auditData?.inventory?.hostDispatchObservedRecords ?? 'unknown'} observed dispatch record(s)`),
]

if (!keepFixture) fs.rmSync(tempRoot, { recursive: true, force: true })

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  tempRoot: keepFixture ? tempRoot : null,
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    hostRuntimeInvocationDrill: failed === 0 ? 'verified' : 'failed',
    fixtureNativeSlashCommandRecords: auditData?.inventory?.nativeSlashCommandRecords ?? 0,
    fixturePortableTextCommandRecords: auditData?.inventory?.portableTextCommandRecords ?? 0,
  },
  limits: [
    'This drill uses temporary fixture records only.',
    'It proves record and audit mechanics across host families, not real host runtime support.',
    'Real native slash-command or runtime support still requires persistent host invocation records from actual host sessions.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Host Runtime Invocation Drill')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Host runtime invocation drill: ' + data.workflows.hostRuntimeInvocationDrill)
  lines.push('- Fixture native slash-command records: ' + data.workflows.fixtureNativeSlashCommandRecords)
  lines.push('- Fixture portable text-command records: ' + data.workflows.fixturePortableTextCommandRecords)
  lines.push('')
  lines.push('## Checks')
  lines.push('')
  for (const item of data.checks) {
    const marker = item.status === 'passed' ? '[x]' : '[ ]'
    lines.push('- ' + marker + ' ' + item.id + ' ' + item.label + ': ' + item.evidence)
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
