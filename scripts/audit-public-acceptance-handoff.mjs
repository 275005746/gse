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
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : ''
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
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

const generator = read('scripts/generate-public-acceptance-handoff.mjs')
const validate = read('scripts/validate-gse.mjs')
const skill = read('SKILL.md')
const tmp = mkdtempSync(path.join(tmpdir(), 'gse-public-acceptance-handoff-'))
const out = path.join(tmp, 'public-acceptance-handoff.md')
const generated = exists('scripts/generate-public-acceptance-handoff.mjs')
  ? run(process.execPath, [path.join(root, 'scripts', 'generate-public-acceptance-handoff.mjs'), '--root', root, '--out', out, '--force', '--json'])
  : null
const generatedData = generated ? parseJson(generated.stdout) : null
const handoff = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : ''
rmSync(tmp, { recursive: true, force: true })

const doctorRun = run(process.execPath, [path.join(root, 'scripts', 'audit-public-acceptance-readiness.mjs'), '--root', root, '--json'])
const doctorData = parseJson(doctorRun.stdout)
const currentPendingGates = doctorData?.pendingGates ?? []
const requiredGates = currentPendingGates.map((gate) => gate.area)
const hasRegistryGate = requiredGates.includes('Public registry publication')
const requiredCommands = [...new Set(currentPendingGates
  .map((gate) => String(gate.recordCommand ?? '').match(/scripts\/([\w-]+\.mjs)/)?.[1])
  .filter(Boolean))]
const antiOverclaim = [
  'does not choose a license',
  'does not choose a license, publish a package, configure a repository, approve a marketplace listing, or prove optional host-native slash-command support',
  'Do not claim public release acceptance',
  'Do not claim native slash-command support',
]

const checks = [
  check('PAH01', 'public acceptance handoff generator exists', exists('scripts/generate-public-acceptance-handoff.mjs'), 'scripts/generate-public-acceptance-handoff.mjs'),
  check('PAH02', 'generator is based on the public acceptance doctor', generator.includes('audit-public-acceptance-readiness.mjs') && generator.includes('pendingGates'), 'generator calls doctor and renders pending gates'),
  check('PAH03', 'generator produces a handoff file', generated?.status === 0 && generatedData?.status === 'written' && handoff.length > 0, generated?.stderr || out),
  check('PAH04', 'handoff covers all current required final-form gates or states none are pending', (requiredGates.length === 0 && handoff.includes('No owner/external gates are pending')) || (requiredGates.length > 0 && requiredGates.every((term) => handoff.includes(term)) && !handoff.includes('### 1. Owner decision - License decision')), requiredGates.join(', ') || 'none'),
  check('PAH05', 'handoff reuses existing record commands', requiredCommands.every((term) => handoff.includes(term)), requiredCommands.join(', ')),
  check('PAH05b', 'handoff registry publication command matches real record CLI when pending', !hasRegistryGate || (handoff.includes('--proves-registry-publication true') && !handoff.includes('--proves-public-registry-publication')), hasRegistryGate ? 'record-public-channel-publication.mjs uses --proves-registry-publication' : 'registry publication already verified'),
  check('PAH05c', 'handoff includes dry-run preflight commands when accepted records are pending', requiredGates.length === 0 || (handoff.includes('Preflight command') && handoff.includes('--dry-run --json')), 'dry-run preflight commands'),
  check('PAH06', 'handoff preserves anti-overclaim boundaries', antiOverclaim.every((term) => handoff.includes(term)), antiOverclaim.join(', ')),
  check('PAH07', 'handoff preserves current public acceptance boundary', handoff.includes('Public accepted: verified') && generatedData?.summary?.publicAccepted === 'verified', 'publicAccepted verified'),
  check('PAH08', 'skill routes users to public acceptance handoff', skill.includes('generate-public-acceptance-handoff.mjs'), 'SKILL.md'),
  check('PAH09', 'consolidated validator includes handoff audit', validate.includes('audit-public-acceptance-handoff.mjs'), 'scripts/validate-gse.mjs'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    publicAcceptanceHandoff: failed === 0 ? 'verified' : 'failed',
    publicAccepted: generatedData?.summary?.publicAccepted ?? 'unknown',
  },
  limits: [
    'This audit verifies handoff generation and claim boundaries only.',
    'It does not choose a license, publish a package, configure a repository, run public CI, approve a marketplace listing, or prove optional host-native slash commands.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Public Acceptance Handoff Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Public acceptance handoff: ' + data.workflows.publicAcceptanceHandoff)
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
