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
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : ''
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function run(command, commandArgs, cwd = root) {
  const result = spawnSync(command, commandArgs, {
    cwd,
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

function createFixture() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-public-repo-settings-'))
  fs.mkdirSync(path.join(fixture, '.gse', 'releases'), { recursive: true })
  fs.mkdirSync(path.join(fixture, '.github', 'workflows'), { recursive: true })
  fs.mkdirSync(path.join(fixture, '.github', 'ISSUE_TEMPLATE'), { recursive: true })
  fs.writeFileSync(path.join(fixture, '.github', 'workflows', 'validate-gse.yml'), 'name: Validate GSE\n', 'utf8')
  fs.writeFileSync(path.join(fixture, '.github', 'PULL_REQUEST_TEMPLATE.md'), '## Evidence\n', 'utf8')
  fs.writeFileSync(path.join(fixture, '.github', 'ISSUE_TEMPLATE', 'bug_report.yml'), 'name: Bug report\n', 'utf8')
  return fixture
}

const recordScript = path.join(root, 'scripts', 'record-public-repository-settings.mjs')
const template = read('assets/templates/public-repository-settings-record.md')
const publicRelease = read('references/public-release.md')
const finalReadiness = read('references/final-readiness.md')
const validate = read('scripts/validate-gse.mjs')

const fixture = exists('scripts/record-public-repository-settings.mjs') ? createFixture() : null
const pending = fixture ? run(process.execPath, [recordScript, '--root', fixture, '--settings-status', 'pending', '--dry-run', '--json']) : null
const verifiedOk = fixture ? run(process.execPath, [
  recordScript,
  '--root', fixture,
  '--repository-url', 'https://github.com/example/gse',
  '--visibility', 'public',
  '--settings-status', 'verified',
  '--evidence-owner', 'fixture-owner',
  '--evidence-date', '2026-07-06',
  '--evidence-url', 'https://github.com/example/gse/settings/branches',
  '--issues-enabled', 'true',
  '--pull-requests-enabled', 'true',
  '--security-policy-visible', 'true',
  '--branch-protection-enabled', 'true',
  '--required-status-checks-enabled', 'true',
  '--required-checks', 'Validate GSE',
  '--require-review-before-merge', 'true',
  '--require-conversation-resolution', 'true',
  '--restrict-force-pushes', 'true',
  '--restrict-deletions', 'true',
  '--evidence-status', 'verified',
  '--dry-run',
  '--json',
]) : null
const verifiedMissing = fixture ? run(process.execPath, [recordScript, '--root', fixture, '--settings-status', 'verified', '--dry-run', '--json']) : null
const acceptedMissing = fixture ? run(process.execPath, [
  recordScript,
  '--root', fixture,
  '--repository-url', 'https://github.com/example/gse',
  '--visibility', 'public',
  '--settings-status', 'accepted',
  '--evidence-owner', 'fixture-owner',
  '--evidence-date', '2026-07-06',
  '--evidence-url', 'https://github.com/example/gse/settings/branches',
  '--issues-enabled', 'true',
  '--pull-requests-enabled', 'true',
  '--security-policy-visible', 'true',
  '--branch-protection-enabled', 'true',
  '--required-status-checks-enabled', 'true',
  '--required-checks', 'Validate GSE',
  '--require-review-before-merge', 'true',
  '--require-conversation-resolution', 'true',
  '--restrict-force-pushes', 'true',
  '--restrict-deletions', 'true',
  '--evidence-status', 'verified',
  '--dry-run',
  '--json',
]) : null
const acceptedOk = fixture ? run(process.execPath, [
  recordScript,
  '--root', fixture,
  '--repository-url', 'https://github.com/example/gse',
  '--visibility', 'public',
  '--settings-status', 'accepted',
  '--evidence-owner', 'fixture-owner',
  '--evidence-date', '2026-07-06',
  '--evidence-url', 'https://github.com/example/gse/settings/branches',
  '--issues-enabled', 'true',
  '--pull-requests-enabled', 'true',
  '--security-policy-visible', 'true',
  '--branch-protection-enabled', 'true',
  '--required-status-checks-enabled', 'true',
  '--required-checks', 'Validate GSE',
  '--require-review-before-merge', 'true',
  '--require-conversation-resolution', 'true',
  '--restrict-force-pushes', 'true',
  '--restrict-deletions', 'true',
  '--evidence-status', 'accepted',
  '--accepted-by', 'fixture-owner',
  '--accepted-at', '2026-07-06',
  '--dry-run',
  '--json',
]) : null
const verifiedPlaceholderWrite = fixture ? run(process.execPath, [
  recordScript,
  '--root', fixture,
  '--repository-url', 'https://github.com/example/gse',
  '--visibility', 'public',
  '--settings-status', 'verified',
  '--evidence-owner', 'fixture-owner',
  '--evidence-date', '2026-07-06',
  '--evidence-url', 'https://github.com/example/gse/settings/branches',
  '--issues-enabled', 'true',
  '--pull-requests-enabled', 'true',
  '--security-policy-visible', 'true',
  '--branch-protection-enabled', 'true',
  '--required-status-checks-enabled', 'true',
  '--required-checks', 'Validate GSE',
  '--require-review-before-merge', 'true',
  '--require-conversation-resolution', 'true',
  '--restrict-force-pushes', 'true',
  '--restrict-deletions', 'true',
  '--evidence-status', 'verified',
  '--json',
]) : null

const pendingData = pending ? parseJson(pending.stdout) : null
const verifiedOkData = verifiedOk ? parseJson(verifiedOk.stdout) : null
const verifiedMissingData = verifiedMissing ? parseJson(verifiedMissing.stdout) : null
const acceptedMissingData = acceptedMissing ? parseJson(acceptedMissing.stdout) : null
const acceptedOkData = acceptedOk ? parseJson(acceptedOk.stdout) : null
const verifiedPlaceholderWriteData = verifiedPlaceholderWrite ? parseJson(verifiedPlaceholderWrite.stdout) : null

const checks = [
  check('PRS01', 'public repository settings record command exists', exists('scripts/record-public-repository-settings.mjs'), 'scripts/record-public-repository-settings.mjs'),
  check('PRS02', 'public repository settings template exists', exists('assets/templates/public-repository-settings-record.md') && template.includes('Branch protection enabled') && template.includes('Required status checks enabled'), 'assets/templates/public-repository-settings-record.md'),
  check('PRS03', 'pending settings path remains writable without external proof', pending?.status === 0 && pendingData?.status === 'ready' && pendingData?.settingsStatus === 'pending' && pendingData?.evidenceStatus === 'pending', 'record-public-repository-settings pending dry-run'),
  check('PRS04', 'verified settings path accepts complete external evidence', verifiedOk?.status === 0 && verifiedOkData?.status === 'ready' && verifiedOkData?.settingsStatus === 'verified' && verifiedOkData?.evidenceStatus === 'verified', 'record-public-repository-settings verified dry-run'),
  check('PRS05', 'verified settings path rejects missing evidence', verifiedMissing?.status !== 0 && verifiedMissingData?.status === 'failed' && verifiedMissingData?.errors?.some((item) => item.includes('--evidence-owner')) && verifiedMissingData?.errors?.some((item) => item.includes('--evidence-date')) && verifiedMissingData?.errors?.some((item) => item.includes('--required-checks')), 'record-public-repository-settings verified missing-fields dry-run'),
  check('PRS06', 'accepted settings path rejects missing owner acceptance', acceptedMissing?.status !== 0 && acceptedMissingData?.status === 'failed' && acceptedMissingData?.errors?.some((item) => item.includes('--accepted-by')) && acceptedMissingData?.errors?.some((item) => item.includes('--evidence-status accepted')), 'record-public-repository-settings accepted missing acceptance dry-run'),
  check('PRS07', 'accepted settings path accepts complete owner acceptance', acceptedOk?.status === 0 && acceptedOkData?.status === 'ready' && acceptedOkData?.settingsStatus === 'accepted' && acceptedOkData?.evidenceStatus === 'accepted', 'record-public-repository-settings accepted dry-run'),
  check('PRS08', 'verified settings real write rejects placeholder or example evidence', verifiedPlaceholderWrite?.status !== 0 && verifiedPlaceholderWriteData?.status === 'failed' && verifiedPlaceholderWriteData?.errors?.some((item) => item.includes('not a placeholder')), 'record-public-repository-settings verified placeholder write'),
  check('PRS09', 'public release docs reference repository settings evidence', publicRelease.includes('Public repository settings') || publicRelease.includes('repository settings'), 'references/public-release.md'),
  check('PRS10', 'final readiness matrix includes public repository settings', finalReadiness.includes('Public repository settings'), 'references/final-readiness.md'),
  check('PRS11', 'consolidated validator includes repository settings audit', validate.includes('audit-public-repository-settings.mjs'), 'scripts/validate-gse.mjs'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  fixtureRoot: fixture,
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    publicRepositorySettings: failed === 0 ? 'verified' : 'failed',
    acceptedRepositorySettings: acceptedOkData?.status === 'ready' ? 'fixture-verified' : 'not-verified',
  },
  limits: [
    'This audit verifies record mechanics and guardrails for public repository settings.',
    'It does not configure a real GitHub repository, branch protection, issue settings, required checks, or maintainer policies.',
    'Accepted public repository settings still require owner/external evidence from the real repository.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Public Repository Settings Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Public repository settings: ' + data.workflows.publicRepositorySettings)
  lines.push('- Accepted repository settings path: ' + data.workflows.acceptedRepositorySettings)
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
