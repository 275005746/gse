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

function hasArg(name) {
  return args.includes(name)
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const out = path.resolve(readArg('--out', path.join(root, '.gse', 'acceptance', 'owner-external-gate-kit')))
const displayRoot = readArg('--display-root', '<gse-root>')
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
    command: [command, ...commandArgs].join(' '),
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

function parseJson(stdout) {
  try {
    return JSON.parse(stdout)
  } catch {
    return null
  }
}

function stageFor(gate) {
  if (gate.area === 'License decision') return '01-owner-license'
  if (gate.area === 'Public security contact') return '02-owner-security-contact'
  if (gate.area === 'Public repository settings') return '03-public-repository-settings'
  if (gate.area === 'Public CI run') return '04-public-ci-run'
  if (gate.area === 'Public registry publication') return '05-public-registry-publication'
  if (gate.area === 'Marketplace approval') return '06-marketplace-approval'
  if (gate.area === 'Native slash command') return '07-native-slash-command'
  if (gate.area === 'Other host runtime invocation') return '08-other-host-runtime-invocation'
  return '99-other'
}

function runJsonScript(scriptName, scriptArgs = []) {
  const result = run(process.execPath, [path.join(root, 'scripts', scriptName), '--root', root, '--display-root', displayRoot, ...scriptArgs, '--json'])
  return { result, data: parseJson(result.stdout) }
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'gse-owner-external-gate-kit-src-'))
const generatedPaths = {
  finalAcceptancePacket: path.join(tempRoot, 'final-acceptance-packet.md'),
  publicAcceptanceHandoff: path.join(tempRoot, 'public-acceptance-handoff.md'),
  hostRuntimeEvidenceHandoff: path.join(tempRoot, 'host-runtime-evidence-handoff.md'),
  releaseStatusManifest: path.join(tempRoot, 'release-status-manifest.json'),
  releaseOwnerActionPlan: path.join(tempRoot, 'release-owner-action-plan.md'),
}

const errors = []
const doctor = runJsonScript('audit-public-acceptance-readiness.mjs')
if (doctor.result.status !== 0 || !doctor.data) errors.push('public acceptance doctor failed')

const finalPacket = runJsonScript('generate-final-acceptance-packet.mjs', ['--out', generatedPaths.finalAcceptancePacket, '--force'])
if (finalPacket.result.status !== 0) errors.push('final acceptance packet generation failed')

const publicHandoff = runJsonScript('generate-public-acceptance-handoff.mjs', ['--out', generatedPaths.publicAcceptanceHandoff, '--force'])
if (publicHandoff.result.status !== 0) errors.push('public acceptance handoff generation failed')

const hostHandoff = runJsonScript('generate-host-runtime-evidence-handoff.mjs', ['--out', generatedPaths.hostRuntimeEvidenceHandoff, '--force'])
if (hostHandoff.result.status !== 0) errors.push('host runtime evidence handoff generation failed')

const manifest = runJsonScript('generate-release-status-manifest.mjs', ['--out', generatedPaths.releaseStatusManifest, '--force'])
if (manifest.result.status !== 0) errors.push('release status manifest generation failed')

const actionPlan = runJsonScript('generate-release-owner-action-plan.mjs', ['--manifest', generatedPaths.releaseStatusManifest, '--out', generatedPaths.releaseOwnerActionPlan, '--force'])
if (actionPlan.result.status !== 0) errors.push('release owner action plan generation failed')

const gates = [...(doctor.data?.pendingGates ?? [])].sort((a, b) => stageFor(a).localeCompare(stageFor(b)))

