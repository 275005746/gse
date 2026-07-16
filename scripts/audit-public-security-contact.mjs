#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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

function run(command, commandArgs, cwd = root) {
  const result = spawnSync(command, commandArgs, {
    cwd,
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

function createFixture() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-public-security-contact-'))
  fs.mkdirSync(path.join(fixture, '.gse', 'releases'), { recursive: true })
  fs.writeFileSync(path.join(fixture, 'SECURITY.md'), '# Security Policy\n\nNo public vulnerability disclosure address has been owner-approved yet.\n', 'utf8')
  return fixture
}

const recordScript = path.join(root, 'scripts', 'record-public-security-contact.mjs')
const template = read('assets/templates/public-security-contact-record.md')
const security = read('SECURITY.md')
const publicRelease = read('references/public-release.md')
const finalReadiness = read('references/final-readiness.md')
const validate = read('scripts/validate-gse.mjs')

const fixture = exists('scripts/record-public-security-contact.mjs') ? createFixture() : null
const pending = fixture ? run(process.execPath, [recordScript, '--root', fixture, '--contact-status', 'pending', '--dry-run', '--json']) : null
const acceptedOk = fixture ? run(process.execPath, [
  recordScript,
  '--root', fixture,
  '--contact-status', 'accepted',
  '--contact-type', 'email',
  '--contact-value', 'security@example.com',
  '--evidence-owner', 'fixture-owner',
  '--evidence-date', '2026-07-06',
  '--evidence-url', 'https://github.com/example/gse/security/policy',
  '--is-public', 'true',
  '--security-policy-updated', 'true',
  '--evidence-status', 'accepted',
  '--accepted-by', 'fixture-owner',
  '--accepted-at', '2026-07-06',
  '--dry-run',
  '--json',
]) : null
const acceptedMissing = fixture ? run(process.execPath, [recordScript, '--root', fixture, '--contact-status', 'accepted', '--evidence-status', 'pending', '--dry-run', '--json']) : null
const acceptedPlaceholderWrite = fixture ? run(process.execPath, [
  recordScript,
  '--root', fixture,
  '--contact-status', 'accepted',
  '--contact-type', 'email',
  '--contact-value', 'security@example.com',
  '--evidence-owner', 'fixture-owner',
  '--evidence-date', '2026-07-06',
  '--evidence-url', 'https://github.com/example/gse/security/policy',
  '--is-public', 'true',
  '--security-policy-updated', 'true',
  '--evidence-status', 'accepted',
  '--accepted-by', 'fixture-owner',
  '--accepted-at', '2026-07-06',
  '--json',
]) : null

const pendingData = pending ? parseJson(pending.stdout) : null
const acceptedOkData = acceptedOk ? parseJson(acceptedOk.stdout) : null
const acceptedMissingData = acceptedMissing ? parseJson(acceptedMissing.stdout) : null
const acceptedPlaceholderWriteData = acceptedPlaceholderWrite ? parseJson(acceptedPlaceholderWrite.stdout) : null

const checks = [
  check('PSC01', 'public security contact record command exists', exists('scripts/record-public-security-contact.mjs'), 'scripts/record-public-security-contact.mjs'),
  check('PSC02', 'public security contact template exists', exists('assets/templates/public-security-contact-record.md') && template.includes('Contact status') && template.includes('Security policy updated?'), 'assets/templates/public-security-contact-record.md'),
  check('PSC03', 'pending contact path remains writable without owner proof', pending?.status === 0 && pendingData?.status === 'ready' && pendingData?.contactStatus === 'pending' && pendingData?.evidenceStatus === 'pending', 'record-public-security-contact pending dry-run'),
  check('PSC04', 'accepted contact path accepts complete owner evidence', acceptedOk?.status === 0 && acceptedOkData?.status === 'ready' && acceptedOkData?.contactStatus === 'accepted' && acceptedOkData?.evidenceStatus === 'accepted', 'record-public-security-contact accepted dry-run'),
  check('PSC05', 'accepted contact path rejects missing owner evidence', acceptedMissing?.status !== 0 && acceptedMissingData?.status === 'failed' && acceptedMissingData?.errors?.some((item) => item.includes('--contact-value')) && acceptedMissingData?.errors?.some((item) => item.includes('--accepted-by')) && acceptedMissingData?.errors?.some((item) => item.includes('--evidence-status accepted')), 'record-public-security-contact accepted missing-fields dry-run'),
  check('PSC06', 'accepted contact real write rejects placeholder or example evidence', acceptedPlaceholderWrite?.status !== 0 && acceptedPlaceholderWriteData?.status === 'failed' && acceptedPlaceholderWriteData?.errors?.some((item) => item.includes('not a placeholder')), 'record-public-security-contact accepted placeholder write'),
  check('PSC07', 'security policy keeps public contact owner-gated', security.includes('Until a public security contact is chosen') && security.includes('No public vulnerability disclosure address has been owner-approved yet'), 'SECURITY.md'),
  check('PSC08', 'public release docs reference public security contact evidence', publicRelease.includes('Public security contact') && publicRelease.includes('record-public-security-contact.mjs'), 'references/public-release.md'),
  check('PSC09', 'final readiness matrix includes public security contact record', finalReadiness.includes('Public security contact record') && finalReadiness.includes('Public security contact'), 'references/final-readiness.md'),
  check('PSC10', 'consolidated validator includes public security contact audit', validate.includes('audit-public-security-contact.mjs'), 'scripts/validate-gse.mjs'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  fixtureRoot: fixture,
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    publicSecurityContact: failed === 0 ? 'verified' : 'failed',
    acceptedSecurityContact: acceptedOkData?.status === 'ready' ? 'fixture-verified' : 'not-verified',
  },
  limits: [
    'This audit verifies record mechanics and guardrails for public security contact acceptance.',
    'It does not create a real public vulnerability disclosure address or approve a SECURITY.md policy.',
    'Accepted public security contact still requires owner evidence from the real public release process.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Public Security Contact Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Public security contact: ' + data.workflows.publicSecurityContact)
  lines.push('- Accepted security contact path: ' + data.workflows.acceptedSecurityContact)
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
