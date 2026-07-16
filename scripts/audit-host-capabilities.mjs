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

const requiredCapabilities = ['native-slash-command', 'browser', 'mcp', 'lsp', 'subagent', 'ci']
const allowedStatuses = new Set(['verified', 'documented', 'unknown', 'unavailable', 'external-required'])

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function parseCapabilityTable(text) {
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) continue
    if (/^\|\s*-+/.test(trimmed)) continue
    if (/^\|\s*Capability\s*\|/i.test(trimmed)) continue
    const cells = trimmed
      .slice(1, trimmed.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((cell) => cell.trim())
    if (cells.length < 6) continue
    rows.push({
      capability: cells[0].toLowerCase(),
      hostOrTool: cells[1],
      status: cells[2],
      evidence: cells[3],
      claimBoundary: cells[4],
      lastChecked: cells[5],
    })
  }
  return rows
}

function hasConcreteEvidence(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return Boolean(normalized && !['-', 'n/a', 'none', 'unknown', 'tbd', 'todo'].includes(normalized))
}

export function readHostCapabilities(target) {
  const filePath = path.join(target, '.gse', 'host-capabilities.md')
  const exists = fs.existsSync(filePath)
  const text = exists ? readText(filePath) : ''
  const capabilities = parseCapabilityTable(text)
  const byCapability = new Map(capabilities.map((item) => [item.capability, item]))
  const missingRequired = requiredCapabilities.filter((capability) => !byCapability.has(capability))
  const invalidStatus = capabilities.filter((item) => !allowedStatuses.has(item.status))
  const missingEvidenceForVerified = capabilities.filter((item) => item.status === 'verified' && !hasConcreteEvidence(item.evidence))
  const nativeSlash = byCapability.get('native-slash-command') ?? null
  const nativeSlashOverclaim =
    nativeSlash?.status === 'verified' &&
    (
      !/native/i.test(nativeSlash.evidence) ||
      /portable|text-command|run-gse-command|generate-continue-packet/i.test(nativeSlash.evidence)
    )
  const documentedWithoutBoundary = capabilities.filter((item) =>
    ['documented', 'external-required'].includes(item.status) && !hasConcreteEvidence(item.claimBoundary),
  )
  const status = !exists
    ? 'warning'
    : capabilities.length === 0 ||
      missingRequired.length > 0 ||
      invalidStatus.length > 0 ||
      missingEvidenceForVerified.length > 0 ||
      nativeSlashOverclaim ||
      documentedWithoutBoundary.length > 0
      ? 'failed'
      : 'passed'
  return {
    path: '.gse/host-capabilities.md',
    exists,
    status,
    capabilities,
    summary: {
      requiredCapabilities,
      total: capabilities.length,
      verified: capabilities.filter((item) => item.status === 'verified').map((item) => item.capability),
      documented: capabilities.filter((item) => item.status === 'documented').map((item) => item.capability),
      unknown: capabilities.filter((item) => item.status === 'unknown').map((item) => item.capability),
      unavailable: capabilities.filter((item) => item.status === 'unavailable').map((item) => item.capability),
      externalRequired: capabilities.filter((item) => item.status === 'external-required').map((item) => item.capability),
      missingRequired,
      invalidStatus: invalidStatus.map((item) => item.capability),
      missingEvidenceForVerified: missingEvidenceForVerified.map((item) => item.capability),
      nativeSlashOverclaim: nativeSlashOverclaim ? ['native-slash-command'] : [],
      documentedWithoutBoundary: documentedWithoutBoundary.map((item) => item.capability),
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

function createFixture(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-host-capabilities-'))
  const init = run('init-project.mjs', ['--target', dir, '--mode', 'enterprise', '--json'])
  if (content) {
    fs.writeFileSync(path.join(dir, '.gse', 'host-capabilities.md'), content.trimStart().replace(/\n/g, '\r\n'), 'utf8')
  }
  return { dir, init }
}

function audit(target) {
  const resolvedTarget = path.resolve(target)
  const hostCapabilities = readHostCapabilities(resolvedTarget)
  const hostAdapters = readText(path.join(root, 'references', 'host-adapters.md'))
  const toolAdapters = readText(path.join(root, 'references', 'tool-adapters.md'))
  const qualityGates = readText(path.join(root, 'references', 'quality-gates.md'))
  const initProject = readText(path.join(root, 'scripts', 'init-project.mjs'))
  const continuePacket = readText(path.join(root, 'scripts', 'generate-continue-packet.mjs'))
  const validationProfile = readText(path.join(root, 'scripts', 'run-validation-profile.mjs'))
  const validator = readText(path.join(root, 'scripts', 'validate-gse.mjs'))
  const checks = [
    check('HC01', 'host capability record is present or reported as warning', hostCapabilities.exists || hostCapabilities.status === 'warning', hostCapabilities.exists ? hostCapabilities.path : 'missing host capability record warning'),
    check('HC02', 'capability table covers required capability rows when present', !hostCapabilities.exists || hostCapabilities.summary.missingRequired.length === 0, hostCapabilities.summary.missingRequired.join(', ') || 'required capabilities present'),
    check('HC03', 'capability statuses use allowed vocabulary', !hostCapabilities.exists || hostCapabilities.summary.invalidStatus.length === 0, hostCapabilities.summary.invalidStatus.join(', ') || Array.from(allowedStatuses).join(', ')),
    check('HC04', 'verified capabilities include concrete evidence', !hostCapabilities.exists || hostCapabilities.summary.missingEvidenceForVerified.length === 0, hostCapabilities.summary.missingEvidenceForVerified.join(', ') || 'verified rows have evidence'),
    check('HC05', 'native slash-command is not verified from portable command evidence', !hostCapabilities.exists || hostCapabilities.summary.nativeSlashOverclaim.length === 0, hostCapabilities.summary.nativeSlashOverclaim.join(', ') || 'native slash-command boundary preserved'),
    check('HC06', 'documented and external-required rows include claim boundaries', !hostCapabilities.exists || hostCapabilities.summary.documentedWithoutBoundary.length === 0, hostCapabilities.summary.documentedWithoutBoundary.join(', ') || 'claim boundaries present'),
    check('HC07', 'host/tool docs explain capability record and claim boundary', hostAdapters.includes('.gse/host-capabilities.md') && toolAdapters.includes('.gse/host-capabilities.md') && qualityGates.includes('host-capabilities'), 'references host/tool/quality docs'),
    check('HC08', 'init-project scaffolds host capability records', initProject.includes('host-capabilities.md') && initProject.includes('native-slash-command') && initProject.includes('external-required'), 'scripts/init-project.mjs'),
    check('HC09', 'continue packet surfaces host capability readiness', continuePacket.includes('readHostCapabilities') && continuePacket.includes('CP16') && continuePacket.includes('hostCapabilities'), 'scripts/generate-continue-packet.mjs'),
    check('HC10', 'validation routes include host capability audit', validationProfile.includes('audit-host-capabilities.mjs') && validator.includes('audit-host-capabilities.mjs'), 'validation profile and validate-gse'),
  ]
  const passed = checks.filter((item) => item.status === 'passed').length
  const failed = checks.length - passed
  return {
    target: resolvedTarget,
    generatedAt: new Date().toISOString(),
    summary: { status: failed === 0 ? hostCapabilities.status : 'failed', passed, failed, total: checks.length },
    workflows: {
      hostCapabilityRecords: failed === 0 && hostCapabilities.status !== 'failed' ? 'verified' : 'failed',
      nativeSlashCommandBoundary: failed === 0 ? 'verified' : 'failed',
    },
    hostCapabilities,
    checks,
    limits: [
      'Host capability records prove local record/audit mechanics and recorded project facts.',
      'They do not create native slash-command, browser, MCP, LSP, subagent, or CI capability.',
      'Native slash-command support still requires real host runtime invocation evidence.',
    ],
  }
}

function selfTestReport() {
  const valid = createFixture()
  const invalid = createFixture([
    '# Host Capabilities',
    '',
    '| Capability | Host/Tool | Status | Evidence | Claim Boundary | Last Checked |',
    '|---|---|---|---|---|---|',
    '| native-slash-command | Codex | verified | portable run-gse-command smoke | Claims native slash support | 2026-07-09 |',
    '| browser | Playwright | verified | - | Browser smoke available | 2026-07-09 |',
    '| mcp | MCP | maybe | - | Unknown | 2026-07-09 |',
    '| lsp | LSP | unknown | - | Unknown | 2026-07-09 |',
    '| subagent | Host dispatch | unknown | - | Unknown | 2026-07-09 |',
    '| ci | GitHub Actions | documented | .github/workflows/validate-gse.yml | | 2026-07-09 |',
    '',
  ].join('\n'))
  const missingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-host-capabilities-missing-'))
  fs.mkdirSync(path.join(missingDir, '.gse'), { recursive: true })
  const validReport = audit(valid.dir)
  const invalidReport = audit(invalid.dir)
  const missingReport = audit(missingDir)
  fs.rmSync(valid.dir, { recursive: true, force: true })
  fs.rmSync(invalid.dir, { recursive: true, force: true })
  fs.rmSync(missingDir, { recursive: true, force: true })
  const checks = [
    check('HCA01', 'init-project creates host capability record scaffold', valid.init.status === 0 && validReport.hostCapabilities.exists, 'scripts/init-project.mjs'),
    check('HCA02', 'scaffold covers required capabilities', validReport.hostCapabilities.summary.missingRequired.length === 0, validReport.hostCapabilities.capabilities.map((item) => item.capability).join(', ')),
    check('HCA03', 'missing host capability file is warning, not hard failure', missingReport.hostCapabilities.status === 'warning', 'missing fixture'),
    check('HCA04', 'invalid status, missing verified evidence, missing boundary, and native overclaim fail', invalidReport.summary.status === 'failed' && invalidReport.hostCapabilities.summary.invalidStatus.includes('mcp') && invalidReport.hostCapabilities.summary.missingEvidenceForVerified.includes('browser') && invalidReport.hostCapabilities.summary.nativeSlashOverclaim.includes('native-slash-command') && invalidReport.hostCapabilities.summary.documentedWithoutBoundary.includes('ci'), 'invalid fixture'),
    check('HCA05', 'audit source is wired to continue packet and validation scripts', validReport.checks.find((item) => item.id === 'HC09')?.status === 'passed' && validReport.checks.find((item) => item.id === 'HC10')?.status === 'passed', 'continue/validation wiring'),
  ]
  const passed = checks.filter((item) => item.status === 'passed').length
  const failed = checks.length - passed
  return {
    root,
    generatedAt: new Date().toISOString(),
    summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
    workflows: {
      hostCapabilityRecords: failed === 0 ? 'verified' : 'failed',
      initProjectHostCapabilityScaffold: failed === 0 ? 'verified' : 'failed',
      nativeSlashCommandBoundary: failed === 0 ? 'verified' : 'failed',
    },
    fixture: {
      validStatus: validReport.hostCapabilities.status,
      invalidStatus: invalidReport.hostCapabilities.status,
      missingStatus: missingReport.hostCapabilities.status,
    },
    checks,
    limits: [
      'This self-test verifies scaffold, parsing, and claim-boundary mechanics.',
      'It does not prove live host capabilities.',
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
