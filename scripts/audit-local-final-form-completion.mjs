#!/usr/bin/env node
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

function run(script, commandArgs = []) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), '--root', root, '--json', ...commandArgs], {
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
    script,
    command: [process.execPath, path.join(root, 'scripts', script), '--root', root, '--json', ...commandArgs].join(' '),
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    data,
  }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const finalReadiness = run('audit-final-readiness.mjs')
const progress = run('audit-final-form-progress-report.mjs')
const publicAcceptance = run('audit-public-acceptance-readiness.mjs')
const completionReadiness = run('audit-completion-readiness.mjs')

const finalRows = finalReadiness.data?.matrix ?? []
const nonExternalIncompleteRows = finalRows.filter((row) => {
  if (row.status === 'verified') return false
  if (row.status === 'not-claimed') return false
  return !['owner-required', 'external-required'].includes(row.status)
})
const pendingGates = publicAcceptance.data?.pendingGates ?? []
const pendingGateAreas = pendingGates.map((gate) => gate.area)
const expectedPendingAreas = pendingGateAreas

const checks = [
  check('LFC01', 'final readiness audit passes', finalReadiness.status === 0 && finalReadiness.data?.summary?.failed === 0, finalReadiness.command),
  check('LFC02', 'completion readiness audit passes', completionReadiness.status === 0 && completionReadiness.data?.summary?.failed === 0, completionReadiness.command),
  check('LFC03', 'final-form progress report shows local engineering readiness at 100', progress.status === 0 && progress.data?.workflows?.localEngineeringReadiness === 100, 'localEngineeringReadiness=' + progress.data?.workflows?.localEngineeringReadiness),
  check('LFC04', 'portable-core final-form readiness is accepted when only optional host-native claims remain not-claimed', progress.status === 0 && progress.data?.workflows?.publicAccepted === 'verified' && Number(progress.data?.workflows?.pendingGates) === 0, 'publicAccepted=' + progress.data?.workflows?.publicAccepted + '; pendingGates=' + progress.data?.workflows?.pendingGates),
  check('LFC05', 'all incomplete final readiness rows are owner/external only', nonExternalIncompleteRows.length === 0, nonExternalIncompleteRows.length ? JSON.stringify(nonExternalIncompleteRows) : 'no local incomplete rows'),
  check('LFC06', 'public acceptance doctor passes and accepts required GSE core gates', publicAcceptance.status === 0 && publicAcceptance.data?.summary?.failed === 0 && publicAcceptance.data?.summary?.publicAccepted === 'verified', publicAcceptance.command),
  check('LFC07', 'public acceptance has no pending owner/external gates after optional host-native claims are excluded', pendingGateAreas.length === 0 && expectedPendingAreas.length === 0, pendingGateAreas.join(', ') || 'none'),
  check('LFC08', 'pending gate command templates are not required when no owner/external gates remain', pendingGates.length === 0 || pendingGates.every((gate) => gate.recordCommand && gate.preflightCommand && gate.requiredEvidence && gate.owner), 'pending gate command templates'),
]

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
    localEngineeringReadiness: progress.data?.workflows?.localEngineeringReadiness ?? null,
    fullFinalFormReadiness: progress.data?.workflows?.fullFinalFormReadiness ?? null,
    pendingGates: progress.data?.workflows?.pendingGates ?? null,
    publicAccepted: progress.data?.workflows?.publicAccepted ?? null,
  },
  workflows: {
    localFinalFormCompletion: failed === 0 ? 'verified' : 'failed',
    remainingWorkClass: failed === 0 ? 'owner-external-only' : 'local-work-or-state-inconsistency-present',
  },
  remainingOwnerExternalGates: pendingGates.map((gate) => ({
    area: gate.area,
    status: gate.status,
    owner: gate.owner,
    requiredEvidence: gate.requiredEvidence,
  })),
  limits: [
    'This audit proves local GSE engineering completion boundaries only.',
    'It does not create optional host-native slash-command evidence.',
    'A host-native slash claim still requires a per-host accepted invocation record and final readiness re-audit.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Local Final-Form Completion Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Local engineering readiness: ' + data.summary.localEngineeringReadiness)
  lines.push('- Full final-form readiness: ' + data.summary.fullFinalFormReadiness)
  lines.push('- Public accepted: ' + data.summary.publicAccepted)
  lines.push('- Remaining work class: ' + data.workflows.remainingWorkClass)
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
