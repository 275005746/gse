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

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function read(relativePath) {
  const fullPath = path.join(root, relativePath)
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : ''
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

function parseJson(stdout) {
  try {
    return JSON.parse(stdout)
  } catch {
    return null
  }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const tmp = mkdtempSync(path.join(tmpdir(), 'gse-owner-external-gate-kit-'))
const out = path.join(tmp, 'kit')
const generated = exists('scripts/generate-owner-external-gate-kit.mjs')
  ? run(process.execPath, [path.join(root, 'scripts', 'generate-owner-external-gate-kit.mjs'), '--root', root, '--out', out, '--force', '--json'])
  : null
const generatedData = generated ? parseJson(generated.stdout) : null

function readKit(fileName) {
  const fullPath = path.join(out, fileName)
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : ''
}

function readCanonicalKit(fileName) {
  return read(path.join('.gse', 'acceptance', 'owner-external-gate-kit', fileName))
}

function stableGateSnapshot(data) {
  return (data?.gates ?? []).map((gate) => ({
    stage: gate.stage,
    area: gate.area,
    status: gate.status,
    owner: gate.owner,
    requiredEvidence: gate.requiredEvidence,
    recordCommand: gate.recordCommand,
    preflightCommand: gate.preflightCommand,
  }))
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

const readme = readKit('README.md')
const actionPacket = readKit('action-packet.md')
const finalPacket = readKit('final-acceptance-packet.md')
const publicHandoff = readKit('public-acceptance-handoff.md')
const hostHandoff = readKit('host-runtime-evidence-handoff.md')
const releaseStatusManifest = readKit('release-status-manifest.json')
const releaseOwnerActionPlan = readKit('release-owner-action-plan.md')
const commands = readKit('record-commands.md')
const verificationCommands = readKit('verification-commands.md')
const manifestText = readKit('kit-manifest.json')
const manifest = parseJson(manifestText)
const canonicalReadme = readCanonicalKit('README.md')
const canonicalActionPacket = readCanonicalKit('action-packet.md')
const canonicalCommands = readCanonicalKit('record-commands.md')
const canonicalVerificationCommands = readCanonicalKit('verification-commands.md')
const canonicalManifestText = readCanonicalKit('kit-manifest.json')
const canonicalManifest = parseJson(canonicalManifestText)
const requiredKitFiles = [
  'README.md',
  'action-packet.md',
  'final-acceptance-packet.md',
  'public-acceptance-handoff.md',
  'host-runtime-evidence-handoff.md',
  'release-status-manifest.json',
  'release-owner-action-plan.md',
  'record-commands.md',
  'verification-commands.md',
  'kit-manifest.json',
]
const requiredKitFilesPresent = requiredKitFiles.every((item) => readKit(item).length > 0)
const canonicalRequiredKitFilesPresent = requiredKitFiles.every((item) => readCanonicalKit(item).length > 0)
rmSync(tmp, { recursive: true, force: true })

const skill = read('SKILL.md')
const validate = read('scripts/validate-gse.mjs')
const bundleGenerator = read('scripts/generate-release-bundle.mjs')
const bundleAudit = read('scripts/audit-release-bundle.mjs')
const expectedAreas = (manifest?.gates ?? []).map((gate) => gate.area)
const hasPendingGates = expectedAreas.length > 0
const expectedScripts = [...new Set((manifest?.gates ?? [])
  .map((gate) => String(gate.recordCommand ?? '').match(/node scripts\/([^ ]+)/)?.[1] ?? '')
  .filter(Boolean))]
const kitRecordTemplatesAreComplete = !commands.includes('--invocation-status') &&
  !finalPacket.includes('--invocation-status') &&
  !publicHandoff.includes('--invocation-status') &&
  !releaseOwnerActionPlan.includes('--invocation-status') &&
  !hostHandoff.includes('--invocation-status') &&
  !/record-[a-z-]+\.mjs[\s\S]*\.\.\./.test(commands) &&
  !/record-[a-z-]+\.mjs[\s\S]*\.\.\./.test(finalPacket) &&
  !/record-[a-z-]+\.mjs[\s\S]*\.\.\./.test(publicHandoff) &&
  !/record-[a-z-]+\.mjs[\s\S]*\.\.\./.test(releaseOwnerActionPlan) &&
  !/record-[a-z-]+\.mjs[^\n`]*[<>]/.test(commands) &&
  !/record-[a-z-]+\.mjs[^\n`]*[<>]/.test(finalPacket) &&
  !/record-[a-z-]+\.mjs[^\n`]*[<>]/.test(publicHandoff) &&
  !/record-[a-z-]+\.mjs[^\n`]*[<>]/.test(releaseOwnerActionPlan) &&
  !/record-[a-z-]+\.mjs[^\n`]*[<>]/.test(hostHandoff) &&
  (hasPendingGates ? commands.includes('--status accepted') : manifest?.publicAccepted === 'verified')
const kitVerificationCommandsAreShellSafe = !/(audit-[a-z-]+|validate-gse|generate-release-status-manifest)\.mjs[^\n`]*[<>]/.test(verificationCommands) &&
  !/(audit-[a-z-]+|validate-gse)\.mjs[^\n`]*[<>]/.test(releaseStatusManifest) &&
  !/(audit-[a-z-]+|validate-gse|generate-release-status-manifest)\.mjs[^\n`]*[<>]/.test(releaseOwnerActionPlan) &&
  verificationCommands.includes('__GSE__')

const checks = [
  check('OEG01', 'owner/external gate kit generator exists', exists('scripts/generate-owner-external-gate-kit.mjs'), 'scripts/generate-owner-external-gate-kit.mjs'),
  check('OEG02', 'generator produces the kit directory', generated?.status === 0 && generatedData?.status === 'written', generated?.stderr || out),
  check('OEG03', 'kit includes required files', requiredKitFilesPresent, requiredKitFiles.join(', ')),
  check('OEG04', 'machine-readable pending gates cover current final owner/external gates', (hasPendingGates ? expectedAreas.every((area) => manifest?.gates?.some((gate) => gate.area === area)) : manifest?.pendingGateCount === 0 && manifest?.publicAccepted === 'verified') && !manifest?.gates?.some((gate) => gate.area === 'License decision'), hasPendingGates ? expectedAreas.join(', ') + '; License decision resolved' : '0 pending gates; publicAccepted verified; License decision resolved'),
  check('OEG05', 'record commands map to real scripts', hasPendingGates ? (expectedScripts.length > 0 && expectedScripts.every((script) => commands.includes(script)) && !commands.includes('proves-public-registry-publication') && (!commands.includes('record-public-channel-publication.mjs') || commands.includes('--proves-registry-publication true') || commands.includes('--proves-marketplace-approval true'))) : commands.includes('GSE Owner / External Gate Record Commands'), expectedScripts.join(', ')),
  check('OEG05b', 'record commands include dry-run preflight commands for accepted evidence', hasPendingGates ? (commands.includes('Preflight command') && commands.includes('--dry-run --json')) : !commands.includes('Preflight command'), 'record-commands.md'),
  check('OEG05c', 'kit uses complete record command templates', kitRecordTemplatesAreComplete, 'no ellipsis, no stale host invocation flag, host records use --status accepted'),
  check('OEG06', 'kit preserves anti-overclaim boundaries', readme.includes('does not choose a license') && readme.includes('Do not claim native slash-command support') && verificationCommands.includes('Local fixture drills, pointer adapters, and generated handoff files do not count as external acceptance'), 'README.md, verification-commands.md'),
  check('OEG07', 'kit verification commands include portable probe, final readiness, preflight drill, and close gate', verificationCommands.includes('run-gse-command.mjs') && verificationCommands.includes('/gse probe') && !verificationCommands.includes('node scripts/probe-public-external-gates.mjs') && verificationCommands.includes('audit-final-readiness.mjs') && verificationCommands.includes('audit-public-acceptance-readiness.mjs') && verificationCommands.includes('audit-public-acceptance-command-dry-run-drill.mjs') && verificationCommands.includes('audit-close-gate.mjs'), 'verification-commands.md'),
  check('OEG08', 'kit contains fresh final acceptance, public handoff, host handoff, manifest, and owner action plan', finalPacket.includes('GSE Final Acceptance Packet') && publicHandoff.includes('GSE Public Acceptance Handoff') && hostHandoff.includes('GSE Host Runtime Evidence Handoff') && releaseStatusManifest.includes('"publicAccepted": "' + (manifest?.publicAccepted ?? 'unknown') + '"') && releaseOwnerActionPlan.includes('GSE Release Owner Action Plan'), 'generated kit artifacts'),
  check('OEG09', 'kit manifest marks generated handoff artifacts as fresh', manifest?.generatedFresh?.finalAcceptancePacket === true && manifest?.generatedFresh?.publicAcceptanceHandoff === true && manifest?.generatedFresh?.hostRuntimeEvidenceHandoff === true && manifest?.generatedFresh?.releaseStatusManifest === true && manifest?.generatedFresh?.releaseOwnerActionPlan === true, 'kit-manifest.json'),
  check('OEG09b', 'kit manifest carries preflight commands for every pending gate', hasPendingGates ? manifest.gates.every((gate) => gate.preflightCommand?.includes('--dry-run --json')) : manifest?.pendingGateCount === 0, 'kit-manifest.json'),
  check('OEG10', 'skill routes users to the owner/external gate kit', skill.includes('generate-owner-external-gate-kit.mjs') && skill.includes('audit-owner-external-gate-kit.mjs'), 'SKILL.md'),
  check('OEG11', 'validator includes owner/external gate kit audit', validate.includes('audit-owner-external-gate-kit.mjs'), 'scripts/validate-gse.mjs'),
  check('OEG12', 'release bundle includes owner/external gate kit', bundleGenerator.includes('generate-owner-external-gate-kit.mjs') && bundleAudit.includes('owner-external-gate-kit'), 'release bundle generator/audit'),
  check('OEG13', 'kit verification commands use shell-safe placeholders', kitVerificationCommandsAreShellSafe, 'verification commands use __GSE__ instead of <gse>'),
  check('OEG14', 'canonical owner/external gate kit exists', canonicalRequiredKitFilesPresent, '.gse/acceptance/owner-external-gate-kit/'),
  check('OEG15', 'canonical owner/external gate kit matches current generated gate snapshot', canonicalManifest?.publicAccepted === manifest?.publicAccepted && canonicalManifest?.pendingGateCount === manifest?.pendingGateCount && sameJson(stableGateSnapshot(canonicalManifest), stableGateSnapshot(manifest)), '.gse/acceptance/owner-external-gate-kit/kit-manifest.json'),
  check('OEG16', 'canonical owner/external gate kit preserves current handoff commands and boundaries', canonicalReadme.includes('GSE Owner / External Gate Kit') && canonicalActionPacket.includes('Public accepted: ' + (manifest?.publicAccepted ?? 'unknown')) && (hasPendingGates ? (canonicalCommands.includes('--dry-run --json') && canonicalCommands.includes('--status accepted')) : !canonicalCommands.includes('Preflight command')) && canonicalVerificationCommands.includes('run-gse-command.mjs') && canonicalVerificationCommands.includes('/gse probe') && !canonicalVerificationCommands.includes('node scripts/probe-public-external-gates.mjs') && canonicalVerificationCommands.includes('audit-public-acceptance-command-dry-run-drill.mjs') && canonicalVerificationCommands.includes('__GSE__'), '.gse/acceptance/owner-external-gate-kit/'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    ownerExternalGateKit: failed === 0 ? 'verified' : 'failed',
    pendingGates: manifest?.pendingGateCount ?? null,
    publicAccepted: manifest?.publicAccepted ?? 'unknown',
  },
  limits: [
    'This audit verifies owner/external gate kit generation and claim boundaries only.',
    'It does not choose a license, publish a package, configure a repository, run public CI, approve a marketplace listing, or prove host-native slash commands.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Owner / External Gate Kit Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Owner/external gate kit: ' + data.workflows.ownerExternalGateKit)
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

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(renderMarkdown(report))

if (failed > 0) process.exit(1)
