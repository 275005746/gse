#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

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

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const masterPlan = read('.gse/gse-design-master-plan.md')
const goalMap = read('.gse/goal-map.md')
const validate = read('scripts/validate-gse.mjs')

const requiredVerifiedAssets = [
  'README.md',
  'README.zh-CN.md',
  'SKILL.md',
  'AGENTS.md',
  '.gse/gse-design-master-plan.md',
  '.gse/goal-map.md',
  '.gse/current-slice.md',
  '.gse/state.json',
  'references/commands.md',
  'references/stage-orchestrator.md',
  'references/context-orchestration.md',
  'references/spec-workflow.md',
  'references/final-readiness.md',
  'references/packaging.md',
  'scripts/run-gse-command.mjs',
  'scripts/gse.mjs',
  'scripts/validate-gse.mjs',
  'scripts/run-validation-profile.mjs',
  'scripts/audit-command-execution.mjs',
  'scripts/audit-goal-discovery.mjs',
  'scripts/audit-context-orchestrator.mjs',
  'scripts/audit-agent-entrypoint.mjs',
  'scripts/audit-project-capability-registry.mjs',
  'scripts/audit-final-readiness.mjs',
]

const forbiddenPublicHistoryTerms = [
  'v' + '0.',
  '@t275005746/gse@' + '0.',
  'gse-release-bundle-' + 'audit',
  'Strength To ' + 'Absorb',
]

const requiredPlanTerms = [
  'GSE 1.0.0 is the public baseline',
  'Context Orchestration',
  'Natural-language goal discovery',
  'Project capability registries',
  'Real delegated execution remains a host capability and must be proven separately',
]

const requiredGoalTerms = [
  'GSE-006',
  'natural-language goal discovery',
  'GSE-010',
  'budget-aware context health',
  'GSE-011',
  'release, package, and public readiness workflows',
]

const checks = [
  check('RC01', 'roadmap consistency audit is wired into validator', validate.includes('audit-roadmap-consistency.mjs'), 'scripts/validate-gse.mjs'),
  check('RC02', 'required 1.0 roadmap assets exist', requiredVerifiedAssets.every(exists), requiredVerifiedAssets.join(', ')),
  check('RC03', 'master plan uses 1.0 public baseline terms', requiredPlanTerms.every((term) => masterPlan.includes(term)), requiredPlanTerms.join(', ')),
  check('RC04', 'goal map tracks current 1.0 capability nodes', requiredGoalTerms.every((term) => goalMap.includes(term)), requiredGoalTerms.join(', ')),
  check('RC05', 'public roadmap docs do not require old release history terms', forbiddenPublicHistoryTerms.every((term) => !masterPlan.includes(term) && !goalMap.includes(term)), forbiddenPublicHistoryTerms.join(', ')),
  check('RC06', 'claim boundaries remain explicit', masterPlan.includes('they cannot compact a live host session') && goalMap.includes('Local validation proves the package and workflow checks, not arbitrary project success'), '.gse/gse-design-master-plan.md, .gse/goal-map.md'),
  check('RC07', 'roadmap audit tracks the live final-readiness boundary', requiredVerifiedAssets.includes('scripts/audit-final-readiness.mjs'), 'scripts/audit-final-readiness.mjs'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { roadmapConsistency: failed === 0 ? 'verified' : 'failed' },
  limits: [
    'This audit checks the local GSE roadmap and 1.0 capability ledger.',
    'It does not certify arbitrary repositories or prove optional host-native capabilities.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Roadmap Consistency Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Roadmap consistency: ' + data.workflows.roadmapConsistency)
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
