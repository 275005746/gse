#!/usr/bin/env node
import fs from 'node:fs'
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

function readConfiguredTarget(argName, envName) {
  return readArg(argName, process.env[envName] || null)
}

const configuredTargets = [
  {
    id: 'primary',
    root: readConfiguredTarget('--primary-target', 'GSE_PRIMARY_TARGET'),
    canonicalPlan: readArg('--primary-plan', process.env.GSE_PRIMARY_PLAN || ''),
    minCloseableRecords: Number(readArg('--primary-min-closeable-records', process.env.GSE_PRIMARY_MIN_CLOSEABLE_RECORDS || '1')),
    allowedDoctorWarnings: (readArg('--primary-allowed-doctor-warnings', process.env.GSE_PRIMARY_ALLOWED_DOCTOR_WARNINGS || 'TPD09,TPD10') || '').split(',').filter(Boolean),
    allowedCloseWarnings: (readArg('--primary-allowed-close-warnings', process.env.GSE_PRIMARY_ALLOWED_CLOSE_WARNINGS || 'CG08') || '').split(',').filter(Boolean),
  },
  {
    id: 'secondary',
    root: readConfiguredTarget('--secondary-target', 'GSE_SECONDARY_TARGET'),
    canonicalPlan: readArg('--secondary-plan', process.env.GSE_SECONDARY_PLAN || ''),
    minCloseableRecords: Number(readArg('--secondary-min-closeable-records', process.env.GSE_SECONDARY_MIN_CLOSEABLE_RECORDS || '1')),
    allowedDoctorWarnings: (readArg('--secondary-allowed-doctor-warnings', process.env.GSE_SECONDARY_ALLOWED_DOCTOR_WARNINGS || 'TPD09') || '').split(',').filter(Boolean),
    allowedCloseWarnings: (readArg('--secondary-allowed-close-warnings', process.env.GSE_SECONDARY_ALLOWED_CLOSE_WARNINGS || 'CG08') || '').split(',').filter(Boolean),
  },
]
const targets = configuredTargets
  .filter((target) => target.root)
  .map((target) => ({ ...target, root: path.resolve(target.root) }))

function run(command, commandArgs, cwd = root) {
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

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
}

function evidenceRecordCount(filePath) {
  if (!fs.existsSync(filePath)) return 0
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .length
}

const checks = []
const targetReports = []

if (targets.length === 0) {
  const report = {
    root,
    generatedAt: new Date().toISOString(),
    summary: { status: 'skipped', passed: 0, failed: 0, skipped: 1, total: 1 },
    workflows: { v1TargetValidation: 'skipped' },
    targets: [],
    limits: [
      'No v1 target validation targets were configured.',
      'Set --primary-target/--secondary-target or GSE_PRIMARY_TARGET/GSE_SECONDARY_TARGET to validate real projects.',
      'This keeps the distributable GSE package free of local pilot-project paths.',
    ],
    checks: [
      {
        id: 'configured-targets',
        label: 'configured target projects are present',
        status: 'skipped',
        evidence: 'no configured target paths',
        risk: 'target-project validation was not run',
      },
    ],
  }
  if (jsonOnly) console.log(JSON.stringify(report, null, 2))
  else console.log('# GSE v1 Target Validation Audit\n\nStatus: skipped\n\nNo target projects were configured.\n')
  process.exit(0)
}

