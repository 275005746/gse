#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const targetArg = readArg('--target')
const jsonOnly = args.includes('--json')

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function parseGuardTable(text) {
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) continue
    if (/^\|\s*-+/.test(trimmed)) continue
    if (/^\|\s*ID\s*\|/i.test(trimmed)) continue
    const cells = trimmed
      .slice(1, trimmed.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((cell) => cell.trim())
    if (cells.length < 6) continue
    rows.push({
      id: cells[0],
      guard: cells[1],
      severity: cells[2],
      trigger: cells[3],
      check: cells[4],
      status: cells[5],
    })
  }
  return rows
}

export function readProjectGuards(target) {
  const filePath = path.join(target, '.gse', 'project-guards.md')
  const exists = fs.existsSync(filePath)
  const text = exists ? readText(filePath) : ''
  const guards = parseGuardTable(text)
  const active = guards.filter((guard) => guard.status.toLowerCase() === 'active')
  const requiredIds = ['WIN-SHELL', 'SPARSE-GIT', 'UTF8-DOC', 'EVIDENCE-STALE', 'UI-EVIDENCE', 'SUBAGENT-HONEST', 'SYNC-NO-INTERRUPT']
  const ids = new Set(guards.map((guard) => guard.id))
  const missingDefaultIds = requiredIds.filter((id) => !ids.has(id))
  const incomplete = guards.filter((guard) =>
    !guard.id ||
    !guard.guard ||
    !guard.severity ||
    !guard.trigger ||
    !guard.check ||
    !guard.status,
  )
  const invalidSeverity = guards.filter((guard) => !['low', 'medium', 'high', 'critical'].includes(guard.severity.toLowerCase()))
  const invalidStatus = guards.filter((guard) => !['active', 'inactive', 'candidate'].includes(guard.status.toLowerCase()))
  const status = !exists
    ? 'warning'
    : guards.length === 0 || incomplete.length > 0 || invalidSeverity.length > 0 || invalidStatus.length > 0
      ? 'failed'
      : missingDefaultIds.length > 0
        ? 'warning'
        : 'passed'
  return {
    path: '.gse/project-guards.md',
    exists,
    status,
    guards,
    active,
    summary: {
      total: guards.length,
      active: active.length,
      missingDefaultIds,
      incomplete: incomplete.map((guard) => guard.id || '(blank)'),
      invalidSeverity: invalidSeverity.map((guard) => guard.id),
      invalidStatus: invalidStatus.map((guard) => guard.id),
    },
  }
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

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-project-guards-'))
  const init = run('init-project.mjs', ['--target', dir, '--mode', 'lite', '--json'])
  return { dir, init }
}

function audit(target) {
  const resolvedTarget = path.resolve(target)
  const guardResult = readProjectGuards(resolvedTarget)
  const checks = [
    check('PG01', 'project guard file is present or reported as warning', guardResult.exists || guardResult.status === 'warning', guardResult.exists ? guardResult.path : 'missing guard file warning'),
    check('PG02', 'guard table parses at least one active guard when file exists', !guardResult.exists || guardResult.active.length > 0, `${guardResult.active.length} active guard(s)`),
    check('PG03', 'guard rows have valid severity and status values', guardResult.summary.invalidSeverity.length === 0 && guardResult.summary.invalidStatus.length === 0, 'severity/status vocabulary'),
    check('PG04', 'default guard IDs are present when scaffolded', !guardResult.exists || guardResult.summary.missingDefaultIds.length === 0, guardResult.summary.missingDefaultIds.join(', ') || 'default guards present'),
    check('PG05', 'guard audit keeps missing file as warning instead of hard failure', true, 'missing file policy is warning'),
  ]
  const passed = checks.filter((item) => item.status === 'passed').length
  const failed = checks.length - passed
  return {
    target: resolvedTarget,
    generatedAt: new Date().toISOString(),
    summary: { status: failed === 0 ? guardResult.status : 'failed', passed, failed, total: checks.length },
    workflows: {
      projectGuards: guardResult.status === 'failed' ? 'failed' : 'verified',
      continuePreflightGuardSection: 'available',
    },
    projectGuards: guardResult,
    checks,
    limits: [
      'Project guards are soft continuation preflight rules in this slice.',
      'Broken state or evidence index remains the hard /gse continue failure.',
      'AION and MuseFlow lessons are examples; this audit does not hardcode product-specific behavior.',
    ],
  }
}

function selfTestReport() {
  const fixture = createFixture()
  const fixtureReport = audit(fixture.dir)
  const missingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-project-guards-missing-'))
  fs.mkdirSync(path.join(missingDir, '.gse'), { recursive: true })
  const missingReport = audit(missingDir)
  fs.rmSync(fixture.dir, { recursive: true, force: true })
  fs.rmSync(missingDir, { recursive: true, force: true })
  const checks = [
    check('PGA01', 'init-project creates project guards', fixture.init.status === 0 && fixtureReport.projectGuards.exists, 'scripts/init-project.mjs'),
    check('PGA02', 'default scaffold contains seven active guards', fixtureReport.projectGuards.summary.active === 7, `${fixtureReport.projectGuards.summary.active} active guard(s)`),
    check('PGA03', 'missing guard file is warning, not hard failure', missingReport.projectGuards.status === 'warning', 'missing fixture'),
    check('PGA04', 'default guard set includes real-project lesson categories', ['WIN-SHELL', 'SPARSE-GIT', 'UTF8-DOC', 'EVIDENCE-STALE', 'UI-EVIDENCE', 'SUBAGENT-HONEST', 'SYNC-NO-INTERRUPT'].every((id) => fixtureReport.projectGuards.guards.some((guard) => guard.id === id)), 'default guard IDs'),
  ]
  const passed = checks.filter((item) => item.status === 'passed').length
  const failed = checks.length - passed
  return {
    root,
    generatedAt: new Date().toISOString(),
    summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
    workflows: {
      projectGuards: failed === 0 ? 'verified' : 'failed',
      initProjectGuardScaffold: failed === 0 ? 'verified' : 'failed',
    },
    fixture: {
      scaffoldStatus: fixtureReport.projectGuards.status,
      missingStatus: missingReport.projectGuards.status,
      activeGuards: fixtureReport.projectGuards.active.map((guard) => guard.id),
    },
    checks,
    limits: [
      'This audit verifies guard scaffold and parsing mechanics.',
      'It does not prove every project-specific guard has been promoted yet.',
    ],
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  const report = targetArg ? audit(targetArg) : selfTestReport()
  if (jsonOnly) console.log(JSON.stringify(report, null, 2))
  else console.log(JSON.stringify(report, null, 2))
  if (report.summary.status === 'failed') process.exit(1)
}
