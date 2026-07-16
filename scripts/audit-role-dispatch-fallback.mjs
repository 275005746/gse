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

const requiredRoles = ['Planner', 'Locator', 'Implementer', 'Verifier', 'Reviewer', 'Docs/Evidence', 'Release']
const allowedModes = new Set(['real-subagent', 'sequential-role', 'handoff-session'])
const allowedDelegation = new Set(['yes', 'no'])
const allowedToolStatuses = new Set(['verified', 'documented', 'unknown', 'unavailable'])

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function parseRoleTable(text) {
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) continue
    if (/^\|\s*-+/.test(trimmed)) continue
    if (/^\|\s*Role\s*\|/i.test(trimmed)) continue
    const cells = trimmed
      .slice(1, trimmed.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((cell) => cell.trim())
    if (cells.length < 8) continue
    rows.push({
      role: cells[0],
      mode: cells[1],
      realDelegationUsed: cells[2],
      toolStatus: cells[3],
      fallbackOutput: cells[4],
      evidence: cells[5],
      stopCondition: cells[6],
      writeAccess: cells[7],
    })
  }
  return rows
}

export function readRoleDispatchFallback(target) {
  const filePath = path.join(target, '.gse', 'agents', 'role-fallback-packets.md')
  const exists = fs.existsSync(filePath)
  const text = exists ? readText(filePath) : ''
  const packets = parseRoleTable(text)
  const roleSet = new Set(packets.map((packet) => packet.role))
  const missingRoles = requiredRoles.filter((role) => !roleSet.has(role))
  const invalidMode = packets.filter((packet) => !allowedModes.has(packet.mode))
  const invalidDelegation = packets.filter((packet) => !allowedDelegation.has(packet.realDelegationUsed))
  const invalidToolStatus = packets.filter((packet) => !allowedToolStatuses.has(packet.toolStatus))
  const missingEvidence = packets.filter((packet) => !packet.fallbackOutput || !packet.evidence || !packet.stopCondition || !packet.writeAccess)
  const fakeDelegationRisk = packets.filter((packet) => packet.realDelegationUsed === 'yes' && packet.toolStatus !== 'verified')
  const status = !exists
    ? 'warning'
    : missingRoles.length > 0 || invalidMode.length > 0 || invalidDelegation.length > 0 || invalidToolStatus.length > 0 || missingEvidence.length > 0 || fakeDelegationRisk.length > 0
      ? 'failed'
      : 'passed'
  return {
    path: '.gse/agents/role-fallback-packets.md',
    exists,
    status,
    packets,
    summary: {
      requiredRoles,
      total: packets.length,
      missingRoles,
      invalidMode: invalidMode.map((packet) => packet.role),
      invalidDelegation: invalidDelegation.map((packet) => packet.role),
      invalidToolStatus: invalidToolStatus.map((packet) => packet.role),
      missingEvidence: missingEvidence.map((packet) => packet.role),
      fakeDelegationRisk: fakeDelegationRisk.map((packet) => packet.role),
      sequentialFallbackRoles: packets.filter((packet) => packet.mode === 'sequential-role').map((packet) => packet.role),
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-role-fallback-'))
  const init = run('init-project.mjs', ['--target', dir, '--mode', 'standard', '--json'])
  return { dir, init }
}

function audit(target) {
  const resolvedTarget = path.resolve(target)
  const reference = readText(path.join(root, 'references', 'role-dispatch-fallback.md'))
  const agentRoles = readText(path.join(root, 'references', 'agent-roles.md'))
  const dispatchTemplate = readText(path.join(root, 'assets', 'templates', 'dispatch-packet.md'))
  const fallbackTemplate = readText(path.join(root, 'assets', 'templates', 'role-fallback-packet.md'))
  const initProject = readText(path.join(root, 'scripts', 'init-project.mjs'))
  const continuePacket = readText(path.join(root, 'scripts', 'generate-continue-packet.mjs'))
  const validationProfile = readText(path.join(root, 'scripts', 'run-validation-profile.mjs'))
  const validator = readText(path.join(root, 'scripts', 'validate-gse.mjs'))
  const fallback = readRoleDispatchFallback(resolvedTarget)
  const roleDocsCoverRequired = requiredRoles.every((role) => reference.includes(role)) && agentRoles.includes('Planner') && agentRoles.includes('Release')
  const templatesCoverEvidence =
    dispatchTemplate.includes('Real delegation used') &&
    dispatchTemplate.includes('Role output evidence') &&
    dispatchTemplate.includes('Claim boundary') &&
    fallbackTemplate.includes('Execution mode') &&
    fallbackTemplate.includes('Evidence level')
  const checks = [
    check('RDF01', 'role dispatch fallback reference defines required roles and claim boundary', roleDocsCoverRequired && reference.includes('real-subagent') && reference.includes('sequential-role') && reference.includes('handoff-session'), 'references/role-dispatch-fallback.md and references/agent-roles.md'),
    check('RDF02', 'dispatch templates expose auditable fallback fields', templatesCoverEvidence, 'assets/templates/dispatch-packet.md and assets/templates/role-fallback-packet.md'),
    check('RDF03', 'init-project scaffolds role fallback packets for standard or enterprise projects', initProject.includes('agents/role-fallback-packets.md') && initProject.includes('Planner') && initProject.includes('Release'), 'scripts/init-project.mjs'),
    check('RDF04', 'target role fallback packet is present or reported as warning', fallback.exists || fallback.status === 'warning', fallback.exists ? fallback.path : 'missing role fallback packet warning'),
    check('RDF05', 'target role fallback packets cover all required roles when present', !fallback.exists || fallback.summary.missingRoles.length === 0, fallback.summary.missingRoles.join(', ') || 'required roles present'),
    check('RDF06', 'target role fallback packets use valid mode/delegation/tool status vocabulary', !fallback.exists || (fallback.summary.invalidMode.length === 0 && fallback.summary.invalidDelegation.length === 0 && fallback.summary.invalidToolStatus.length === 0), 'mode/delegation/tool status vocabulary'),
    check('RDF07', 'target role fallback packets include output evidence and stop conditions', !fallback.exists || fallback.summary.missingEvidence.length === 0, fallback.summary.missingEvidence.join(', ') || 'fallback evidence fields present'),
    check('RDF08', 'target role fallback packets do not claim real delegation without verified tool status', !fallback.exists || fallback.summary.fakeDelegationRisk.length === 0, fallback.summary.fakeDelegationRisk.join(', ') || 'no fake delegation risk'),
    check('RDF09', 'continue packet surfaces role fallback readiness', continuePacket.includes('readRoleDispatchFallback') && continuePacket.includes('roleFallback'), 'scripts/generate-continue-packet.mjs'),
    check('RDF10', 'validation routes include role dispatch fallback audit', validationProfile.includes('audit-role-dispatch-fallback.mjs') && validator.includes('audit-role-dispatch-fallback.mjs'), 'validation profile and validate-gse'),
  ]
  const passed = checks.filter((item) => item.status === 'passed').length
  const failed = checks.length - passed
  return {
    target: resolvedTarget,
    generatedAt: new Date().toISOString(),
    summary: { status: failed === 0 ? fallback.status : 'failed', passed, failed, total: checks.length },
    workflows: {
      roleDispatchFallback: failed === 0 && fallback.status !== 'failed' ? 'verified' : 'failed',
      requiredRoles,
      packets: fallback.summary.total,
      sequentialFallbackRoles: fallback.summary.sequentialFallbackRoles.length,
    },
    roleFallback: fallback,
    checks,
    limits: [
      'Role fallback packets prove auditable role boundaries, not real subagent execution.',
      'Real subagent support still requires current host dispatch evidence.',
      'Missing role fallback packets are a warning for target projects until the scaffold is adopted.',
    ],
  }
}

function selfTestReport() {
  const fixture = createFixture()
  const fixtureReport = audit(fixture.dir)
  const missingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-role-fallback-missing-'))
  fs.mkdirSync(path.join(missingDir, '.gse'), { recursive: true })
  const missingReport = audit(missingDir)
  fs.rmSync(fixture.dir, { recursive: true, force: true })
  fs.rmSync(missingDir, { recursive: true, force: true })
  const checks = [
    check('RDFA01', 'init-project creates role fallback packet scaffold', fixture.init.status === 0 && fixtureReport.roleFallback.exists, 'scripts/init-project.mjs'),
    check('RDFA02', 'scaffold covers every required role', fixtureReport.roleFallback.summary.missingRoles.length === 0, fixtureReport.roleFallback.packets.map((packet) => packet.role).join(', ')),
    check('RDFA03', 'scaffold uses sequential fallback without fake real delegation', fixtureReport.roleFallback.summary.fakeDelegationRisk.length === 0 && fixtureReport.roleFallback.packets.every((packet) => packet.realDelegationUsed === 'no'), 'sequential fallback packets'),
    check('RDFA04', 'missing role fallback file is warning, not hard failure', missingReport.roleFallback.status === 'warning', 'missing fixture'),
    check('RDFA05', 'audit source is wired to continue packet and validation scripts', fixtureReport.checks.find((item) => item.id === 'RDF09')?.status === 'passed' && fixtureReport.checks.find((item) => item.id === 'RDF10')?.status === 'passed', 'continue/validation wiring'),
  ]
  const passed = checks.filter((item) => item.status === 'passed').length
  const failed = checks.length - passed
  return {
    root,
    generatedAt: new Date().toISOString(),
    summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
    workflows: {
      roleDispatchFallback: failed === 0 ? 'verified' : 'failed',
      initProjectRoleFallbackScaffold: failed === 0 ? 'verified' : 'failed',
    },
    fixture: {
      scaffoldStatus: fixtureReport.roleFallback.status,
      missingStatus: missingReport.roleFallback.status,
      roles: fixtureReport.roleFallback.packets.map((packet) => packet.role),
    },
    checks,
    limits: [
      'This self-test verifies scaffold and audit mechanics.',
      'It does not prove a real host spawned subagents.',
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
