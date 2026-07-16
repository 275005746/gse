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
const displayRoot = readArg('--display-root', '<gse-root>')
const out = path.resolve(readArg('--out', path.join(root, '.gse', 'acceptance', 'final-acceptance-packet.md')))
const jsonOnly = args.includes('--json')
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')

function runAudit() {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'audit-final-readiness.mjs'), '--root', root, '--json'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0) {
    return {
      ok: false,
      error: 'audit-final-readiness failed',
      stdout: result.stdout?.trim() ?? '',
      stderr: result.stderr?.trim() ?? '',
    }
  }
  try {
    return { ok: true, data: JSON.parse(result.stdout) }
  } catch (error) {
    return { ok: false, error: 'audit-final-readiness did not return valid JSON', detail: error.message }
  }
}

function runPublicDoctor() {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'audit-public-acceptance-readiness.mjs'), '--root', root, '--json'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0) return { ok: false, gates: new Map() }
  try {
    const data = JSON.parse(result.stdout)
    return {
      ok: true,
      gates: new Map((data.pendingGates ?? []).map((gate) => [gate.area, gate])),
    }
  } catch {
    return { ok: false, gates: new Map() }
  }
}

function actionFor(row, publicGate) {
  if (publicGate?.recordCommand) {
    const parts = [
      'Attach the real owner/external evidence, then run `' + publicGate.recordCommand + '`.',
    ]
    if (publicGate.preflightCommand) parts.push('Preflight with `' + publicGate.preflightCommand + '`.')
    return parts.join(' ')
  }
  if (row.area === 'License decision') {
    return 'Run `node scripts/record-public-release.mjs --root __GSE__ --license-status selected --spdx __SPDX_ID__ --license-file __LICENSE_FILE__ --approved-by __OWNER__ --decision-date __YYYY_MM_DD__ --evidence-status accepted` after the owner chooses a license, or record `--license-status not-public` with owner approval.'
  }
  if (row.area === 'Public security contact') {
    return 'Update `SECURITY.md` with an owner-approved vulnerability disclosure path before public release acceptance.'
  }
  if (row.area === 'Public registry publication') {
    return 'Publish only through the chosen public channel, then record the package URL, version, digest, date, and verification command in release evidence.'
  }
  if (row.area === 'Marketplace approval') {
    return 'Submit the marketplace/catalog listing, wait for real approval or publication evidence, then attach the listing URL and review status.'
  }
  if (row.area === 'Native slash command') {
    return 'Use the host runtime to invoke a real native slash command and record it with `scripts/record-host-invocation.mjs` using native slash-command evidence.'
  }
  if (row.area === 'Other host runtime invocation') {
    return 'Run GSE in each claimed host, record invocation evidence with `scripts/record-host-invocation.mjs`, then re-run host runtime audits.'
  }
  return 'Provide explicit owner or external evidence, then re-run final readiness and close gate audits.'
}

