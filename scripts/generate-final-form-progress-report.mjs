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
const out = path.resolve(readArg('--out', path.join(root, '.gse', 'acceptance', 'final-form-progress-report.md')))
const jsonOut = path.resolve(readArg('--json-out', path.join(root, '.gse', 'acceptance', 'final-form-progress-report.json')))
const displayRoot = readArg('--display-root', '<gse-root>')
const force = args.includes('--force')
const dryRun = args.includes('--dry-run')
const jsonOnly = args.includes('--json')

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

function countBy(rows, status) {
  return rows.filter((row) => row.status === status).length
}

function percent(numerator, denominator) {
  if (!denominator) return 0
  return Math.round((numerator / denominator) * 100)
}

const finalReadiness = run(process.execPath, [path.join(root, 'scripts', 'audit-final-readiness.mjs'), '--root', root, '--json'])
const publicAcceptance = run(process.execPath, [path.join(root, 'scripts', 'audit-public-acceptance-readiness.mjs'), '--root', root, '--json'])
const publicAcceptanceCommandDryRunDrill = run(process.execPath, [path.join(root, 'scripts', 'audit-public-acceptance-command-dry-run-drill.mjs'), '--root', root, '--json'])
const hostRuntime = run(process.execPath, [path.join(root, 'scripts', 'audit-host-runtime-invocations.mjs'), '--root', root, '--json'])

const finalReadinessData = parseJson(finalReadiness.stdout)
const publicAcceptanceData = parseJson(publicAcceptance.stdout)
const hostRuntimeData = parseJson(hostRuntime.stdout)

const matrix = finalReadinessData?.matrix ?? []
const verifiedRows = countBy(matrix, 'verified')
const ownerRequiredRows = countBy(matrix, 'owner-required')
const externalRequiredRows = countBy(matrix, 'external-required')
const notClaimedRows = countBy(matrix, 'not-claimed')
const acceptedRows = countBy(matrix, 'accepted')
const totalRows = matrix.length
const localReadyRows = verifiedRows + acceptedRows
const publicAccepted = finalReadinessData?.workflows?.publicAccepted ?? 'unknown'
const pendingGates = publicAcceptanceData?.pendingGates ?? matrix.filter((row) => row.status !== 'verified')
const licenseDecisionVerified = matrix.some((row) => row.area === 'License decision' && (row.status === 'verified' || row.status === 'accepted'))
const cannotClaim = [
  ...(licenseDecisionVerified ? [] : ['owner-selected license acceptance unless accepted owner evidence exists']),
  'public security contact acceptance unless accepted owner evidence exists',
  'public repository settings unless real repository evidence exists',
  'public CI unless a real successful public CI run is recorded',
  'registry or marketplace publication unless real publication evidence exists',
  'native slash-command support unless real host runtime evidence exists',
]

