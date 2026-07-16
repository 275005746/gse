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

const domain = read('references/domain-quality-gates.md')
const quality = read('references/quality-gates.md')
const review = read('references/review.md')
const architecture = read('references/architecture-health.md')
const skill = read('SKILL.md')

const domains = [
  'Security/privacy',
  'Performance/cost',
  'Accessibility',
  'Resilience/recovery',
  'UI/browser',
  'API/state',
  'Data/migration',
  'Model/tool routing',
  'Release/operations',
]
const evidenceTerms = ['File inspection', 'Focused tests', 'API smokes', 'Browser smokes', 'Architecture/review scans']
const outputFields = ['Domain gates selected:', 'Why selected:', 'Evidence run:', 'Evidence status:', 'Unverified tools:', 'Residual risk:', 'Next action:']
const scaleTerms = ['Lite', 'Standard', 'Enterprise']

const checks = [
  check('DQ01', 'domain quality gates reference exists', exists('references/domain-quality-gates.md'), 'references/domain-quality-gates.md'),
  check('DQ02', 'SKILL routes domain quality gates', skill.includes('references/domain-quality-gates.md'), 'SKILL.md Reference Routing'),
  check('DQ03', 'quality-gates routes to domain gates', quality.includes('references/domain-quality-gates.md') && quality.includes('## Domain Gates'), 'references/quality-gates.md'),
  check('DQ04', 'review protocol routes to domain gates', review.includes('references/domain-quality-gates.md'), 'references/review.md'),
  check('DQ05', 'all required domains are represented', domains.every((item) => domain.includes(item)), domains.join(', ')),
  check('DQ06', 'scale adaptation is explicit', scaleTerms.every((item) => domain.includes(item)) && domain.includes('Lite work should not inherit every gate by default'), 'Lite, Standard, Enterprise'),
  check('DQ07', 'evidence taxonomy routing is explicit', domain.includes('references/evidence-taxonomy.md') && domain.includes('result') && domain.includes('verified') && domain.includes('accepted'), 'evidence taxonomy labels'),
  check('DQ08', 'tool execution is not faked', domain.includes('Do not claim scan, benchmark, browser, accessibility, security, or resilience results unless') && domain.includes('actually executed'), 'tool execution claim rule'),
  check('DQ09', 'minimum evidence mapping covers major evidence modes', evidenceTerms.every((item) => domain.includes(item)), evidenceTerms.join(', ')),
  check('DQ10', 'output format includes selected gates and residual risk', outputFields.every((item) => domain.includes(item)), outputFields.join(', ')),
  check('DQ11', 'architecture health covers performance and resilience risk', architecture.includes('Performance And Resilience') && architecture.includes('migration') && architecture.includes('release'), 'references/architecture-health.md'),
  check('DQ12', 'quality gates remain risk-based instead of mandatory for every task', domain.includes('Pick only the gates that match the changed behavior and project risk') && quality.includes('Do not force all gates onto Lite tasks'), 'risk-based gate language'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { domainQualityGates: failed === 0 ? 'verified' : 'failed' },
  limits: [
    'Domain quality gate audit verifies reusable guidance and routing; it does not run project-specific security scans, benchmarks, accessibility tools, browser tests, or API smokes.',
    'Projects must still execute the selected gates with their own commands, tools, owners, and evidence.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Domain Quality Gate Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Domain quality gates: ' + data.workflows.domainQualityGates)
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
