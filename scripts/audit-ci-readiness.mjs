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

const workflowPath = '.github/workflows/validate-gse.yml'
const workflow = read(workflowPath)
const packaging = read('references/packaging.md')
const openSourceAudit = read('scripts/audit-open-source-readiness.mjs')
const validate = read('scripts/validate-gse.mjs')

const requiredWorkflowTerms = [
  'name: Validate GSE',
  'pull_request:',
  'push:',
  'workflow_dispatch:',
  'actions/checkout@v4',
  'actions/setup-node@v4',
  'node-version: "20"',
  'node scripts/validate-gse.mjs --root . --profile lite --json',
  'node scripts/audit-final-readiness.mjs --root . --json',
  'node scripts/audit-final-acceptance-packet.mjs --root . --json',
]

const checks = [
  check('CI01', 'GitHub Actions validation workflow exists', exists(workflowPath), workflowPath),
  check('CI02', 'workflow covers pull request, push, and manual dispatch', ['pull_request:', 'push:', 'workflow_dispatch:'].every((term) => workflow.includes(term)), 'workflow triggers'),
  check('CI03', 'workflow uses pinned major official actions and Node 20', workflow.includes('actions/checkout@v4') && workflow.includes('actions/setup-node@v4') && workflow.includes('node-version: "20"'), 'checkout/setup-node/node version'),
  check('CI04', 'workflow runs profile-based GSE validation for CI-safe runtime cost', workflow.includes('node scripts/validate-gse.mjs --root . --profile lite --json'), 'validate-gse --profile lite CI command'),
  check('CI05', 'workflow audits final readiness and final acceptance boundaries', workflow.includes('audit-final-readiness.mjs') && workflow.includes('audit-final-acceptance-packet.mjs'), 'final readiness and packet audits'),
  check('CI06', 'workflow contains all required terms', requiredWorkflowTerms.every((term) => workflow.includes(term)), requiredWorkflowTerms.join(', ')),
  check('CI07', 'packaging docs include CI workflow in package boundary', packaging.includes('.github/workflows/validate-gse.yml'), 'references/packaging.md'),
  check('CI08', 'open-source readiness audit includes CI readiness', openSourceAudit.includes('audit-ci-readiness.mjs') || openSourceAudit.includes('.github/workflows/validate-gse.yml'), 'scripts/audit-open-source-readiness.mjs'),
  check('CI09', 'consolidated validator includes CI readiness audit', validate.includes('audit-ci-readiness.mjs'), 'scripts/validate-gse.mjs'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    ciWorkflowTemplate: failed === 0 ? 'verified' : 'failed',
    publicCiRun: 'external-required',
  },
  limits: [
    'This audit verifies the repository CI workflow template and local wiring.',
    'It does not prove a public GitHub Actions run, branch protection, required checks, or marketplace CI policy.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE CI Readiness Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- CI workflow template: ' + data.workflows.ciWorkflowTemplate)
  lines.push('- Public CI run: ' + data.workflows.publicCiRun)
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
