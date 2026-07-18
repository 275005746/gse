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

const generator = read('scripts/generate-release-status-manifest.mjs')
const validate = read('scripts/validate-gse.mjs')
const skill = read('SKILL.md')
const releaseGenerator = read('scripts/generate-release-bundle.mjs')
const releaseAudit = read('scripts/audit-release-bundle.mjs')
const tmp = mkdtempSync(path.join(tmpdir(), 'gse-release-status-manifest-'))
const out = path.join(tmp, 'release-status-manifest.json')
const generated = exists('scripts/generate-release-status-manifest.mjs')
  ? run(process.execPath, [path.join(root, 'scripts', 'generate-release-status-manifest.mjs'), '--root', root, '--out', out, '--force', '--json'])
  : null
const generatedData = generated ? parseJson(generated.stdout) : null
const manifest = fs.existsSync(out) ? parseJson(fs.readFileSync(out, 'utf8')) : null
rmSync(tmp, { recursive: true, force: true })

const requiredArtifacts = [
  'finalAcceptancePacket',
  'publicAcceptanceHandoff',
  'hostRuntimeEvidenceHandoff',
  'releaseStatusManifest',
]
const requiredDistribution = [
  'localPackage',
  'localInstall',
  'localInstalledCli',
  'remoteInstall',
  'remoteInstalledCli',
  'integrityGate',
  'packageSigning',
  'signatureVerification',
  'releaseBundle',
]
const requiredCommands = [
  'validate-gse.mjs',
  'audit-final-readiness.mjs',
  'audit-public-acceptance-readiness.mjs',
  'audit-public-acceptance-command-dry-run-drill.mjs',
  'audit-host-runtime-invocations.mjs',
  'audit-host-runtime-invocation-drill.mjs',
  'audit-release-bundle.mjs',
]
const verificationCommandsAreShellSafe = (manifest?.verificationCommands?.length ?? 0) > 0 &&
  manifest.verificationCommands.every((command) => !/[<>]/.test(command) && command.includes('__GSE__'))

const checks = [
  check('RSM01', 'release status manifest generator exists', exists('scripts/generate-release-status-manifest.mjs'), 'scripts/generate-release-status-manifest.mjs'),
  check('RSM02', 'generator composes authoritative non-circular audits', ['audit-final-readiness.mjs', 'audit-public-acceptance-readiness.mjs', 'audit-host-runtime-invocations.mjs', 'audit-host-runtime-invocation-drill.mjs'].every((term) => generator.includes(term)) && !generator.includes("audit('audit-release-bundle.mjs')") && !generator.includes("audit('audit-distribution.mjs')"), 'generator source audits'),
  check('RSM03', 'generator writes parseable manifest', generated?.status === 0 && generatedData?.status === 'written' && manifest?.schemaVersion === 1, generated?.stderr || out),
  check('RSM04', 'manifest preserves public acceptance boundary', manifest?.claimBoundary?.publicAccepted === 'not-accepted' && manifest?.claimBoundary?.localValidationDoesNotMeanPublicAcceptance === true && manifest?.claimBoundary?.nativeSlashCommandIsOptionalAdapterClaim === true, 'publicAccepted not-accepted; native slash optional adapter claim'),
  check('RSM05', 'manifest covers verified, external-required, and optional not-claimed rows', (manifest?.readiness?.verified?.length ?? 0) > 0 && (manifest?.readiness?.notClaimed?.length ?? 0) > 0 && (manifest?.readiness?.externalRequired?.length ?? 0) > 0 && (manifest?.readiness?.ownerRequired?.length ?? 0) === 0, 'readiness row groups'),
  check('RSM06', 'manifest covers install and distribution status', requiredDistribution.every((key) => manifest?.distribution?.[key]), requiredDistribution.join(', ')),
  check('RSM07', 'manifest exposes public acceptance next commands while required gates remain', (manifest?.publicAcceptance?.pendingGates?.length ?? 0) > 0 && (manifest?.publicAcceptance?.nextCommands?.length ?? 0) > 0, 'pending gates and next commands'),
  check('RSM07b', 'manifest exposes public acceptance dry-run preflight commands while required gates remain', (manifest?.publicAcceptance?.pendingGates?.length ?? 0) > 0 && (manifest?.publicAcceptance?.nextPreflightCommands?.length ?? 0) > 0, 'pending gates and preflight commands'),
  check('RSM08', 'manifest covers host runtime evidence counts', Number.isInteger(manifest?.hostRuntime?.nativeSlashCommandRecords) && Number.isInteger(manifest?.hostRuntime?.portableTextCommandRecords) && manifest.hostRuntime.nativeSlashCommandRecords >= 0 && manifest.hostRuntime.portableTextCommandRecords >= 0, `native ${manifest?.hostRuntime?.nativeSlashCommandRecords ?? 'unknown'}, portable ${manifest?.hostRuntime?.portableTextCommandRecords ?? 'unknown'}`),
  check('RSM08b', 'manifest covers host runtime fixture drill status', manifest?.hostRuntime?.fixtureDrill === 'verified' && manifest?.hostRuntime?.fixtureNativeSlashCommandRecords === 1 && manifest?.hostRuntime?.fixturePortableTextCommandRecords === 4 && manifest?.hostRuntime?.fixtureEvidenceIsPersistent === false, `drill ${manifest?.hostRuntime?.fixtureDrill ?? 'unknown'}, fixture native ${manifest?.hostRuntime?.fixtureNativeSlashCommandRecords ?? 'unknown'}, fixture portable ${manifest?.hostRuntime?.fixturePortableTextCommandRecords ?? 'unknown'}`),
  check('RSM09', 'manifest points to handoff artifacts', requiredArtifacts.every((key) => manifest?.artifacts?.[key]), requiredArtifacts.join(', ')),
  check('RSM10', 'manifest includes verification commands', requiredCommands.every((term) => manifest?.verificationCommands?.some((command) => command.includes(term))), requiredCommands.join(', ')),
  check('RSM11', 'skill routes users to release status manifest', skill.includes('generate-release-status-manifest.mjs'), 'SKILL.md'),
  check('RSM12', 'validator includes release status manifest audit', validate.includes('audit-release-status-manifest.mjs'), 'scripts/validate-gse.mjs'),
  check('RSM13', 'release bundle includes release status manifest', releaseGenerator.includes('release-status-manifest.json') && releaseAudit.includes('release-status-manifest.json'), 'release bundle generator and audit'),
  check('RSM14', 'manifest verification commands use shell-safe placeholders', verificationCommandsAreShellSafe, 'verification commands use __GSE__ instead of <gse>'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    releaseStatusManifest: failed === 0 ? 'verified' : 'failed',
    publicAccepted: manifest?.claimBoundary?.publicAccepted ?? 'unknown',
    pendingGates: manifest?.publicAcceptance?.pendingGates?.length ?? 'unknown',
  },
  limits: [
    'This audit verifies manifest generation from local audits.',
    'It does not create owner decisions, public CI, public repository settings, marketplace approval, registry publication, or native slash-command evidence.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Release Status Manifest Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Release status manifest: ' + data.workflows.releaseStatusManifest)
  lines.push('- Public accepted: ' + data.workflows.publicAccepted)
  lines.push('- Pending gates: ' + data.workflows.pendingGates)
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
