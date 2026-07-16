#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const target = path.resolve(readArg('--target', root))
const profile = readArg('--profile', 'lite')
const jsonOnly = args.includes('--json')
const maxCommandMs = Number(readArg('--max-command-ms', '0'))

function scriptExists(name) {
  return fs.existsSync(path.join(root, 'scripts', name))
}

function run(script, commandArgs) {
  const startedMs = Date.now()
  const startedAt = new Date().toISOString()
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...commandArgs], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    ...(Number.isFinite(maxCommandMs) && maxCommandMs > 0 ? { timeout: maxCommandMs } : {}),
  })
  const durationMs = Date.now() - startedMs
  const stdout = (result.stdout ?? '').trim()
  let parsed = null
  try {
    parsed = JSON.parse(stdout)
  } catch {
    parsed = null
  }
  const failed = parsed?.summary?.failed
  const ok = (result.status ?? 1) === 0 || failed === 0
  return {
    script,
    command: [process.execPath, path.join(root, 'scripts', script), ...commandArgs].join(' '),
    status: result.status ?? 1,
    signal: result.signal ?? null,
    ok,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs,
    timedOut: result.error?.code === 'ETIMEDOUT',
    summary: parsed?.summary ?? null,
    workflows: parsed?.workflows ?? null,
    stdout,
    stderr: (result.stderr ?? '').trim(),
  }
}

function commandList(selectedProfile) {
  const common = [
    ['audit-agent-entrypoint.mjs', ['--root', root, '--json']],
        ['audit-project-capability-registry.mjs', ['--root', root, '--target', target, '--json']],
    ['audit-commands.mjs', ['--root', root, '--json']],
        ['audit-document-hygiene.mjs', ['--target', target, '--json']],
        ['audit-project-guards.mjs', ['--root', root, '--json']],
    ['backfill-evidence-levels.mjs', ['--root', target, '--json']],
    ['audit-evidence-levels.mjs', ['--root', root, '--target', target, '--json']],
    ['audit-evidence-review-queue.mjs', ['--root', root, '--target', target, '--json']],
    ['audit-ui-browser-evidence-policy.mjs', ['--root', root, '--target', target, '--json']],
    ['audit-role-dispatch-fallback.mjs', ['--root', root, '--target', target, '--json']],
    ['audit-close-gate-hardening.mjs', ['--root', root, '--json']],
    ['audit-state-repair.mjs', ['--root', root, '--target', target, '--json']],
    ['audit-learning-promotion.mjs', ['--root', root, '--target', target, '--json']],
    ['audit-learning-drift.mjs', ['--root', root, '--target', target, '--json']],
    ['audit-host-capabilities.mjs', ['--root', root, '--target', target, '--json']],
    ['audit-tool-fallback-policy.mjs', ['--root', root, '--target', target, '--json']],
    ['audit-stage-orchestrator.mjs', ['--root', root, '--json']],
    ['audit-goal-discovery.mjs', ['--root', root, '--json']],
                ['audit-session-sync.mjs', ['--root', root, '--json']],
        ['audit-learning-system.mjs', ['--root', root, '--json']],
  ]

  const targetChecks = target === root
    ? []
    : [['audit-target-project.mjs', ['--root', root, '--target', target, '--json']]]
  const closeChecks = [
    ['audit-close-gate.mjs', ['--target', target, '--json']],
  ]

  const gseFinalChecks = []

  const releaseChecks = [
    ['audit-npm-package-metadata.mjs', ['--root', root, '--json']],
    ['audit-npm-tarball-install.mjs', ['--root', root, '--json']],
    ['audit-signing.mjs', ['--root', root, '--json']],
    ['audit-release-bundle.mjs', ['--root', root, '--json']],
    ['audit-distribution.mjs', ['--root', root, '--json']],
    ['audit-remote-distribution.mjs', ['--root', root, '--json']],
    ['audit-public-acceptance-readiness.mjs', ['--root', root, '--json']],
    ['audit-final-readiness.mjs', ['--root', root, '--json']],
    ['audit-final-acceptance-packet.mjs', ['--root', root, '--json']],
    ['audit-owner-external-gate-kit.mjs', ['--root', root, '--json']],
  ]

  if (selectedProfile === 'lite') return [...common, ...gseFinalChecks]
  if (selectedProfile === 'standard') return [...common, ...targetChecks, ...gseFinalChecks]
  if (selectedProfile === 'enterprise') return [...common, ...targetChecks, ...gseFinalChecks, ...closeChecks, ['audit-owner-external-gate-kit.mjs', ['--root', root, '--json']]]
  if (selectedProfile === 'release') return [...common, ...targetChecks, ...gseFinalChecks, ...closeChecks, ...releaseChecks]
  throw new Error(`Unknown validation profile: ${selectedProfile}`)
}

const selectedCommands = commandList(profile)
const validationStartedMs = Date.now()
const results = selectedCommands.map(([script, commandArgs]) => run(script, commandArgs))
const passed = results.filter((item) => item.ok).length
const failed = results.length - passed
const durationMs = Date.now() - validationStartedMs
const slowestChecks = results
  .map((item) => ({
    script: item.script,
    status: item.ok ? 'passed' : 'failed',
    durationMs: item.durationMs,
    timedOut: item.timedOut,
  }))
  .sort((a, b) => b.durationMs - a.durationMs)
  .slice(0, 5)
const report = {
  root,
  target,
  profile,
  generatedAt: new Date().toISOString(),
  summary: {
    status: failed === 0 ? 'passed' : 'failed',
    passed,
    failed,
    total: results.length,
    durationMs,
    slowestChecks,
  },
  workflows: {
    validationProfile: failed === 0 ? 'verified' : 'failed',
    profile,
    performanceTelemetry: 'verified',
  },
  results,
  limits: [
    'Validation profiles select the lightest command set that proves the requested claim.',
    'Lite and standard profiles do not replace release, distribution, security, public acceptance, or host-native runtime evidence.',
    'Release profile may be slow and should be reserved for release/install/distribution claims.',
    'Use --max-command-ms for an explicit per-command timeout when the caller prefers fail-fast diagnostics over waiting for a heavy audit.',
  ],
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Validation Profile')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('Target: ' + data.target)
  lines.push('Profile: ' + data.profile)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Duration: ' + data.summary.durationMs + ' ms')
  if (data.summary.slowestChecks?.length) {
    lines.push('- Slowest checks: ' + data.summary.slowestChecks.map((item) => item.script + ' (' + item.durationMs + ' ms)').join(', '))
  }
  lines.push('')
  lines.push('## Commands')
  lines.push('')
  for (const item of data.results) {
    lines.push('- ' + (item.ok ? '[x]' : '[ ]') + ' `' + item.command + '`')
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
