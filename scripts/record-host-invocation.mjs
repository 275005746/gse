#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)

function readArg(name, fallback = '') {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

function hasArg(name) {
  return args.includes(name)
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const host = readArg('--host')
const hostVersion = readArg('--host-version', 'unknown')
const project = readArg('--project', 'unknown')
const adapterPath = readArg('--adapter-path', 'unknown')
const invocationMethod = readArg('--invocation-method')
const command = readArg('--command', '/gse help')
const status = readArg('--status', 'verified')
const startedAt = readArg('--started-at', new Date().toISOString())
const finishedAt = readArg('--finished-at', startedAt)
const evidenceOwner = readArg('--evidence-owner')
const evidence = readArg('--evidence')
const filesRead = readArg('--files-read', '')
const filesWritten = readArg('--files-written', '')
const verificationCommand = readArg('--verification-command', '')
const nativeSlashCommand = readArg('--native-slash-command', 'unknown')
const portableTextCommand = readArg('--portable-text-command', 'unknown')
const generatedPointer = readArg('--generated-pointer', 'unknown')
const ownerAcceptanceRequired = readArg('--owner-acceptance-required', 'unknown')
const residualRisk = readArg('--residual-risk', '')
const continuationStage = readArg('--continuation-stage', 'none')
const packetId = readArg('--packet-id', '')
const topLevelPlanUnitId = readArg('--top-level-plan-unit-id', '')
const sliceId = readArg('--slice-id', '')
const lifecycleTimestamp = readArg('--lifecycle-timestamp', startedAt)
const continuationEvidenceRefs = readArg('--continuation-evidence-refs', '')
const out = path.resolve(readArg('--out', path.join(root, '.gse', 'evidence', 'host-invocations', `${new Date().toISOString().slice(0, 10)}-${host || 'unknown'}-gse.md`)))
const dryRun = hasArg('--dry-run')
const force = hasArg('--force')
const jsonOnly = hasArg('--json')

const validStatuses = new Set(['result', 'verified', 'accepted', 'failed'])
const validBooleans = new Set(['true', 'false', 'unknown'])
const validContinuationStages = new Set(['none', 'recommended', 'acknowledged', 'dispatched', 'completed'])
const continuationReceiptRequired = continuationStage !== 'none'
const hostDispatchObserved = ['dispatched', 'completed'].includes(continuationStage)
const errors = []

function requireField(value, message) {
  if (!String(value).trim()) errors.push(message)
}

requireField(host, '--host is required')
requireField(invocationMethod, '--invocation-method is required')
requireField(evidenceOwner, '--evidence-owner is required')
requireField(evidence, '--evidence is required')
if (!validStatuses.has(status)) errors.push('--status must be result, verified, accepted, or failed')
if (!validBooleans.has(nativeSlashCommand)) errors.push('--native-slash-command must be true, false, or unknown')
if (!validBooleans.has(portableTextCommand)) errors.push('--portable-text-command must be true, false, or unknown')
if (!validBooleans.has(generatedPointer)) errors.push('--generated-pointer must be true, false, or unknown')
if (!validBooleans.has(ownerAcceptanceRequired)) errors.push('--owner-acceptance-required must be true, false, or unknown')
if (!validContinuationStages.has(continuationStage)) errors.push('--continuation-stage must be none, recommended, acknowledged, dispatched, or completed')
if (continuationReceiptRequired) {
  requireField(packetId, '--packet-id is required for continuation receipts')
  requireField(topLevelPlanUnitId, '--top-level-plan-unit-id is required for continuation receipts')
  requireField(sliceId, '--slice-id is required for continuation receipts')
  requireField(lifecycleTimestamp, '--lifecycle-timestamp is required for continuation receipts')
  requireField(continuationEvidenceRefs, '--continuation-evidence-refs is required for continuation receipts')
  if (!/^continue-[a-f0-9]{24}$/.test(packetId)) errors.push('--packet-id must match continue- followed by 24 lowercase hex characters')
}
if (nativeSlashCommand === 'true' && portableTextCommand === 'true') {
  errors.push('native slash-command records cannot also claim portable text-command routing')
}
if (nativeSlashCommand === 'true' && generatedPointer === 'true') {
  errors.push('native slash-command records cannot rely on a generated pointer file')
}
if (status === 'accepted' && ownerAcceptanceRequired !== 'false') {
  errors.push('accepted host invocation records must set --owner-acceptance-required false')
}
if (status === 'accepted' && !verificationCommand.trim()) {
  errors.push('accepted host invocation records must include --verification-command')
}
if (status === 'accepted' && generatedPointer === 'true') {
  errors.push('accepted host invocation records must not rely on a generated pointer file')
}

const lines = [
  '# Host UI Invocation Record',
  '',
  '## Host',
  '',
  '- Host name: ' + host,
  '- Host version: ' + hostVersion,
  '- Project: ' + project,
  '- Adapter path: ' + adapterPath,
  '- Invocation method: ' + invocationMethod,
  '',
  '## Command',
  '',
  '```text',
  command,
  '```',
  '',
  '## Result',
  '',
  '- Status: ' + status,
  '- Started at: ' + startedAt,
  '- Finished at: ' + finishedAt,
  '- Evidence owner: ' + evidenceOwner,
  '',
  '## Evidence',
  '',
  '- Screenshot, transcript, thread id, terminal output, or host log: ' + evidence,
  '- Files read by the host: ' + filesRead,
  '- Files written by the host: ' + filesWritten,
  '- Verification command: ' + verificationCommand,
  '',
  '## Continuation Receipt',
  '',
  '- Lifecycle stage: ' + continuationStage,
  '- Packet ID: ' + packetId,
  '- Top-level Plan Unit ID: ' + topLevelPlanUnitId,
  '- Slice ID: ' + sliceId,
  '- Lifecycle timestamp: ' + lifecycleTimestamp,
  '- Continuation evidence refs: ' + continuationEvidenceRefs,
  '- Host dispatch observed: ' + hostDispatchObserved,
  '',
  '## Boundaries',
  '',
  '- Does this prove native slash-command support? ' + nativeSlashCommand,
  '- Does this prove portable text-command routing only? ' + portableTextCommand,
  '- Does this rely on a generated pointer file? ' + generatedPointer,
  '- Does this require owner acceptance before being called trusted? ' + ownerAcceptanceRequired,
  '',
  '## Residual Risk',
  '',
  '- ' + residualRisk,
  '',
]

const report = {
  root,
  out,
  dryRun,
  status: errors.length ? 'failed' : dryRun ? 'ready' : 'written',
  host,
  invocationStatus: status,
  nativeSlashCommand,
  portableTextCommand,
  continuationStage,
  packetId,
  topLevelPlanUnitId,
  sliceId,
  lifecycleTimestamp,
  continuationEvidenceRefs,
  hostDispatchObserved,
  errors,
}

if (!errors.length && !dryRun) {
  if (fs.existsSync(out) && !force) {
    report.status = 'exists'
    report.errors.push('output exists; use --force or choose another --out path')
  } else {
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, lines.join('\n'), 'utf8')
  }
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else {
  console.log('Host invocation record status: ' + report.status)
  console.log('Output: ' + report.out)
  if (report.errors.length) {
    console.log('Errors:')
    for (const error of report.errors) console.log('- ' + error)
  }
}

if (report.status === 'failed' || report.status === 'exists') process.exit(1)