const localRows = totalRows - ownerRequiredRows - externalRequiredRows - notClaimedRows
const localEngineeringScore = percent(localReadyRows, localRows)
const finalFormScore = publicAccepted === 'verified' ? 100 : percent(localReadyRows, totalRows)
const status = publicAccepted === 'verified' ? 'accepted' : 'release-evidence-pending'

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  root: displayRoot,
  status,
  scores: {
    localEngineeringReadiness: localEngineeringScore,
    fullFinalFormReadiness: finalFormScore,
    scoringBasis: 'local engineering excludes owner-required and external-required rows; full final-form counts every readiness row',
  },
  readiness: {
    totalRows,
    localRows,
    verifiedRows,
    acceptedRows,
    ownerRequiredRows,
    externalRequiredRows,
    notClaimedRows,
    publicAccepted,
    pendingGateCount: pendingGates.length,
  },
  pendingReleaseEvidence: pendingGates.map((gate) => ({
    area: gate.area,
    status: gate.status,
    owner: gate.owner ?? (gate.status === 'owner-required' ? 'project owner' : 'external system or host'),
    evidence: gate.currentEvidence ?? gate.evidence ?? '',
    recordCommand: gate.recordCommand ?? null,
    preflightCommand: gate.preflightCommand ?? null,
    requiredEvidence: gate.requiredEvidence ?? 'Record accepted owner/external evidence and re-run final readiness.',
  })),
  verifiedCapabilities: matrix.filter((row) => row.status === 'verified' || row.status === 'accepted').map((row) => ({
    area: row.area,
    status: row.status,
    evidence: row.evidence,
  })),
  commandEvidence: {
    finalReadiness: { status: finalReadiness.status, command: 'node scripts/audit-final-readiness.mjs --root __GSE__ --json' },
    publicAcceptance: { status: publicAcceptance.status, command: 'node scripts/audit-public-acceptance-readiness.mjs --root __GSE__ --json' },
    publicAcceptanceCommandDryRunDrill: { status: publicAcceptanceCommandDryRunDrill.status, command: 'node scripts/audit-public-acceptance-command-dry-run-drill.mjs --root __GSE__ --json' },
    hostRuntime: { status: hostRuntime.status, command: 'node scripts/audit-host-runtime-invocations.mjs --root __GSE__ --json' },
  },
  hostRuntime: {
    nativeSlashCommandRecords: hostRuntimeData?.inventory?.nativeSlashCommandRecords ?? 0,
    portableTextCommandRecords: hostRuntimeData?.inventory?.portableTextCommandRecords ?? 0,
    totalRecords: hostRuntimeData?.inventory?.totalRecords ?? 0,
  },
  claimBoundary: {
    mayClaimLocalEngineeringReadiness: finalReadiness.status === 0,
    mayClaimPublicAcceptedFinalForm: publicAccepted === 'verified' && pendingGates.length === 0,
    cannotClaim,
  },
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Final-Form Progress Report')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.status)
  lines.push('- Local engineering readiness: ' + data.scores.localEngineeringReadiness + '%')
  lines.push('- Full final-form readiness: ' + data.scores.fullFinalFormReadiness + '%')
  lines.push('- Scoring basis: ' + data.scores.scoringBasis)
  lines.push('- Public accepted: ' + data.readiness.publicAccepted)
  lines.push('- Matrix rows: ' + data.readiness.verifiedRows + ' verified, ' + data.readiness.ownerRequiredRows + ' owner-required, ' + data.readiness.externalRequiredRows + ' external-required, ' + data.readiness.notClaimedRows + ' not-claimed, ' + data.readiness.totalRows + ' total')
  lines.push('- Local rows: ' + data.readiness.localRows)
  lines.push('')
  lines.push('## Pending Release Evidence')
  lines.push('')
  if (data.pendingReleaseEvidence.length === 0) {
    lines.push('- None reported by final readiness. Re-run close gate and release audits before claiming completion.')
  } else {
    for (const blocker of data.pendingReleaseEvidence) {
      lines.push('- ' + blocker.area + ': ' + blocker.status)
      lines.push('  - Owner: ' + blocker.owner)
      lines.push('  - Evidence now: ' + blocker.evidence)
      lines.push('  - Required evidence: ' + blocker.requiredEvidence)
      if (blocker.preflightCommand) lines.push('  - Preflight command: `' + blocker.preflightCommand + '`')
      if (blocker.recordCommand) lines.push('  - Record command: `' + blocker.recordCommand + '`')
    }
  }
  lines.push('')
  lines.push('## Verified Capabilities')
  lines.push('')
  for (const item of data.verifiedCapabilities) {
    lines.push('- ' + item.area + ': ' + item.status + ' (' + item.evidence + ')')
  }
  lines.push('')
  lines.push('## Claim Boundary')
  lines.push('')
  lines.push('- May claim local engineering readiness: ' + data.claimBoundary.mayClaimLocalEngineeringReadiness)
  lines.push('- May claim public accepted final form: ' + data.claimBoundary.mayClaimPublicAcceptedFinalForm)
  for (const item of data.claimBoundary.cannotClaim) lines.push('- Cannot claim ' + item)
  lines.push('')
  lines.push('## Verification Commands')
  lines.push('')
  for (const item of Object.values(data.commandEvidence)) {
    lines.push('- `' + item.command + '`')
  }
  return lines.join('\n') + '\n'
}

if (!dryRun) {
  for (const target of [out, jsonOut]) {
    if (fs.existsSync(target) && !force) {
      throw new Error(`Refusing to overwrite ${target}; pass --force`)
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })
  }
  fs.writeFileSync(out, renderMarkdown(report), 'utf8')
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2) + '\n', 'utf8')
}

if (jsonOnly) {
  console.log(JSON.stringify({ status: dryRun ? 'ready' : 'written', out, jsonOut, summary: report.readiness, scores: report.scores }, null, 2))
} else {
  console.log(renderMarkdown(report))
}
