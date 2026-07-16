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

const generator = read('scripts/generate-host-runtime-evidence-handoff.mjs')
const validate = read('scripts/validate-gse.mjs')
const skill = read('SKILL.md')
const releaseGenerator = read('scripts/generate-release-bundle.mjs')
const releaseAudit = read('scripts/audit-release-bundle.mjs')
const compatibility = read('references/compatibility.md')
const tmp = mkdtempSync(path.join(tmpdir(), 'gse-host-runtime-handoff-'))
const out = path.join(tmp, 'host-runtime-evidence-handoff.md')
const generated = exists('scripts/generate-host-runtime-evidence-handoff.mjs')
  ? run(process.execPath, [path.join(root, 'scripts', 'generate-host-runtime-evidence-handoff.mjs'), '--root', root, '--out', out, '--force', '--json'])
  : null
const generatedData = generated ? parseJson(generated.stdout) : null
const handoff = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : ''
rmSync(tmp, { recursive: true, force: true })

const hostFamilies = [
  'Codex-style',
  'Claude Code-style',
  'Hermes/AION-style runtime',
  'WorkBuddy/other IDE agents',
  'Copilot/Gemini-style assistants',
  'Unknown or custom host',
]
const boundaries = [
  'Do not claim native slash-command support',
  'Do not claim a host is supported without a host runtime invocation record',
  'subagents, MCP, LSP, browser tools, hooks, and plugins as host/session-specific',
]
const commands = [
  'record-host-invocation.mjs',
  'audit-host-runtime-invocations.mjs',
  'audit-final-readiness.mjs',
  'validate-gse.mjs',
]
const handoffUsesShellSafeCommandPlaceholders = !/record-host-invocation\.mjs[^\n`]*[<>]/.test(handoff) &&
  !/audit-[a-z-]+\.mjs[^\n`]*[<>]/.test(handoff) &&
  !/validate-gse\.mjs[^\n`]*[<>]/.test(handoff) &&
  handoff.includes('__GSE_OR_PROJECT__') &&
  handoff.includes('__PROJECT_OR_GSE__')

const checks = [
  check('HRH01', 'host runtime evidence handoff generator exists', exists('scripts/generate-host-runtime-evidence-handoff.mjs'), 'scripts/generate-host-runtime-evidence-handoff.mjs'),
  check('HRH02', 'generator uses runtime audit and compatibility matrix', generator.includes('audit-host-runtime-invocations.mjs') && generator.includes('references/compatibility.md'), 'generator inputs'),
  check('HRH03', 'generator produces a handoff file', generated?.status === 0 && generatedData?.status === 'written' && handoff.length > 0, generated?.stderr || out),
  check('HRH04', 'handoff covers core host families', hostFamilies.every((term) => handoff.includes(term)), hostFamilies.join(', ')),
  check('HRH04b', 'handoff limits host evidence plan to host matrix rows', generatedData?.summary?.hostFamilies === hostFamilies.length, `${generatedData?.summary?.hostFamilies ?? 'unknown'} generated host family row(s)`),
  check('HRH05', 'handoff includes executable record and verification commands', commands.every((term) => handoff.includes(term)), commands.join(', ')),
  check('HRH06', 'handoff preserves anti-overclaim boundaries', boundaries.every((term) => handoff.includes(term)), boundaries.join(', ')),
  check('HRH07', 'handoff reports current native and portable runtime evidence counts', handoff.includes('Native slash-command records:') && handoff.includes('Portable text-command records:'), 'current runtime evidence summary'),
  check('HRH08', 'skill routes users to host runtime evidence handoff', skill.includes('generate-host-runtime-evidence-handoff.mjs'), 'SKILL.md'),
  check('HRH09', 'consolidated validator includes host runtime handoff audit', validate.includes('audit-host-runtime-evidence-handoff.mjs'), 'scripts/validate-gse.mjs'),
  check('HRH10', 'release bundle includes host runtime evidence handoff', releaseGenerator.includes('host-runtime-evidence-handoff.md') && releaseAudit.includes('host-runtime-evidence-handoff.md'), 'release bundle generator and audit'),
  check('HRH11', 'compatibility matrix still distinguishes documented and verified host claims', compatibility.includes('Never upgrade a host capability from `documented` to `verified`') && compatibility.includes('Host Matrix'), 'references/compatibility.md'),
  check('HRH12', 'handoff command placeholders are shell-safe', handoffUsesShellSafeCommandPlaceholders, 'record and verification commands use __PLACEHOLDER__ style, not <placeholder> shell redirection syntax'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    hostRuntimeEvidenceHandoff: failed === 0 ? 'verified' : 'failed',
    nativeSlashCommandRecords: generatedData?.summary?.nativeSlashCommandRecords ?? 'unknown',
    portableTextCommandRecords: generatedData?.summary?.portableTextCommandRecords ?? 'unknown',
  },
  limits: [
    'This audit verifies handoff generation and claim boundaries only.',
    'It does not create real runtime evidence for Claude Code, Hermes/AION-style runtimes, WorkBuddy, or native slash-command execution.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Host Runtime Evidence Handoff Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Host runtime evidence handoff: ' + data.workflows.hostRuntimeEvidenceHandoff)
  lines.push('- Native slash-command records: ' + data.workflows.nativeSlashCommandRecords)
  lines.push('- Portable text-command records: ' + data.workflows.portableTextCommandRecords)
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
