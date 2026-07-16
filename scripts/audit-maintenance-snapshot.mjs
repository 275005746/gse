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
  const stdout = (result.stdout ?? '').trim()
  let data = null
  try {
    data = JSON.parse(stdout)
  } catch {
    data = null
  }
  return {
    command: [process.execPath, path.join(root, 'scripts', script), ...commandArgs].join(' '),
    status: result.status ?? 1,
    ok: (result.status ?? 1) === 0 || data?.summary?.failed === 0,
    data,
    stderr: (result.stderr ?? '').trim(),
  }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const skill = read('SKILL.md')
const maintenanceRef = read('references/maintenance-cadence.md')
const commandRunner = read('scripts/run-gse-command.mjs')
const validationProfile = read('scripts/run-validation-profile.mjs')
const validator = read('scripts/validate-gse.mjs')
const snapshotScript = read('scripts/generate-maintenance-snapshot.mjs')
const canonicalSnapshotPath = path.join(root, '.gse', 'maintenance', 'latest-maintenance-snapshot.json')
let canonicalSnapshot = null
try {
  canonicalSnapshot = fs.existsSync(canonicalSnapshotPath)
    ? JSON.parse(fs.readFileSync(canonicalSnapshotPath, 'utf8').replace(/^\uFEFF/, ''))
    : null
} catch {
  canonicalSnapshot = null
}

const dryRun = run('generate-maintenance-snapshot.mjs', ['--root', root, '--target', root, '--skip-release-bundle', '--json'])
const packageSmokeRun = run('generate-maintenance-snapshot.mjs', ['--root', root, '--target', root, '--package-smoke', '--skip-release-bundle', '--json'])
const tempOut = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gse-maintenance-snapshot-')), 'snapshot.json')
const writeRun = run('generate-maintenance-snapshot.mjs', ['--root', root, '--target', root, '--skip-release-bundle', '--out', tempOut, '--execute', '--json'])
const writtenSnapshot = fs.existsSync(tempOut)
  ? JSON.parse(fs.readFileSync(tempOut, 'utf8').replace(/^\uFEFF/, ''))
  : null

function runCanonicalFailureFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-maintenance-canonical-failure-'))
  const fixtureScripts = path.join(fixtureRoot, 'scripts')
  const fixtureMaintenance = path.join(fixtureRoot, '.gse', 'maintenance')
  fs.mkdirSync(fixtureScripts, { recursive: true })
  fs.mkdirSync(fixtureMaintenance, { recursive: true })
  fs.copyFileSync(path.join(root, 'scripts', 'generate-maintenance-snapshot.mjs'), path.join(fixtureScripts, 'generate-maintenance-snapshot.mjs'))
  fs.writeFileSync(path.join(fixtureScripts, 'audit-maintenance-cadence.mjs'), [
    '#!/usr/bin/env node',
    'console.log(JSON.stringify({ summary: { status: "failed", passed: 0, failed: 1, total: 1 } }))',
    'process.exit(1)',
    '',
  ].join('\n'), 'utf8')
  const canonicalPath = path.join(fixtureMaintenance, 'latest-maintenance-snapshot.json')
  const failedPath = path.join(fixtureMaintenance, 'latest-maintenance-snapshot.failed.json')
  const previousCanonical = {
    schemaVersion: 1,
    summary: { status: 'passed' },
    fixtureMarker: 'previous-passing-snapshot',
  }
  fs.writeFileSync(canonicalPath, JSON.stringify(previousCanonical, null, 2) + '\n', 'utf8')
  const result = spawnSync(process.execPath, [
    path.join(fixtureScripts, 'generate-maintenance-snapshot.mjs'),
    '--root',
    fixtureRoot,
    '--target',
    fixtureRoot,
    '--execute',
    '--json',
  ], {
    cwd: fixtureRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
  let canonicalAfter = null
  let failedSnapshot = null
  let stdout = null
  try {
    canonicalAfter = JSON.parse(fs.readFileSync(canonicalPath, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    canonicalAfter = null
  }
  try {
    failedSnapshot = JSON.parse(fs.readFileSync(failedPath, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    failedSnapshot = null
  }
  try {
    stdout = JSON.parse((result.stdout ?? '').trim())
  } catch {
    stdout = null
  }
  return {
    command: [process.execPath, path.join(fixtureScripts, 'generate-maintenance-snapshot.mjs'), '--root', fixtureRoot, '--target', fixtureRoot, '--execute', '--json'].join(' '),
    status: result.status ?? 1,
    canonicalPreserved: canonicalAfter?.fixtureMarker === previousCanonical.fixtureMarker && canonicalAfter?.summary?.status === 'passed',
    failedWritten: failedSnapshot?.summary?.status === 'failed' && failedSnapshot?.canonicalWritePolicy === 'failed-canonical-write-isolated',
    stdoutPolicy: stdout?.canonicalWritePolicy === 'failed-canonical-write-isolated',
    stderr: (result.stderr ?? '').trim(),
  }
}

const canonicalFailureFixture = runCanonicalFailureFixture()

const requiredIds = ['MS01', 'MS02', 'MS03', 'MS04', 'MS05', 'MS06', 'MS07', 'MS08', 'MS09']
const checks = [
  check('MSS01', 'maintenance snapshot generator exists', exists('scripts/generate-maintenance-snapshot.mjs'), 'scripts/generate-maintenance-snapshot.mjs'),
  check('MSS02', 'snapshot generator runs read-only dry-run', dryRun.ok && dryRun.data?.summary?.status === 'passed', dryRun.command, dryRun.stderr),
  check('MSS03', 'snapshot covers recurring final-form check set', requiredIds.every((id) => dryRun.data?.results?.some((item) => item.id === id)), requiredIds.join(', ')),
  check('MSS04', 'snapshot write is execute-gated and writes JSON/Markdown', writeRun.ok && fs.existsSync(tempOut) && fs.existsSync(tempOut.replace(/\.json$/i, '.md')), tempOut),
  check('MSS05', 'written snapshot has machine-readable result summaries', writtenSnapshot?.results?.every((item) => item.id && item.area && item.status && item.command), 'snapshot results'),
  check('MSS06', 'SKILL routes maintenance snapshot helper', skill.includes('generate-maintenance-snapshot.mjs') && skill.includes('audit-maintenance-snapshot.mjs'), 'SKILL.md'),
  check('MSS07', 'maintenance reference documents snapshot command', maintenanceRef.includes('generate-maintenance-snapshot.mjs') && maintenanceRef.includes('latest-maintenance-snapshot.json'), 'references/maintenance-cadence.md'),
  check('MSS08', 'portable /gse maintenance route uses snapshot generator', commandRunner.includes('generate-maintenance-snapshot.mjs') && commandRunner.includes('snapshot'), 'scripts/run-gse-command.mjs'),
  check('MSS09', 'validation profile includes maintenance snapshot audit', validationProfile.includes('audit-maintenance-snapshot.mjs'), 'scripts/run-validation-profile.mjs'),
  check('MSS10', 'consolidated validator includes maintenance snapshot audit', validator.includes('audit-maintenance-snapshot.mjs'), 'scripts/validate-gse.mjs'),
  check('MSS11', 'canonical snapshot is present when recorded', canonicalSnapshot ? canonicalSnapshot.summary?.status === 'passed' : true, canonicalSnapshotPath),
  check('MSS12', 'snapshot preserves host-native slash-command boundary', snapshotScript.includes('does not prove native host slash-command support'), 'scripts/generate-maintenance-snapshot.mjs'),
  check('MSS13', 'snapshot supports installed package smoke mode', packageSmokeRun.ok && packageSmokeRun.data?.summary?.packageSmoke === true && !packageSmokeRun.data?.results?.some((item) => item.id === 'MS02'), packageSmokeRun.command, packageSmokeRun.stderr),
  check('MSS14', 'failed canonical maintenance snapshot writes are isolated from the last passing latest snapshot', canonicalFailureFixture.status !== 0 && canonicalFailureFixture.canonicalPreserved && canonicalFailureFixture.failedWritten && canonicalFailureFixture.stdoutPolicy, canonicalFailureFixture.command, canonicalFailureFixture.stderr),
  check('MSS15', 'snapshot documents canonical failure isolation policy', snapshotScript.includes('failed checks are written to latest-maintenance-snapshot.failed.json'), 'scripts/generate-maintenance-snapshot.mjs'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    maintenanceSnapshot: failed === 0 ? 'verified' : 'failed',
    dryRunStatus: dryRun.data?.summary?.status ?? 'unknown',
    writeStatus: writeRun.data?.summary?.status ?? 'unknown',
  },
  limits: [
    'This audit verifies snapshot mechanics and routing.',
    'It does not prove a native host slash command or replace installed-root sync evidence.',
  ],
  checks,
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))

if (failed > 0) process.exit(1)
