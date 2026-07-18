#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const jsonOnly = args.includes('--json')

function read(relativePath) {
  const fullPath = path.join(root, relativePath)
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    command: [command, ...commandArgs].join(' '),
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

const tmp = mkdtempSync(path.join(tmpdir(), 'gse-final-form-progress-'))
const out = path.join(tmp, 'final-form-progress-report.md')
const jsonOut = path.join(tmp, 'final-form-progress-report.json')
const generated = run(process.execPath, [
  path.join(root, 'scripts', 'generate-final-form-progress-report.mjs'),
  '--root', root,
  '--out', out,
  '--json-out', jsonOut,
  '--force',
  '--json',
])
const generatedData = parseJson(generated.stdout)
const report = fs.existsSync(jsonOut) ? parseJson(fs.readFileSync(jsonOut, 'utf8')) : null
const markdown = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : ''
rmSync(tmp, { recursive: true, force: true })

const skill = read('SKILL.md')
const validate = read('scripts/validate-gse.mjs')
const generator = read('scripts/generate-final-form-progress-report.mjs')
const canonicalMarkdown = read('.gse/acceptance/final-form-progress-report.md')
const canonicalReport = parseJson(read('.gse/acceptance/final-form-progress-report.json'))

const pendingReleaseEvidence = report?.pendingReleaseEvidence ?? []
const pendingEvidenceNames = new Set(pendingReleaseEvidence.map((item) => item.area))
const pendingEvidenceSetMatchesReportCount = pendingReleaseEvidence.length === report?.readiness?.pendingGateCount &&
  [...pendingEvidenceNames].every(Boolean)
const verifiedNames = new Set((report?.verifiedCapabilities ?? []).map((item) => item.area))
const licenseDecisionResolved = verifiedNames.has('License decision')
const pendingEvidenceCommandsAreCompleteTemplates = pendingReleaseEvidence.length === 0 || (
  pendingReleaseEvidence.every((blocker) =>
    !String(blocker.recordCommand ?? '').includes('...') &&
    !String(blocker.preflightCommand ?? '').includes('...') &&
    !/[<>]/.test(String(blocker.recordCommand ?? '')) &&
    !/[<>]/.test(String(blocker.preflightCommand ?? '')) &&
    !String(blocker.recordCommand ?? '').includes('--invocation-status') &&
    !String(blocker.preflightCommand ?? '').includes('--invocation-status') &&
    (String(blocker.recordCommand ?? '').includes('record-host-invocation.mjs') ? String(blocker.recordCommand).includes('--status accepted') : true),
  ) &&
  !markdown.includes('--invocation-status') &&
  !/record-[a-z-]+\.mjs[^\n`]*[<>]/.test(markdown) &&
  !/record-[a-z-]+\.mjs[\s\S]*\.\.\./.test(markdown)
)

const checks = [
  check('FFP01', 'progress report generator exists and writes markdown/json', generated.status === 0 && generatedData?.status === 'written' && Boolean(report) && markdown.includes('# GSE Final-Form Progress Report'), generated.stderr || `${out}, ${jsonOut}`),
  check('FFP02', 'report derives status from final readiness, public acceptance, and command dry-run drill audits', generator.includes('audit-final-readiness.mjs') && generator.includes('audit-public-acceptance-readiness.mjs') && generator.includes('audit-public-acceptance-command-dry-run-drill.mjs'), 'generator source audits'),
  check('FFP03', 'report separates portable-core readiness from optional host-native claims', report?.scores?.scoringBasis?.includes('local engineering excludes owner-required and external-required') && report?.scores?.localEngineeringReadiness === 100 && report?.scores?.fullFinalFormReadiness === 83 && report?.claimBoundary?.mayClaimPublicAcceptedFinalForm === false && report?.readiness?.publicAccepted === 'not-accepted', `local=${report?.scores?.localEngineeringReadiness}; full=${report?.scores?.fullFinalFormReadiness}; publicAccepted=${report?.readiness?.publicAccepted}`),
  check('FFP04', 'report preserves pending external release evidence until accepted records exist', pendingEvidenceSetMatchesReportCount && licenseDecisionResolved && !pendingEvidenceNames.has('License decision') && pendingReleaseEvidence.length > 0 && report?.readiness?.publicAccepted === 'not-accepted' && !Object.hasOwn(report ?? {}, 'blockers'), [...pendingEvidenceNames].join(', ') || 'none' + '; License decision resolved'),
  check('FFP05', 'report lists verified local capabilities', ['Local install', 'npm tarball install', 'URL install', 'Signing', 'Portable command execution', 'Host adapters'].every((name) => verifiedNames.has(name)), 'local engineering capabilities'),
  check('FFP06', 'report preserves native slash-command boundary', report?.hostRuntime?.nativeSlashCommandRecords === 0 && report?.claimBoundary?.cannotClaim?.some((item) => item.includes('native slash-command')), `native=${report?.hostRuntime?.nativeSlashCommandRecords}`),
  check('FFP06b', 'report does not list resolved license decision as a cannot-claim item', licenseDecisionResolved && !report?.claimBoundary?.cannotClaim?.some((item) => item.includes('license acceptance')), 'License decision verified; cannotClaim excludes license acceptance'),
  check('FFP07', 'human report includes claim boundary and verification commands', markdown.includes('## Claim Boundary') && markdown.includes('## Verification Commands') && markdown.includes('May claim public accepted final form: false') && markdown.includes('audit-public-acceptance-command-dry-run-drill.mjs'), 'markdown sections'),
  check('FFP07b', 'report exposes dry-run preflight commands when pending release evidence exists', pendingReleaseEvidence.length === 0 || (pendingReleaseEvidence.every((blocker) => blocker.preflightCommand?.includes('--dry-run --json')) && markdown.includes('Preflight command')), 'pending evidence preflight commands'),
  check('FFP07c', 'report uses complete record command templates', pendingEvidenceCommandsAreCompleteTemplates, 'no ellipsis, no stale host invocation flag, host records use --status accepted'),
  check('FFP07d', 'canonical progress report carries command dry-run drill evidence', canonicalMarkdown.includes('audit-public-acceptance-command-dry-run-drill.mjs') && canonicalReport?.commandEvidence?.publicAcceptanceCommandDryRunDrill?.command?.includes('audit-public-acceptance-command-dry-run-drill.mjs'), '.gse/acceptance/final-form-progress-report.md, .gse/acceptance/final-form-progress-report.json'),
  check('FFP08', 'skill routes users to final-form progress report', skill.includes('generate-final-form-progress-report.mjs'), 'SKILL.md'),
  check('FFP09', 'validator includes final-form progress report audit', validate.includes('audit-final-form-progress-report.mjs'), 'scripts/validate-gse.mjs'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const audit = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    finalFormProgressReport: failed === 0 ? 'verified' : 'failed',
    localEngineeringReadiness: report?.scores?.localEngineeringReadiness ?? 'unknown',
    fullFinalFormReadiness: report?.scores?.fullFinalFormReadiness ?? 'unknown',
    pendingGates: report?.readiness?.pendingGateCount ?? 'unknown',
    publicAccepted: report?.readiness?.publicAccepted ?? 'unknown',
  },
  limits: [
    'This audit verifies honest progress reporting from local evidence.',
    'It does not create owner decisions, public CI, public repository settings, registry publication, marketplace approval, or native host evidence.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Final-Form Progress Report Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Final-form progress report: ' + data.workflows.finalFormProgressReport)
  lines.push('- Local engineering readiness: ' + data.workflows.localEngineeringReadiness + '%')
  lines.push('- Full final-form readiness: ' + data.workflows.fullFinalFormReadiness + '%')
  lines.push('- Pending gates: ' + data.workflows.pendingGates)
  lines.push('- Public accepted: ' + data.workflows.publicAccepted)
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

if (jsonOnly) console.log(JSON.stringify(audit, null, 2))
else console.log(renderMarkdown(audit))

if (failed > 0) process.exit(1)
