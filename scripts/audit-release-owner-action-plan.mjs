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

const generator = read('scripts/generate-release-owner-action-plan.mjs')
const validate = read('scripts/validate-gse.mjs')
const skill = read('SKILL.md')
const packaging = read('references/packaging.md')
const releaseGenerator = read('scripts/generate-release-bundle.mjs')
const releaseAudit = read('scripts/audit-release-bundle.mjs')
const tmp = mkdtempSync(path.join(tmpdir(), 'gse-release-owner-action-plan-'))
const tmpManifest = path.join(tmp, 'release-status-manifest.json')
const tmpPlan = path.join(tmp, 'release-owner-action-plan.md')
const generatedManifest = exists('scripts/generate-release-status-manifest.mjs')
  ? run(process.execPath, [path.join(root, 'scripts', 'generate-release-status-manifest.mjs'), '--root', root, '--out', tmpManifest, '--force', '--json'])
  : null
const generatedPlan = generatedManifest?.status === 0 && exists('scripts/generate-release-owner-action-plan.mjs')
  ? run(process.execPath, [path.join(root, 'scripts', 'generate-release-owner-action-plan.mjs'), '--root', root, '--manifest', tmpManifest, '--out', tmpPlan, '--force', '--json'])
  : null
const manifest = fs.existsSync(tmpManifest) ? parseJson(fs.readFileSync(tmpManifest, 'utf8')) : null
const plan = fs.existsSync(tmpPlan) ? fs.readFileSync(tmpPlan, 'utf8') : ''
const generatedData = generatedPlan ? parseJson(generatedPlan.stdout) : null
const canonicalPlan = read('.gse/acceptance/release-owner-action-plan.md')
rmSync(tmp, { recursive: true, force: true })

const pendingGates = manifest?.publicAcceptance?.pendingGates ?? []
const verifiedRows = manifest?.readiness?.verified?.length ?? 0
const ownerRequiredRows = manifest?.readiness?.ownerRequired?.length ?? 0
const externalRequiredRows = manifest?.readiness?.externalRequired?.length ?? 0
const publicAccepted = manifest?.publicAcceptance?.publicAccepted ?? manifest?.claimBoundary?.publicAccepted ?? 'unknown'
const requiredOwners = ['project owner', 'repository owner', 'external CI', 'external registry', 'external marketplace', 'host runtime']
const recordCommands = [...new Set(pendingGates
  .map((gate) => String(gate.recordCommand ?? '').match(/node scripts\/([^ ]+)/)?.[1] ?? '')
  .filter(Boolean))]
const planUsesCompleteRecordCommandTemplates = pendingGates.length === 0 || (!plan.includes('--invocation-status') &&
  !/record-[a-z-]+\.mjs[\s\S]*\.\.\./.test(plan) &&
  !/record-[a-z-]+\.mjs[^\n`]*[<>]/.test(plan) &&
  plan.includes('--status accepted'))
const planVerificationCommandsAreShellSafe = !/(audit-[a-z-]+|validate-gse|generate-release-status-manifest)\.mjs[^\n`]*[<>]/.test(plan) &&
  plan.includes('__GSE__')
const canonicalPlanMatchesCurrentManifest = canonicalPlan.includes('- Public accepted: ' + publicAccepted) &&
  canonicalPlan.includes('- Verified rows: ' + verifiedRows) &&
  canonicalPlan.includes('- Owner-required rows: ' + ownerRequiredRows) &&
  canonicalPlan.includes('- External-required rows: ' + externalRequiredRows) &&
  pendingGates.every((gate) => canonicalPlan.includes('#### ' + gate.area)) &&
  !canonicalPlan.includes('#### License decision')

const checks = [
  check('ROAP01', 'release owner action plan generator exists', exists('scripts/generate-release-owner-action-plan.mjs'), 'scripts/generate-release-owner-action-plan.mjs'),
  check('ROAP02', 'generator reads release status manifest', generator.includes('release-status-manifest.json') && generator.includes('pendingGates') && generator.includes('recordCommand'), 'generator source'),
  check('ROAP03', 'generator writes parseable action plan report', generatedPlan?.status === 0 && generatedData?.status === 'written' && plan.includes('GSE Release Owner Action Plan'), generatedPlan?.stderr || tmpPlan),
  check('ROAP04', 'plan preserves public acceptance boundary', plan.includes('Public accepted: verified') && plan.includes('Local validation does not mean public acceptance') && plan.includes('Native slash-command support requires a real host invocation record only when a host adapter claims it'), 'claim boundary'),
  check('ROAP05', 'plan groups actions by responsible owner', requiredOwners.every((owner) => plan.includes(owner.replace(/\b\w/g, (char) => char.toUpperCase())) || pendingGates.every((gate) => gate.owner !== owner)), 'owner groups'),
  check('ROAP06', 'plan includes every pending gate area or states none are pending', (pendingGates.length === 0 && plan.includes('No pending owner or external gates were reported by the manifest')) || (pendingGates.length > 0 && pendingGates.every((gate) => plan.includes(gate.area)) && !plan.includes('#### License decision')), 'pending gate areas'),
  check('ROAP07', 'plan includes concrete record commands when actions are pending', pendingGates.length === 0 || (recordCommands.length > 0 && recordCommands.every((command) => plan.includes(command))), recordCommands.join(', ') || 'none'),
  check('ROAP08', 'plan includes dry-run preflight commands when needed and post-action verification commands', (pendingGates.length === 0 || (plan.includes('Preflight command') && plan.includes('--dry-run --json'))) && plan.includes('validate-gse.mjs') && plan.includes('audit-public-acceptance-command-dry-run-drill.mjs') && plan.includes('audit-release-owner-action-plan.mjs') && plan.includes('generate-release-status-manifest.mjs'), 'dry-run preflight and verification commands'),
  check('ROAP08b', 'plan uses complete record command templates', planUsesCompleteRecordCommandTemplates, 'no ellipsis, no stale host invocation flag, host records use --status accepted'),
  check('ROAP09', 'skill routes users to release owner action plan', skill.includes('generate-release-owner-action-plan.mjs'), 'SKILL.md'),
  check('ROAP10', 'packaging docs route release owner action plan', packaging.includes('generate-release-owner-action-plan.mjs') && packaging.includes('audit-release-owner-action-plan.mjs'), 'references/packaging.md'),
  check('ROAP11', 'validator includes release owner action plan audit', validate.includes('audit-release-owner-action-plan.mjs'), 'scripts/validate-gse.mjs'),
  check('ROAP12', 'release bundle includes owner action plan', releaseGenerator.includes('release-owner-action-plan.md') && releaseAudit.includes('release-owner-action-plan.md'), 'release bundle generator and audit'),
  check('ROAP13', 'plan verification commands use shell-safe placeholders', planVerificationCommandsAreShellSafe, 'verification commands use __GSE__ instead of <gse>'),
  check('ROAP14', 'canonical release owner action plan matches current manifest counts and pending gates', canonicalPlanMatchesCurrentManifest, '.gse/acceptance/release-owner-action-plan.md'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    releaseOwnerActionPlan: failed === 0 ? 'verified' : 'failed',
    publicAccepted: manifest?.publicAcceptance?.publicAccepted ?? 'unknown',
    pendingGates: pendingGates.length,
  },
  limits: [
    'This audit verifies generation of an owner-facing action plan from the release status manifest.',
    'It does not create optional host-native slash-command evidence.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Release Owner Action Plan Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Release owner action plan: ' + data.workflows.releaseOwnerActionPlan)
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