function renderReadme() {
  const lines = []
  lines.push('# GSE Owner / External Gate Kit')
  lines.push('')
  lines.push('Generated: ' + new Date().toISOString())
  lines.push('Root: ' + displayRoot)
  lines.push('')
  lines.push('## Purpose')
  lines.push('')
  lines.push('This kit is the one-directory execution packet for the remaining owner-required and external-required final-form gates. It does not choose a license, publish a package, configure a public repository, run public CI, approve a marketplace listing, or prove host-native slash-command support.')
  lines.push('')
  lines.push('## Current Boundary')
  lines.push('')
  lines.push('- Public accepted: ' + (doctor.data?.summary?.publicAccepted ?? doctor.data?.workflows?.publicAccepted ?? 'unknown'))
  lines.push('- Pending gates: ' + gates.length)
  lines.push('- Source of truth: `scripts/audit-public-acceptance-readiness.mjs` and `references/final-readiness.md`')
  lines.push('')
  lines.push('## Execution Order')
  lines.push('')
  for (const gate of gates) {
    lines.push('- `' + stageFor(gate) + '`: ' + gate.area + ' (' + gate.owner + ')')
  }
  lines.push('')
  lines.push('## Files')
  lines.push('')
  lines.push('- `action-packet.md`: concise human-facing execution packet.')
  lines.push('- `final-acceptance-packet.md`: final readiness acceptance checklist generated fresh.')
  lines.push('- `public-acceptance-handoff.md`: public acceptance handoff generated fresh.')
  lines.push('- `host-runtime-evidence-handoff.md`: host runtime evidence handoff generated fresh.')
  lines.push('- `release-status-manifest.json`: machine-readable release status generated fresh.')
  lines.push('- `release-owner-action-plan.md`: owner-facing action plan generated fresh from the manifest.')
  lines.push('- `record-commands.md`: copy-ready record commands grouped by execution order.')
  lines.push('- `verification-commands.md`: audits to run after attaching real evidence.')
  lines.push('- `kit-manifest.json`: machine-readable inventory for the kit itself.')
  lines.push('')
  lines.push('## Anti-Overclaim')
  lines.push('')
  lines.push('- Do not claim public release acceptance until `publicAccepted` is verified by final readiness audits.')
  lines.push('- Do not claim registry publication, marketplace approval, public CI, or repository settings without real external records.')
  lines.push('- Do not claim native slash-command support from fixture drills, generated pointers, or portable text-command records.')
  lines.push('- Keep owner-required and external-required gates visible until accepted evidence promotes them.')
  return lines.join('\n') + '\n'
}

function renderRecordCommands() {
  const lines = []
  lines.push('# GSE Owner / External Gate Record Commands')
  lines.push('')
  for (const gate of gates) {
    lines.push('## ' + stageFor(gate) + ' - ' + gate.area)
    lines.push('')
    lines.push('- Responsible party: ' + gate.owner)
    lines.push('- Current status: ' + gate.status)
    lines.push('- Required evidence: ' + gate.requiredEvidence)
    lines.push('')
    lines.push('```bash')
    lines.push(gate.recordCommand)
    lines.push('```')
    lines.push('')
    lines.push('Preflight command:')
    lines.push('')
    lines.push('```bash')
    lines.push(gate.preflightCommand ?? `${gate.recordCommand} --dry-run --json`)
    lines.push('```')
    lines.push('')
  }
  return lines.join('\n') + '\n'
}

function renderVerificationCommands() {
  return [
    '# GSE Owner / External Gate Verification Commands',
    '',
    'Run these commands after attaching real owner/external records:',
    '',
    '```bash',
    'node scripts/run-gse-command.mjs --root __GSE__ --target __GSE__ --command "/gse probe --public-repo-url __PUBLIC_REPO_URL__ --security-contact-url __SECURITY_CONTACT_URL__ --public-ci-run-url __PUBLIC_CI_RUN_URL__ --registry-package-url __REGISTRY_PACKAGE_URL__ --marketplace-url __MARKETPLACE_LISTING_URL__ --native-host-evidence __NATIVE_HOST_EVIDENCE__ --other-host-evidence __OTHER_HOST_EVIDENCE__" --json',
    'node scripts/audit-public-acceptance-readiness.mjs --root __GSE__ --json',
    'node scripts/audit-public-acceptance-command-dry-run-drill.mjs --root __GSE__ --json',
    'node scripts/audit-final-readiness.mjs --root __GSE__ --json',
    'node scripts/audit-final-acceptance-packet.mjs --root __GSE__ --json',
    'node scripts/audit-release-owner-action-plan.mjs --root __GSE__ --json',
    'node scripts/audit-host-runtime-invocations.mjs --root __GSE__ --json',
    'node scripts/audit-owner-external-gate-kit.mjs --root __GSE__ --json',
    'node scripts/validate-gse.mjs --root __GSE__ --json',
    'node scripts/audit-close-gate.mjs --target __GSE__ --json',
    '```',
    '',
    'Acceptance rule: every pending gate must have accepted real evidence and final readiness must report `publicAccepted: verified`. Local fixture drills, pointer adapters, and generated handoff files do not count as external acceptance.',
    '',
  ].join('\n')
}

