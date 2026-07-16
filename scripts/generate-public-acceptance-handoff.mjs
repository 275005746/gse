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

function hasArg(name) {
  return args.includes(name)
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const out = path.resolve(readArg('--out', path.join(root, '.gse', 'acceptance', 'public-acceptance-handoff.md')))
const displayRoot = readArg('--display-root', '<gse-root>')
const releaseLabel = readArg('--release-label', 'unreleased')
const jsonOnly = hasArg('--json')
const dryRun = hasArg('--dry-run')
const force = hasArg('--force')

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

function runDoctor() {
  const result = run(process.execPath, [path.join(root, 'scripts', 'audit-public-acceptance-readiness.mjs'), '--root', root, '--json'])
  if (result.status !== 0) {
    return { ok: false, error: 'public acceptance doctor failed', result }
  }
  try {
    return { ok: true, data: JSON.parse(result.stdout), command: result.command }
  } catch (error) {
    return { ok: false, error: 'public acceptance doctor returned invalid JSON', detail: error.message, result }
  }
}

function stageFor(gate) {
  if (gate.area === 'License decision') return '1. Owner decision'
  if (gate.area === 'Public security contact') return '2. Owner policy'
  if (gate.area === 'Public repository settings') return '3. Repository setup'
  if (gate.area === 'Public CI run') return '4. Public CI'
  if (gate.area === 'Public registry publication') return '5. Public channel'
  if (gate.area === 'Marketplace approval') return '6. Marketplace or catalog'
  if (gate.area === 'Native slash command') return '7. Host runtime'
  if (gate.area === 'Other host runtime invocation') return '8. Cross-host evidence'
  return 'Other'
}

function renderHandoff(doctor) {
  const gates = doctor.pendingGates ?? []
  const gateNames = new Set(gates.map((gate) => gate.area))
  const lines = []
  lines.push('# GSE Public Acceptance Handoff')
  lines.push('')
  lines.push('Generated: ' + new Date().toISOString())
  lines.push('Root: ' + displayRoot)
  lines.push('Release label: ' + releaseLabel)
  lines.push('')
  lines.push('## Purpose')
  lines.push('')
  lines.push('Give the owner and future agents one executable checklist for public acceptance. This handoff does not choose a license, publish a package, configure a repository, approve a marketplace listing, or prove optional host-native slash-command support.')
  lines.push('')
  lines.push('## Fast Path')
  lines.push('')
  lines.push('- Portable `/gse` command execution is the core command path.')
  lines.push('- Native slash-command evidence is optional per host adapter, not a GSE core completion gate.')
  lines.push('- Do not treat portable text-command records or generated pointers as native proof for a host adapter.')
  lines.push('')
  lines.push('## Current Boundary')
  lines.push('')
  lines.push('- Public accepted: ' + (doctor.summary?.publicAccepted ?? doctor.workflows?.publicAccepted ?? 'unknown'))
  lines.push('- Pending owner/external gates: ' + gates.length)
  lines.push('- Source of truth: `scripts/audit-public-acceptance-readiness.mjs` and `references/final-readiness.md`')
  lines.push('')
  lines.push('## Execution Order')
  lines.push('')
  if (gates.length === 0) {
    lines.push('- No owner/external gates are pending. Re-run final readiness and close gate before publishing a final claim.')
    lines.push('')
  }
  for (const gate of gates) {
    lines.push('### ' + stageFor(gate) + ' - ' + gate.area)
    lines.push('')
    lines.push('- Current status: ' + gate.status)
    lines.push('- Responsible party: ' + gate.owner)
    lines.push('- Current evidence: ' + gate.currentEvidence)
    lines.push('- Required evidence: ' + gate.requiredEvidence)
    lines.push('- Record command:')
    lines.push('')
    lines.push('```bash')
    lines.push(gate.recordCommand)
    lines.push('```')
    lines.push('')
    lines.push('- Preflight command:')
    lines.push('')
    lines.push('```bash')
    lines.push(gate.preflightCommand ?? `${gate.recordCommand} --dry-run --json`)
    lines.push('```')
    lines.push('')
    lines.push('- Promotion rule: create a real accepted record, then re-run `node scripts/audit-final-readiness.mjs --root __GSE__ --json` and `node scripts/audit-public-acceptance-readiness.mjs --root __GSE__ --json`.')
    lines.push('')
  }
  lines.push('## Final Verification')
  lines.push('')
  lines.push('Run these commands after owner/external records are attached:')
  lines.push('')
  lines.push('```bash')
  lines.push('node scripts/audit-public-acceptance-readiness.mjs --root __GSE__ --json')
  lines.push('node scripts/audit-final-readiness.mjs --root __GSE__ --json')
  lines.push('node scripts/audit-final-acceptance-packet.mjs --root __GSE__ --json')
  lines.push('node scripts/validate-gse.mjs --root __GSE__ --json')
  lines.push('node scripts/audit-close-gate.mjs --target __GSE__ --json')
  lines.push('```')
  lines.push('')
  lines.push('## Anti-Overclaim')
  lines.push('')
  lines.push('- Do not claim public release acceptance until the final readiness matrix returns `publicAccepted: verified`.')
  lines.push('- Do not claim marketplace availability without a real marketplace or catalog record.')
  lines.push('- Do not claim native slash-command support from portable text-command routing.')
  lines.push('- Do not claim support for a host without a host runtime invocation record for that host.')
  lines.push('- Keep this handoff updated when final-readiness gates change.')
  lines.push('')
  lines.push('## Next Action')
  lines.push('')
  if (gates.length === 0) {
    lines.push('No owner/external acceptance gate is pending. Optional host-native slash-command support can be recorded later per host adapter if a host exposes it.')
  } else if (gateNames.has('License decision')) {
    lines.push('Start with the owner-required license decision and public security contact, then attach public repository, CI, publication, and host runtime evidence as those systems become available. Record native slash-command evidence first when the host supports it.')
  } else {
    lines.push('Start with the public security contact, then attach public repository, CI, publication, and host runtime evidence as those systems become available. Record native slash-command evidence first when the host supports it.')
  }
  return lines.join('\n') + '\n'
}

const doctor = runDoctor()
if (!doctor.ok) {
  console.error(JSON.stringify({ status: 'failed', root, out, error: doctor.error, detail: doctor.detail, doctorResult: doctor.result }, null, 2))
  process.exit(1)
}

const handoff = renderHandoff(doctor.data)
if (!dryRun) {
  if (fs.existsSync(out) && !force) {
    console.error(JSON.stringify({ status: 'exists', root, out, error: 'output exists; pass --force to overwrite' }, null, 2))
    process.exit(1)
  }
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, handoff, 'utf8')
}

const report = {
  status: dryRun ? 'ready' : 'written',
  root,
  out,
  dryRun,
  doctorCommand: doctor.command,
  summary: {
    publicAccepted: doctor.data.summary?.publicAccepted ?? doctor.data.workflows?.publicAccepted ?? 'unknown',
    pendingGates: doctor.data.pendingGates?.length ?? 0,
    stages: [...new Set((doctor.data.pendingGates ?? []).map(stageFor))],
  },
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(handoff)
