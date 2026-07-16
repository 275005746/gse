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

function copySkillFixture() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-final-readiness-promotion-'))
  fs.cpSync(root, fixture, {
    recursive: true,
    filter(source) {
      const normalized = source.replace(/\\/g, '/')
      return !normalized.includes('/.git/') && !normalized.includes('/node_modules/')
    },
  })
  fs.writeFileSync(path.join(fixture, 'LICENSE'), 'MIT License\n\nFixture only.\n', 'utf8')
  return fixture
}

function runInFixture(fixture, relativeScript, commandArgs) {
  return run(process.execPath, [path.join(fixture, relativeScript), '--root', fixture, ...commandArgs, '--force', '--json'], fixture)
}

const fixture = copySkillFixture()

const records = [
  runInFixture(fixture, 'scripts/record-public-release.mjs', [
    '--license-status', 'selected',
    '--spdx', 'MIT',
    '--license-file', 'LICENSE',
    '--approved-by', 'gse-maintainer',
    '--decision-date', '2026-07-06',
    '--evidence-status', 'accepted',
    '--out', path.join(fixture, '.gse', 'releases', 'fixture-public-release-selected.md'),
  ]),
  runInFixture(fixture, 'scripts/record-public-security-contact.mjs', [
    '--contact-status', 'accepted',
    '--contact-type', 'url',
    '--contact-value', 'https://gse.dev/security',
    '--evidence-owner', 'gse-maintainer',
    '--evidence-date', '2026-07-06',
    '--evidence-url', 'https://gse.dev/security-policy',
    '--is-public', 'true',
    '--security-policy-updated', 'true',
    '--evidence-status', 'accepted',
    '--accepted-by', 'gse-maintainer',
    '--accepted-at', '2026-07-06',
    '--out', path.join(fixture, '.gse', 'releases', 'fixture-public-security-contact.md'),
  ]),
  runInFixture(fixture, 'scripts/record-public-repository-settings.mjs', [
    '--repository-url', 'https://github.com/gse-org/gse',
    '--visibility', 'public',
    '--settings-status', 'accepted',
    '--evidence-owner', 'gse-maintainer',
    '--evidence-date', '2026-07-06',
    '--evidence-url', 'https://github.com/gse-org/gse/settings/branches',
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
    '--accepted-by', 'gse-maintainer',
    '--accepted-at', '2026-07-06',
    '--out', path.join(fixture, '.gse', 'releases', 'fixture-public-repository-settings.md'),
  ]),
  runInFixture(fixture, 'scripts/record-public-ci-run.mjs', [
    '--run-status', 'accepted',
    '--run-conclusion', 'success',
    '--repository-url', 'https://github.com/gse-org/gse',
    '--workflow-name', 'Validate GSE',
    '--workflow-file', '.github/workflows/validate-gse.yml',
    '--run-url', 'https://github.com/gse-org/gse/actions/runs/123',
    '--commit-sha', '0123456789abcdef0123456789abcdef01234567',
    '--branch', 'main',
    '--required-checks', 'Validate GSE',
    '--evidence-owner', 'gse-maintainer',
    '--evidence-date', '2026-07-06',
    '--evidence-url', 'https://github.com/gse-org/gse/actions/runs/123',
    '--evidence-status', 'accepted',
    '--accepted-by', 'gse-maintainer',
    '--accepted-at', '2026-07-06',
    '--proves-public-ci-run', 'true',
    '--proves-required-checks', 'true',
    '--proves-release-commit', 'true',
    '--out', path.join(fixture, '.gse', 'releases', 'fixture-public-ci-run.md'),
  ]),
  runInFixture(fixture, 'scripts/record-public-channel-publication.mjs', [
    '--publication-status', 'accepted',
    '--channel-type', 'package-registry',
    '--channel-name', 'npm',
    '--channel-url', 'https://registry.npmjs.org/gse',
    '--version', '1.0.0',
    '--artifact-digest', 'sha256:fixture',
    '--review-status', 'published',
    '--evidence-owner', 'gse-maintainer',
    '--evidence-date', '2026-07-06',
    '--evidence-url', 'https://registry.npmjs.org/gse/1.0.0',
    '--evidence-status', 'accepted',
    '--accepted-by', 'gse-maintainer',
    '--accepted-at', '2026-07-06',
    '--proves-registry-publication', 'true',
    '--proves-channel-installability', 'true',
    '--out', path.join(fixture, '.gse', 'releases', 'fixture-public-registry-publication.md'),
  ]),
  runInFixture(fixture, 'scripts/record-public-channel-publication.mjs', [
    '--publication-status', 'accepted',
    '--channel-type', 'marketplace',
    '--channel-name', 'Codex Marketplace',
    '--channel-url', 'https://marketplace.openai.com/gse',
    '--version', '1.0.0',
    '--review-status', 'approved',
    '--evidence-owner', 'gse-maintainer',
    '--evidence-date', '2026-07-06',
    '--evidence-url', 'https://marketplace.openai.com/gse/review',
    '--evidence-status', 'accepted',
    '--accepted-by', 'gse-maintainer',
    '--accepted-at', '2026-07-06',
    '--proves-marketplace-approval', 'true',
    '--proves-channel-installability', 'true',
    '--out', path.join(fixture, '.gse', 'releases', 'fixture-marketplace-approval.md'),
  ]),
  runInFixture(fixture, 'scripts/record-host-invocation.mjs', [
    '--host', 'Fixture Native Host',
    '--invocation-method', 'native-slash-command',
    '--command', '/gse help',
    '--status', 'accepted',
    '--evidence-owner', 'gse-maintainer',
    '--evidence', 'fixture native slash-command transcript',
    '--verification-command', 'node scripts/audit-final-readiness.mjs --root __GSE__ --json',
    '--native-slash-command', 'true',
    '--portable-text-command', 'false',
    '--generated-pointer', 'false',
    '--owner-acceptance-required', 'false',
    '--out', path.join(fixture, '.gse', 'evidence', 'host-invocations', 'fixture-native-host.md'),
  ]),
]