function renderActionPacket() {
  const lines = []
  const pendingAreas = new Set(gates.map((gate) => gate.area))
  const firstAction = pendingAreas.has('License decision')
    ? 'Start with owner-required decisions: license decision and public security contact. Then attach public repository, CI, publication, marketplace, and host runtime evidence as those external systems become available.'
    : pendingAreas.has('Public security contact')
      ? 'Start with the public security contact. Then attach public repository, CI, publication, marketplace, and host runtime evidence as those external systems become available.'
      : 'Start with the first available public repository, CI, publication, marketplace, or host runtime evidence record.'
  lines.push('# GSE Owner / External Action Packet')
  lines.push('')
  lines.push('Public accepted: ' + (doctor.data?.summary?.publicAccepted ?? 'unknown'))
  lines.push('')
  lines.push('## Pending Gates')
  lines.push('')
  for (const gate of gates) {
    lines.push('- ' + stageFor(gate) + ': ' + gate.area + ' -> ' + gate.owner)
  }
  lines.push('')
  lines.push('## First Action')
  lines.push('')
  lines.push(firstAction)
  lines.push('')
  lines.push('## Boundary')
  lines.push('')
  lines.push('This packet is not public acceptance. It is the execution kit for collecting the evidence that can later promote final readiness.')
  return lines.join('\n') + '\n'
}

function readGenerated(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
}

const kitManifest = JSON.stringify({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  root: displayRoot,
  publicAccepted: doctor.data?.summary?.publicAccepted ?? doctor.data?.workflows?.publicAccepted ?? 'unknown',
  pendingGateCount: gates.length,
  generatedFresh: {
    finalAcceptancePacket: true,
    publicAcceptanceHandoff: true,
    hostRuntimeEvidenceHandoff: true,
    releaseStatusManifest: true,
    releaseOwnerActionPlan: true,
  },
  gates: gates.map((gate) => ({
    stage: stageFor(gate),
    area: gate.area,
    status: gate.status,
    owner: gate.owner,
    currentEvidence: gate.currentEvidence,
    requiredEvidence: gate.requiredEvidence,
    recordCommand: gate.recordCommand,
    preflightCommand: gate.preflightCommand,
    willPromoteWhenAccepted: gate.willPromoteWhenAccepted,
  })),
  limits: [
    'Kit generation does not choose a license.',
    'Kit generation does not publish a package or approve a marketplace listing.',
    'Kit generation does not prove host-native slash-command support.',
  ],
}, null, 2) + '\n'

const files = {
  'README.md': renderReadme(),
  'action-packet.md': renderActionPacket(),
  'final-acceptance-packet.md': readGenerated(generatedPaths.finalAcceptancePacket),
  'public-acceptance-handoff.md': readGenerated(generatedPaths.publicAcceptanceHandoff),
  'host-runtime-evidence-handoff.md': readGenerated(generatedPaths.hostRuntimeEvidenceHandoff),
  'release-status-manifest.json': readGenerated(generatedPaths.releaseStatusManifest),
  'release-owner-action-plan.md': readGenerated(generatedPaths.releaseOwnerActionPlan),
  'record-commands.md': renderRecordCommands(),
  'verification-commands.md': renderVerificationCommands(),
  'kit-manifest.json': kitManifest,
}

if (errors.length === 0 && !dryRun) {
  if (fs.existsSync(out) && !force) {
    errors.push('output exists; pass --force to overwrite')
  } else {
    if (fs.existsSync(out)) fs.rmSync(out, { recursive: true, force: true })
    fs.mkdirSync(out, { recursive: true })
    for (const [fileName, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(out, fileName), content, 'utf8')
    }
  }
}

const report = {
  status: errors.length ? 'failed' : dryRun ? 'ready' : 'written',
  root,
  out,
  dryRun,
  errors,
  summary: {
    publicAccepted: doctor.data?.summary?.publicAccepted ?? doctor.data?.workflows?.publicAccepted ?? 'unknown',
    pendingGates: gates.length,
    files: Object.keys(files),
  },
}

rmSync(tempRoot, { recursive: true, force: true })

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(files['README.md'])

if (report.status === 'failed') process.exit(1)
