#!/usr/bin/env node
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

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

function runAsync(command, commandArgs) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('close', (status) => {
      resolve({
        status: status ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        command: [command, ...commandArgs].join(' '),
      })
    })
  })
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

function startServer() {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('gse fixture evidence\n')
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve({ server, url: `http://127.0.0.1:${address.port}` })
    })
  })
}

const probeScript = path.join(root, 'scripts', 'probe-public-external-gates.mjs')
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-public-external-probe-'))
const hostEvidence = path.join(fixture, 'host-evidence.txt')
fs.writeFileSync(hostEvidence, 'fixture host transcript\n', 'utf8')
const { server, url } = await startServer()

let positive
let negativePlaceholder
let negativeMissingFile
let waiting
try {
  positive = await runAsync(process.execPath, [
    probeScript,
    '--root', root,
    '--allow-local-fixture',
    '--timeout-ms', '3000',
    '--public-repo-url', `${url}/repo`,
    '--security-contact-url', `${url}/security`,
    '--public-ci-run-url', `${url}/ci`,
    '--registry-package-url', `${url}/package`,
    '--marketplace-url', `${url}/marketplace`,
    '--native-host-evidence', hostEvidence,
    '--other-host-evidence', `${url}/host`,
    '--json',
  ])
  negativePlaceholder = run(process.execPath, [
    probeScript,
    '--root', root,
    '--public-repo-url', 'https://github.com/example/gse',
    '--registry-package-url', 'https://example.com/gse',
    '--json',
  ])
  negativeMissingFile = run(process.execPath, [
    probeScript,
    '--root', root,
    '--native-host-evidence', path.join(fixture, 'missing.txt'),
    '--json',
  ])
  waiting = run(process.execPath, [probeScript, '--root', root, '--json'])
} finally {
  await new Promise((resolve) => server.close(resolve))
  fs.rmSync(fixture, { recursive: true, force: true })
}

const positiveData = parseJson(positive.stdout)
const negativePlaceholderData = parseJson(negativePlaceholder.stdout)
const negativeMissingFileData = parseJson(negativeMissingFile.stdout)
const waitingData = parseJson(waiting.stdout)
const skill = read('SKILL.md')
const validate = read('scripts/validate-gse.mjs')
const completion = read('scripts/audit-completion-readiness.mjs')
const ownerKitGenerator = read('scripts/generate-owner-external-gate-kit.mjs')
const verificationCommands = read('.gse/acceptance/owner-external-gate-kit/verification-commands.md')

const checks = [
  check('PEG01', 'public external gate probe exists', exists('scripts/probe-public-external-gates.mjs'), 'scripts/probe-public-external-gates.mjs'),
  check('PEG02', 'probe accepts reachable evidence locations in fixture mode', positive.status === 0 && positiveData?.status === 'ready' && positiveData?.summary?.checked === 7 && positiveData?.summary?.failed === 0, positive.command),
  check('PEG03', 'probe rejects placeholder and example public evidence', negativePlaceholder.status !== 0 && negativePlaceholderData?.status === 'failed' && negativePlaceholderData?.probes?.some((item) => item.errors?.some((error) => error.includes('not a placeholder'))), negativePlaceholder.command),
  check('PEG04', 'probe rejects missing host evidence files', negativeMissingFile.status !== 0 && negativeMissingFileData?.status === 'failed' && negativeMissingFileData?.probes?.some((item) => item.errors?.some((error) => error.includes('existing evidence file'))), negativeMissingFile.command),
  check('PEG05', 'probe can run without evidence inputs as a waiting diagnostic', waiting.status === 0 && waitingData?.status === 'waiting-for-input' && waitingData?.summary?.checked === 0, waiting.command),
  check('PEG06', 'probe keeps acceptance boundary explicit', positiveData?.limits?.some((item) => item.includes('does not publish GSE')) && positiveData?.limits?.some((item) => item.includes('record script')), 'probe report limits'),
  check('PEG07', 'GSE routing and owner kit mention the portable probe command', skill.includes('probe-public-external-gates.mjs') && ownerKitGenerator.includes('run-gse-command.mjs') && ownerKitGenerator.includes('/gse probe') && verificationCommands.includes('run-gse-command.mjs') && verificationCommands.includes('/gse probe') && !verificationCommands.includes('node scripts/probe-public-external-gates.mjs'), 'SKILL.md, generate-owner-external-gate-kit.mjs, owner kit verification commands'),
  check('PEG08', 'validator and completion readiness include the probe audit', validate.includes('audit-public-external-gate-probe.mjs') && completion.includes('audit-public-external-gate-probe.mjs'), 'scripts/validate-gse.mjs, scripts/audit-completion-readiness.mjs'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    publicExternalGateProbe: failed === 0 ? 'verified' : 'failed',
  },
  limits: [
    'This audit verifies the probe mechanics with fixture evidence.',
    'It does not create real public owner/external evidence or mark final readiness accepted.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Public External Gate Probe Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Public external gate probe: ' + data.workflows.publicExternalGateProbe)
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
