#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const args = process.argv.slice(2)
const jsonOnly = args.includes('--json')
const rootArg = args.includes('--root') ? path.resolve(args[args.indexOf('--root') + 1]) : path.join(import.meta.dirname, '..')
const rootDir = path.resolve(rootArg)

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

const results = [
  run('audit-gse.mjs', ['--root', rootDir, '--json']),
  run('audit-commands.mjs', ['--root', rootDir, '--json']),
  run('audit-project.mjs', ['--root', rootDir, '--json']),
  run('audit-fixtures.mjs', ['--root', rootDir, '--json']),
]

const passed = results.filter((item) => item.status === 0).length
const failed = results.length - passed
const report = {
  root: rootDir,
  generatedAt: new Date().toISOString(),
  summary: {
    status: failed === 0 ? 'passed' : 'failed',
    passed,
    failed,
    total: results.length,
    durationMs: results.reduce((sum, item) => sum + item.durationMs, 0),
  },
  workflows: {
    smokeProfile: failed === 0 ? 'verified' : 'failed',
  },
  results,
  limits: [
    'Smoke profile is a fast developer inner-loop check, not a release gate.',
    'It proves structure, command semantics, project scaffold, and fixture adoption smoke only.',
  ],
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))

if (failed > 0) process.exit(1)