const finalReadiness = run(process.execPath, [path.join(fixture, 'scripts', 'audit-final-readiness.mjs'), '--root', fixture, '--json'], fixture)
const finalReadinessData = parseJson(finalReadiness.stdout)
const matrix = finalReadinessData?.matrix ?? []
const promotedAreas = [
  'License decision',
  'Public security contact',
  'Public repository settings',
  'Public CI run',
  'Public registry publication',
  'Marketplace approval',
  'Native slash command',
  'Other host runtime invocation',
]
const areaStatus = new Map(matrix.map((row) => [row.area, row.status]))
const areaEvidence = new Map(matrix.map((row) => [row.area, row.evidence]))
const recordFailures = records.filter((item) => item.status !== 0)

const checks = [
  check('FRP01', 'accepted fixture records are generated', recordFailures.length === 0, recordFailures.map((item) => item.stderr || item.stdout || item.command).join('; ') || 'all accepted records written'),
  check('FRP02', 'final readiness audit runs on accepted-record fixture', finalReadiness.status === 0 && finalReadinessData?.summary?.status === 'passed', finalReadiness.stderr || 'audit-final-readiness fixture run'),
  check('FRP03', 'owner/external rows promote to verified from accepted records', promotedAreas.every((area) => areaStatus.get(area) === 'verified'), promotedAreas.map((area) => `${area}:${areaStatus.get(area) ?? 'missing'}`).join(', ')),
  check('FRP04', 'promoted rows cite concrete record evidence', promotedAreas.every((area) => String(areaEvidence.get(area) ?? '').includes('.gse/')), promotedAreas.map((area) => `${area}:${areaEvidence.get(area) ?? 'missing'}`).join(', ')),
  check('FRP05', 'public accepted becomes verified when every final row has accepted evidence', finalReadinessData?.workflows?.publicAccepted === 'verified', finalReadinessData?.workflows?.publicAccepted ?? 'unknown'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  fixtureRoot: fixture,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    finalReadinessPromotion: failed === 0 ? 'verified' : 'failed',
    publicAcceptedFixture: finalReadinessData?.workflows?.publicAccepted ?? 'unknown',
  },
  limits: [
    'This audit verifies promotion mechanics with fixture accepted records.',
    'It does not create real owner decisions, public CI runs, public repository settings, registry publications, marketplace approvals, or native host invocations.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Final Readiness Promotion Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('Fixture root: ' + data.fixtureRoot)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Final readiness promotion: ' + data.workflows.finalReadinessPromotion)
  lines.push('- Public accepted fixture: ' + data.workflows.publicAcceptedFixture)
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
