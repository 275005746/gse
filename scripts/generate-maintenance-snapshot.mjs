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
const installedRoot = readArg('--installed-root', null)
const execute = args.includes('--execute')
const jsonOnly = args.includes('--json')
const skipReleaseBundle = args.includes('--skip-release-bundle')
const packageSmoke = args.includes('--package-smoke')
const canonicalOut = path.join(root, '.gse', 'maintenance', 'latest-maintenance-snapshot.json')
const out = path.resolve(readArg('--out', canonicalOut))
const isCanonicalOut = out === path.resolve(canonicalOut)

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function runNode(script, commandArgs, options = {}) {
  const command = [process.execPath, path.join(root, 'scripts', script), ...commandArgs]
  const result = spawnSync(command[0], command.slice(1), {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  })
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
    command: command.join(' '),
    status: result.status ?? 1,
    ok,
    summary: parsed?.summary ?? null,
    workflows: parsed?.workflows ?? null,
    stdout,
    stderr: (result.stderr ?? '').trim(),
  }
}

function maintenanceChecks() {
  const checks = [
    {
      id: 'MS01',
      area: 'maintenance cadence',
      script: 'audit-maintenance-cadence.mjs',
      args: ['--root', root, '--json'],
    },
    {
      id: 'MS02',
      area: 'final-form roadmap',
      script: 'audit-final-form-roadmap.mjs',
      args: ['--root', root, '--json'],
    },
    {
      id: 'MS03',
      area: 'state freshness',
      script: 'audit-state-freshness.mjs',
      args: ['--root', root, '--json'],
    },
    {
      id: 'MS04',
      area: 'continue preflight',
      script: 'run-gse-command.mjs',
      args: ['--root', root, '--target', target, '--command', '/gse continue', '--json', '--compact'],
    },
    {
      id: 'MS05',
      area: 'evidence levels',
      script: 'audit-evidence-levels.mjs',
      args: ['--root', root, '--target', target, '--json'],
    },
    {
      id: 'MS06',
      area: 'learning drift',
      script: 'audit-learning-drift.mjs',
      args: ['--root', root, '--target', target, '--json'],
    },
    {
      id: 'MS07',
      area: 'public acceptance',
      script: 'audit-public-acceptance-readiness.mjs',
      args: ['--root', root, '--json'],
    },
    {
      id: 'MS08',
      area: 'installed sync',
      script: 'audit-installed-sync.mjs',
      args: installedRoot
        ? ['--root', root, '--installed-root', path.resolve(installedRoot), '--json']
        : ['--root', root, '--json'],
    },
    {
      id: 'MS09',
      area: 'session sync',
      script: 'audit-session-sync.mjs',
      args: ['--root', root, '--json'],
    },
  ]
  if (!skipReleaseBundle) {
    checks.push({
      id: 'MS10',
      area: 'release bundle freshness',
      script: 'audit-release-bundle.mjs',
      args: ['--root', root, '--json'],
    })
  }
  return checks.filter((item) => exists(path.join('scripts', item.script)))
}

  const checks = packageSmoke
    ? maintenanceChecks().filter((item) => item.id !== 'MS02')
    : maintenanceChecks()
  const results = checks.map((item) => {
  const run = runNode(item.script, item.args)
  return {
    id: item.id,
    area: item.area,
    status: run.ok ? 'passed' : 'failed',
    command: run.command,
    summary: run.summary,
    workflows: run.workflows,
    stderr: run.stderr,
  }
})

const passed = results.filter((item) => item.status === 'passed').length
const failed = results.length - passed
const installedSync = results.find((item) => item.id === 'MS08')
const releaseBundle = results.find((item) => item.id === 'MS10')
const report = {
  schemaVersion: 1,
  root,
  target,
  installedRoot: installedRoot ? path.resolve(installedRoot) : null,
  generatedAt: new Date().toISOString(),
  execute,
  out,
  summary: {
    status: failed === 0 ? 'passed' : 'failed',
    passed,
    failed,
    total: results.length,
    installedSyncMode: installedRoot ? 'installed-root' : 'package-only',
    releaseBundleChecked: Boolean(releaseBundle),
    packageSmoke,
  },
  workflows: {
    maintenanceSnapshot: failed === 0 ? 'verified' : 'failed',
    installedSync: installedSync?.workflows?.installedSync ?? (installedRoot ? 'unknown' : 'package-only'),
    releaseBundleFreshness: releaseBundle?.workflows?.releaseBundle ?? (skipReleaseBundle ? 'skipped' : 'unknown'),
  },
  results,
  limits: [
    'This snapshot proves recurring maintenance checks ran at a point in time.',
    'When writing the canonical latest-maintenance-snapshot.json, failed checks are written to latest-maintenance-snapshot.failed.json and do not overwrite the last passing snapshot.',
    packageSmoke ? 'Package smoke mode skips source-worktree final-form roadmap freshness because package installs intentionally omit full local evidence history.' : '',
    'It does not prove native host slash-command support.',
    'Without --installed-root, installed sync is package-only and does not prove an installed copy is fresh.',
  ].filter(Boolean),
}

function writeSnapshotFiles(targetPath, snapshot) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8')
  const mdPath = targetPath.replace(/\.json$/i, '.md')
  fs.writeFileSync(mdPath, [
    '# GSE Maintenance Snapshot',
    '',
    'Generated: ' + snapshot.generatedAt,
    'Root: ' + snapshot.root,
    'Target: ' + snapshot.target,
    'Status: ' + snapshot.summary.status,
    '',
    '## Checks',
    '',
    ...snapshot.results.map((item) => `- ${item.status === 'passed' ? '[x]' : '[ ]'} ${item.id} ${item.area}: ${item.summary?.status ?? item.status}`),
    '',
    '## Limits',
    '',
    ...snapshot.limits.map((item) => '- ' + item),
    '',
  ].join('\n'), 'utf8')
}

if (execute) {
  const targetOut = failed > 0 && isCanonicalOut
    ? out.replace(/\.json$/i, '.failed.json')
    : out
  report.writtenTo = targetOut
  report.canonicalWritePolicy = failed > 0 && isCanonicalOut
    ? 'failed-canonical-write-isolated'
    : 'written'
  writeSnapshotFiles(targetOut, report)
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))

if (failed > 0) process.exit(1)