function renderPacket(audit) {
  const publicDoctor = runPublicDoctor()
  const matrix = audit.matrix ?? []
  const verified = matrix.filter((row) => row.status === 'verified')
  const pending = matrix.filter((row) => row.status === 'owner-required' || row.status === 'external-required')
  const notClaimed = matrix.filter((row) => row.status === 'not-claimed')
  const lines = []
  lines.push('# GSE Final Acceptance Packet')
  lines.push('')
  lines.push('Generated: ' + new Date().toISOString())
  lines.push('Root: ' + displayRoot)
  lines.push('')
  lines.push('## Purpose')
  lines.push('')
  lines.push('Turn the final-readiness matrix into an executable owner/external acceptance checklist. This packet is not acceptance by itself; it is the handoff plan for the evidence that cannot be produced locally.')
  lines.push('')
  lines.push('## Current Claim Boundary')
  lines.push('')
  lines.push('- Local readiness: ' + (audit.workflows?.finalReadinessMatrix ?? 'unknown'))
  lines.push('- Public accepted: ' + (audit.workflows?.publicAccepted ?? 'unknown'))
  lines.push('- Verified rows: ' + verified.length)
  lines.push('- Pending owner/external rows: ' + pending.length)
  lines.push('- Optional not-claimed rows: ' + notClaimed.length)
  lines.push('')
  lines.push('## Verified Local Capabilities')
  lines.push('')
  for (const row of verified) lines.push('- ' + row.area + ': verified; evidence: ' + row.evidence)
  lines.push('')
  lines.push('## Pending Acceptance Gates')
  lines.push('')
  for (const row of pending) {
    lines.push('### ' + row.area)
    lines.push('')
    lines.push('- Status: ' + row.status)
    lines.push('- Current evidence: ' + row.evidence)
    lines.push('- Required action: ' + actionFor(row, publicDoctor.gates.get(row.area)))
    lines.push('- Acceptance rule: do not mark accepted until the evidence is real, dated, and re-audited.')
    lines.push('')
  }
  if (pending.length === 0) {
    lines.push('- No owner/external acceptance gates are pending.')
    lines.push('')
  }
  if (notClaimed.length > 0) {
    lines.push('## Optional Not-Claimed Rows')
    lines.push('')
    for (const row of notClaimed) {
      lines.push('- ' + row.area + ': not claimed; evidence boundary: ' + row.evidence)
    }
    lines.push('')
  }
  lines.push('## Re-Verification Commands')
  lines.push('')
  lines.push('```bash')
  lines.push('node scripts/audit-final-readiness.mjs --root __GSE__ --json')
  lines.push('node scripts/audit-public-acceptance-readiness.mjs --root __GSE__ --json')
  lines.push('node scripts/audit-public-release-decision.mjs --root __GSE__ --json')
  lines.push('node scripts/audit-host-runtime-invocations.mjs --root __GSE__ --json')
  lines.push('node scripts/validate-gse.mjs --root __GSE__ --json')
  lines.push('node scripts/audit-close-gate.mjs --target __GSE__ --json')
  lines.push('```')
  lines.push('')
  lines.push('## Anti-Overclaim Rules')
  lines.push('')
  lines.push('- Do not claim public release acceptance until public security contact, repository settings, CI, publication, marketplace, and host-runtime evidence are accepted.')
  lines.push('- Do not claim marketplace availability until an actual marketplace or catalog record exists.')
  lines.push('- Do not claim native slash-command support from portable text-command routing.')
  lines.push('- Do not claim support for a host until that host has its own runtime invocation record.')
  lines.push('- Keep owner-required and external-required gates visible in status reports until they are re-audited as verified.')
  lines.push('')
  lines.push('## Next Action')
  lines.push('')
  lines.push('Run the public acceptance doctor, collect the owner-required decisions first, then record public channel and host-runtime evidence as those external systems become available.')
  return lines.join('\n') + '\n'
}

const audit = runAudit()
if (!audit.ok) {
  console.error(JSON.stringify({ status: 'failed', ...audit }, null, 2))
  process.exit(1)
}

const packet = renderPacket(audit.data)
if (!dryRun) {
  if (fs.existsSync(out) && !force) {
    console.error(JSON.stringify({ status: 'failed', reason: 'output exists; pass --force to overwrite', out }, null, 2))
    process.exit(1)
  }
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, packet, 'utf8')
}

const report = {
  status: 'ready',
  root,
  out,
  dryRun,
  written: dryRun ? 0 : 1,
  summary: {
    verifiedRows: audit.data.matrix.filter((row) => row.status === 'verified').length,
    pendingRows: audit.data.matrix.filter((row) => row.status === 'owner-required' || row.status === 'external-required').length,
    notClaimedRows: audit.data.matrix.filter((row) => row.status === 'not-claimed').length,
    publicAccepted: audit.data.workflows?.publicAccepted ?? 'unknown',
  },
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(packet)
