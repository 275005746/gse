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
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-owner-action-plan-drill-'))
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

function runFixtureScript(fixture, scriptName, scriptArgs) {
  return run(process.execPath, [path.join(fixture, 'scripts', scriptName), '--root', fixture, ...scriptArgs, '--force', '--json'], fixture)
}

function requiredCommandScriptsFor(gates) {
  return [...new Set(gates.map((gate) => {
    const match = String(gate.recordCommand ?? '').match(/scripts\/([\w-]+\.mjs)/)
    return match ? match[1] : null
  }).filter(Boolean))]
}

const fixture = copySkillFixture()
const manifestPath = path.join(fixture, '.gse', 'acceptance', 'release-status-manifest.json')
const planPath = path.join(fixture, '.gse', 'acceptance', 'release-owner-action-plan.md')

const generateManifest = runFixtureScript(fixture, 'generate-release-status-manifest.mjs', [
  '--out', manifestPath,
])
const generatePlan = runFixtureScript(fixture, 'generate-release-owner-action-plan.mjs', [
  '--manifest', manifestPath,
  '--out', planPath,
])
const manifest = fs.existsSync(manifestPath) ? parseJson(fs.readFileSync(manifestPath, 'utf8')) : null
const plan = fs.existsSync(planPath) ? fs.readFileSync(planPath, 'utf8') : ''
const pendingGates = manifest?.publicAcceptance?.pendingGates ?? []
const hasPendingGates = pendingGates.length > 0
const commandScripts = requiredCommandScriptsFor(pendingGates)

const recordRuns = [
  runFixtureScript(fixture, 'record-public-security-contact.mjs', [
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
  runFixtureScript(fixture, 'record-public-repository-settings.mjs', [
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
  runFixtureScript(fixture, 'record-public-ci-run.mjs', [
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
  runFixtureScript(fixture, 'record-public-channel-publication.mjs', [
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
  runFixtureScript(fixture, 'record-public-channel-publication.mjs', [
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
  runFixtureScript(fixture, 'record-host-invocation.mjs', [
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
  runFixtureScript(fixture, 'record-host-invocation.mjs', [
    '--host', 'Fixture Other Host',
    '--invocation-method', 'portable-command-runner',
    '--command', '/gse continue',
    '--status', 'accepted',
    '--evidence-owner', 'gse-maintainer',
    '--evidence', 'fixture other host runtime transcript',
    '--verification-command', 'node scripts/audit-final-readiness.mjs --root __GSE__ --json',
    '--native-slash-command', 'false',
    '--portable-text-command', 'false',
    '--generated-pointer', 'false',
    '--owner-acceptance-required', 'false',
    '--out', path.join(fixture, '.gse', 'evidence', 'host-invocations', 'fixture-other-host.md'),
  ]),
]

const finalReadiness = run(process.execPath, [path.join(fixture, 'scripts', 'audit-final-readiness.mjs'), '--root', fixture, '--json'], fixture)
const finalReadinessData = parseJson(finalReadiness.stdout)
const publicDoctor = run(process.execPath, [path.join(fixture, 'scripts', 'audit-public-acceptance-readiness.mjs'), '--root', fixture, '--json'], fixture)
const publicDoctorData = parseJson(publicDoctor.stdout)

const expectedScripts = commandScripts
const recordFailures = recordRuns.filter((item) => item.status !== 0)
const promotedRows = finalReadinessData?.matrix?.filter((row) => row.status === 'verified') ?? []

const checks = [
  check('ROAD01', 'release status manifest and owner action plan generate in fixture', generateManifest.status === 0 && generatePlan.status === 0 && ['not-accepted', 'verified'].includes(manifest?.publicAcceptance?.publicAccepted) && plan.includes('GSE Release Owner Action Plan'), 'generate manifest and action plan'),
  check('ROAD02', 'owner action plan covers all pending gates from manifest', hasPendingGates ? (pendingGates.every((gate) => plan.includes(gate.area) && plan.includes(gate.recordCommand)) && !pendingGates.some((gate) => gate.area === 'License decision')) : manifest?.publicAcceptance?.publicAccepted === 'verified' && plan.includes('No pending owner or external gates were reported by the manifest.'), `${pendingGates.length} pending gate(s); License decision resolved`),
  check('ROAD03', 'owner action plan commands map to real record scripts', expectedScripts.every((script) => commandScripts.includes(script)) && !plan.includes('proves-public-registry-publication'), commandScripts.join(', ')),
  check('ROAD04', 'accepted fixture records can be created for every owner/external gate family', recordFailures.length === 0, recordFailures.map((item) => item.stderr || item.stdout || item.command).join('; ') || 'all fixture records written'),
  check('ROAD05', 'final readiness promotes to publicAccepted verified after fixture records', finalReadiness.status === 0 && finalReadinessData?.workflows?.publicAccepted === 'verified' && promotedRows.length >= 22, finalReadinessData?.workflows?.publicAccepted ?? 'unknown'),
  check('ROAD06', 'public acceptance doctor reports no pending gates after accepted fixture records', publicDoctor.status === 0 && publicDoctorData?.summary?.pendingGates === 0 && publicDoctorData?.summary?.publicAccepted === 'verified', `pending=${publicDoctorData?.summary?.pendingGates ?? 'unknown'}, publicAccepted=${publicDoctorData?.summary?.publicAccepted ?? 'unknown'}`),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  fixtureRoot: fixture,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    releaseOwnerActionPlanDrill: failed === 0 ? 'verified' : 'failed',
    publicAcceptedFixture: finalReadinessData?.workflows?.publicAccepted ?? 'unknown',
    pendingGatesAfterRecords: publicDoctorData?.summary?.pendingGates ?? 'unknown',
  },
  limits: [
    'This drill verifies the owner action plan path with fixture accepted records.',
    'It does not create real owner decisions, public CI runs, public repository settings, registry publications, marketplace approvals, or native host invocations.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Release Owner Action Plan Drill')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('Fixture root: ' + data.fixtureRoot)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Public accepted fixture: ' + data.workflows.publicAcceptedFixture)
  lines.push('- Pending gates after records: ' + data.workflows.pendingGatesAfterRecords)
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

fs.rmSync(fixture, { recursive: true, force: true })

if (failed > 0) process.exit(1)
