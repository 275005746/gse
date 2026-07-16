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
const recordPath = readArg('--record')
const jsonOnly = args.includes('--json')

function read(relativePathOrFullPath) {
  const fullPath = path.isAbsolute(relativePathOrFullPath) ? relativePathOrFullPath : path.join(root, relativePathOrFullPath)
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function run(script, commandArgs) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...commandArgs], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    command: [process.execPath, path.join(root, 'scripts', script), ...commandArgs].join(' '),
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

function parseJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const target = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-host-ui-'))
fs.mkdirSync(target, { recursive: true })
fs.writeFileSync(path.join(target, 'AGENTS.md'), '# Host UI Fixture\n', 'utf8')
const initRun = run('init-project.mjs', ['--target', target, '--mode', 'enterprise', '--json'])
const adapterRun = run('generate-command-adapter.mjs', ['--target', target, '--host', 'all', '--json'])
const commandRun = run('run-gse-command.mjs', ['--target', target, '--command', '/gse help', '--json'])
const adapterData = parseJson(adapterRun.stdout)
const commandData = parseJson(commandRun.stdout)
const claudeCommand = read(path.join(target, '.claude', 'commands', 'gse.md'))
const codexPointer = read(path.join(target, '.codex', 'gse-command.md'))
const record = recordPath ? read(path.resolve(recordPath)) : ''
const recordHasEvidence =
  Boolean(record) &&
  record.includes('## Host') &&
  record.includes('## Command') &&
  record.includes('## Result') &&
  record.includes('## Evidence') &&
  /Status:\s*(verified|accepted)/i.test(record)

const checks = [
  check('HUI01', 'host UI invocation record template exists', exists('assets/templates/host-ui-invocation-record.md'), 'assets/templates/host-ui-invocation-record.md'),
  check('HUI02', 'portable runner can execute command semantics', commandRun.status === 0 && commandData?.route?.route === 'references/commands.md', '/gse help through run-gse-command.mjs'),
  check('HUI03', 'Claude command adapter is generated at current native path', adapterRun.status === 0 && fs.existsSync(path.join(target, '.claude', 'commands', 'gse.md')) && claudeCommand.includes('Portable execution path'), '.claude/commands/gse.md'),
  check('HUI04', 'Codex command pointer is generated without native claim', adapterRun.status === 0 && fs.existsSync(path.join(target, '.codex', 'gse-command.md')) && codexPointer.includes('not proof of a native project-level /gse slash-command mechanism'), '.codex/gse-command.md'),
  check('HUI05', 'adapter generator labels native support honestly', adapterData?.results?.some((item) => item.host === 'claude' && item.nativeSlashCommand === true) && adapterData?.results?.some((item) => item.host === 'codex' && item.nativeSlashCommand === false), 'generate-command-adapter.mjs result metadata'),
  check('HUI06', 'commands reference requires host runtime evidence', read('references/commands.md').includes('host-specific smoke') && read('references/commands.md').includes('Do not claim native slash-command support unless the current host exposes it and it was verified.'), 'references/commands.md'),
  check('HUI07', 'optional real host invocation record is valid when supplied', recordPath ? recordHasEvidence : true, recordPath ? recordPath : 'no --record supplied; template/readiness only'),
  check('HUI08', 'validator includes host UI invocation audit', read('scripts/validate-gse.mjs').includes('audit-host-ui-invocation.mjs'), 'scripts/validate-gse.mjs'),
]

fs.rmSync(target, { recursive: true, force: true })

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    hostUiInvocationReadiness: failed === 0 ? 'verified' : 'failed',
    realHostUiInvocation: recordHasEvidence ? 'verified-by-record' : 'not-verified',
  },
  acceptedBy: recordHasEvidence ? 'host invocation record' : 'not accepted; no real host UI invocation record was supplied',
  limits: [
    'This audit verifies portable command execution, generated host pointers, and the evidence format for real host UI invocation.',
    'Without --record, it does not prove a real Codex, Claude Code, Hermes, WorkBuddy, or other UI invoked the command.',
    'Generated adapters are not runtime proof by themselves.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Host UI Invocation Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Host UI invocation readiness: ' + data.workflows.hostUiInvocationReadiness)
  lines.push('- Real host UI invocation: ' + data.workflows.realHostUiInvocation)
  lines.push('- Accepted by: ' + data.acceptedBy)
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