for (const target of targets) {
  const doctorRun = run(process.execPath, [path.join(root, 'scripts', 'audit-target-project.mjs'), '--target', target.root, '--json'])
  const doctor = parseJson(doctorRun.stdout)
  const closeRun = run(process.execPath, [path.join(root, 'scripts', 'audit-close-gate.mjs'), '--target', target.root, '--json'])
  const close = parseJson(closeRun.stdout)
  const state = readJson(path.join(target.root, '.gse', 'state.json'))
  const evidenceIndex = path.join(target.root, '.gse', 'evidence', 'index.jsonl')
  const recordCount = evidenceRecordCount(evidenceIndex)

  const doctorFailures = doctor?.summary?.failed ?? 1
  const doctorWarnings = doctor?.checks?.filter((item) => item.status === 'warning').map((item) => item.id) ?? []
  const unexpectedWarnings = doctorWarnings.filter((item) => !target.allowedDoctorWarnings.includes(item))
  const closeStatus = close?.summary?.status
  const closeFailures = close?.summary?.failed ?? 1
  const closeWarnings = close?.checks?.filter((item) => item.status === 'warning').map((item) => item.id) ?? []
  const unexpectedCloseWarnings = closeWarnings.filter((item) => !target.allowedCloseWarnings.includes(item))
  const closeableRecords = close?.evidenceIndex?.closeableRecords ?? 0
  const canonicalPlanExists = fs.existsSync(path.join(target.root, target.canonicalPlan))
  const currentSliceVerified = state?.currentSlice?.status === 'verified' || state?.currentSlice?.status === 'accepted'

  checks.push(
    check(
      `${target.id}-01`,
      `${target.id} target doctor has no failed checks`,
      doctorRun.status === 0 && doctorFailures === 0,
      `status:${doctor?.summary?.status ?? 'unknown'}, passed:${doctor?.summary?.passed ?? 0}, warnings:${doctor?.summary?.warnings ?? 0}, failed:${doctorFailures}`,
    ),
    check(
      `${target.id}-02`,
      `${target.id} target doctor warnings are expected`,
      unexpectedWarnings.length === 0,
      doctorWarnings.length ? `warnings:${doctorWarnings.join(',')}` : 'warnings:none',
      unexpectedWarnings.length ? `unexpected warnings:${unexpectedWarnings.join(',')}` : '',
    ),
    check(
      `${target.id}-03`,
      `${target.id} close gate has no failed checks`,
      closeRun.status === 0 && closeFailures === 0,
      `closeGate:${closeStatus ?? 'unknown'}, passed:${close?.summary?.passed ?? 0}/${close?.summary?.total ?? 0}, warnings:${close?.summary?.warnings ?? 0}, failed:${closeFailures}`,
    ),
    check(
      `${target.id}-04`,
      `${target.id} close gate warnings are expected`,
      unexpectedCloseWarnings.length === 0,
      closeWarnings.length ? `warnings:${closeWarnings.join(',')}` : 'warnings:none',
      unexpectedCloseWarnings.length ? `unexpected warnings:${unexpectedCloseWarnings.join(',')}` : '',
    ),
    check(
      `${target.id}-05`,
      `${target.id} state points to a verified or accepted current slice`,
      currentSliceVerified,
      `slice:${state?.currentSlice?.id ?? 'missing'}, status:${state?.currentSlice?.status ?? 'missing'}`,
    ),
    check(
      `${target.id}-06`,
      `${target.id} evidence index has closeable records`,
      recordCount >= target.minCloseableRecords && closeableRecords >= target.minCloseableRecords,
      `records:${recordCount}, closeable:${closeableRecords}`,
    ),
    check(
      `${target.id}-07`,
      `${target.id} canonical plan exists`,
      canonicalPlanExists,
      target.canonicalPlan,
    ),
  )

  targetReports.push({
    id: target.id,
    root: target.root,
    doctor: doctor
      ? {
          status: doctor.summary?.status,
          passed: doctor.summary?.passed,
          warnings: doctor.summary?.warnings,
          failed: doctor.summary?.failed,
          workflow: doctor.workflows?.targetProjectDoctor,
        }
      : null,
    closeGate: close
      ? {
          status: close.summary?.status,
          passed: close.summary?.passed,
          warnings: close.summary?.warnings,
          failed: close.summary?.failed,
          workflow: close.workflows?.closeGate,
        }
      : null,
    state: state
      ? {
          phase: state.phase,
          currentSliceId: state.currentSlice?.id,
          currentSliceStatus: state.currentSlice?.status,
          lastEvidence: state.lastEvidence,
        }
      : null,
    evidenceRecords: recordCount,
    commands: [doctorRun.command, closeRun.command],
  })
}

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { v1TargetValidation: failed === 0 ? 'verified' : 'failed' },
  targets: targetReports,
  limits: [
    'This audit validates configured local project states through GSE target doctor and close gate.',
    'It does not run those projects full test suites, browser smokes, CI, release publication, or marketplace installation.',
    'Allowed warning IDs are target-specific and must be supplied by arguments or environment for real project validation.',
    'Active-session .gse warnings are allowed only when they have no failed checks and reflect in-progress project-local GSE change-pack work.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE v1 Target Validation Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Target validation: ' + data.workflows.v1TargetValidation)
  lines.push('')
  lines.push('## Targets')
  lines.push('')
  for (const target of data.targets) {
    lines.push('- ' + target.id + ': doctor=' + target.doctor?.status + ', close=' + target.closeGate?.status + ', slice=' + target.state?.currentSliceStatus)
  }
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
