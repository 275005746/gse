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
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
  }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const generator = read('scripts/generate-final-acceptance-packet.mjs')
const finalReadiness = read('references/final-readiness.md')
const validate = read('scripts/validate-gse.mjs')
const tmp = mkdtempSync(path.join(tmpdir(), 'gse-final-acceptance-'))
const out = path.join(tmp, 'final-acceptance-packet.md')
const generated = run(process.execPath, [path.join(root, 'scripts', 'generate-final-acceptance-packet.mjs'), '--root', root, '--out', out, '--force', '--json'])
let generatedJson = null
try {
  generatedJson = JSON.parse(generated.stdout)
} catch {}
const packet = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : ''
rmSync(tmp, { recursive: true, force: true })
const publicAcceptance = run(process.execPath, [path.join(root, 'scripts', 'audit-public-acceptance-readiness.mjs'), '--root', root, '--json'])
let publicAcceptanceJson = null
try {
  publicAcceptanceJson = JSON.parse(publicAcceptance.stdout)
} catch {}

const requiredSections = [
  '# GSE Final Acceptance Packet',
  '## Current Claim Boundary',
  '## Verified Local Capabilities',
  '## Pending Acceptance Gates',
  '## Re-Verification Commands',
  '## Anti-Overclaim Rules',
  '## Next Action',
]
const pendingTerms = [
  ...(publicAcceptanceJson?.pendingGates ?? []).map((gate) => gate.area),
  'audit-public-acceptance-readiness.mjs',
  ...(publicAcceptanceJson?.pendingGates ?? []).map((gate) => String(gate.recordCommand ?? '').match(/scripts\/([\w-]+\.mjs)/)?.[1]).filter(Boolean),
]
const antiOverclaimTerms = [
  'Do not claim public release acceptance',
  'Do not claim marketplace availability',
  'Do not claim native slash-command support',
  'Do not claim support for a host',
]
const packetUsesCompleteRecordCommandTemplates = (publicAcceptanceJson?.pendingGates?.length ?? 0) === 0 || (!packet.includes('--invocation-status') &&
  !/record-[a-z-]+\.mjs[\s\S]*\.\.\./.test(packet) &&
  !/record-[a-z-]+\.mjs[^\n`]*[<>]/.test(packet) &&
  packet.includes('--status accepted') &&
  packet.includes('--dry-run --json'))

const checks = [
  check('FAP01', 'final acceptance packet generator exists', exists('scripts/generate-final-acceptance-packet.mjs'), 'scripts/generate-final-acceptance-packet.mjs'),
  check('FAP02', 'generator is based on final readiness audit', generator.includes('audit-final-readiness.mjs') && generator.includes('Pending Acceptance Gates'), 'generator calls final readiness and renders pending gates'),
  check('FAP03', 'generator produces a packet in a temporary output path', generated.status === 0 && generatedJson?.status === 'ready' && packet.length > 0, generated.stderr || out),
  check('FAP04', 'packet contains required owner/external gate sections', requiredSections.every((term) => packet.includes(term)), requiredSections.join(', ')),
  check('FAP05', 'packet enumerates all current pending final-form gates or none are pending', (publicAcceptanceJson?.pendingGates?.length ?? 0) === 0 || (pendingTerms.length > 1 && pendingTerms.every((term) => packet.includes(term))), pendingTerms.join(', ') || 'none'),
  check('FAP06', 'packet keeps anti-overclaim boundaries explicit', antiOverclaimTerms.every((term) => packet.includes(term)), antiOverclaimTerms.join(', ')),
  check('FAP07', 'final readiness docs route users to the packet generator', finalReadiness.includes('generate-final-acceptance-packet.mjs'), 'references/final-readiness.md'),
  check('FAP08', 'consolidated validator includes this audit', validate.includes('audit-final-acceptance-packet.mjs'), 'scripts/validate-gse.mjs'),
  check('FAP09', 'packet uses complete record command templates', packetUsesCompleteRecordCommandTemplates, 'no ellipsis, no stale host invocation flag, includes preflight commands'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    finalAcceptancePacket: failed === 0 ? 'verified' : 'failed',
    publicAccepted: generatedJson?.summary?.publicAccepted ?? 'unknown',
  },
  limits: [
    'This audit verifies packet generation and claim boundaries only.',
    'It does not choose a license, approve a security contact, publish a marketplace listing, or prove optional host-native slash commands.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Final Acceptance Packet Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Final acceptance packet: ' + data.workflows.finalAcceptancePacket)
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
