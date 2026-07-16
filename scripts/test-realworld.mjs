#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const args = process.argv.slice(2)
function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const rootDir = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const target = path.resolve(readArg('--target', rootDir))
const jsonOnly = args.includes('--json')

function run(script, scriptArgs) {
  const started = Date.now()
  const result = spawnSync(process.execPath, [path.join(rootDir, 'scripts', script), ...scriptArgs], {
    cwd: rootDir,
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    script,
    command: [process.execPath, path.join(rootDir, 'scripts', script), ...scriptArgs].join(' '),
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    durationMs: Date.now() - started,
  }
}

const checks = [
  run('audit-target-project.mjs', ['--root', rootDir, '--target', target, '--json']),
  run('run-gse-command.mjs', ['--root', rootDir, '--target', target, '--command', '/gse continue', '--json', '--compact']),
  run('audit-close-gate.mjs', ['--target', target, '--json']),
]

const passed = checks.filter((item) => item.status === 0).length
const failed = checks.length - passed
const report = {
  root: rootDir,
  target,
  generatedAt: new Date().toISOString(),
  summary: {
    status: failed === 0 ? 'passed' : 'failed',
    passed,
    failed,
    total: checks.length,
    durationMs: checks.reduce((sum, item) => sum + item.durationMs, 0),
  },
  workflows: {
    realworldTargetAudit: checks[0].status === 0 ? 'verified' : 'failed',
    portableContinueSmoke: checks[1].status === 0 ? 'verified' : 'failed',
    closeGateReadOnly: checks[2].status === 0 ? 'verified' : 'failed',
  },
  checks,
  limits: [
    'Realworld test is read-only and requires a target project with GSE adoption or compatible local state.',
    'It is meant to validate a real project handoff path, not to claim native host slash-command support.',
  ],
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))

if (failed > 0) process.exit(1)
