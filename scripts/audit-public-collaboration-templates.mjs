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

const pr = read('.github/PULL_REQUEST_TEMPLATE.md')
const bug = read('.github/ISSUE_TEMPLATE/bug_report.yml')
const change = read('.github/ISSUE_TEMPLATE/change_request.yml')
const config = read('.github/ISSUE_TEMPLATE/config.yml')
const openSourceAudit = read('scripts/audit-open-source-readiness.mjs')
const validate = read('scripts/validate-gse.mjs')

const prTerms = ['## Outcome', '## Scope', '## Acceptance', '## Evidence', '## Risk', '## Claim Boundary', 'validate-gse.mjs']
const bugTerms = ['Outcome', 'Actual behavior', 'Reproduction', 'Evidence', 'Risk and claim boundary', 'needs-evidence']
const changeTerms = ['Goal', 'Spec', 'Task level', 'Tool or host impact', 'Proposed evidence', 'needs-spec']

const checks = [
  check('PCT01', 'pull request template exists', exists('.github/PULL_REQUEST_TEMPLATE.md'), '.github/PULL_REQUEST_TEMPLATE.md'),
  check('PCT02', 'pull request template requires GSE evidence fields', prTerms.every((term) => pr.includes(term)), prTerms.join(', ')),
  check('PCT03', 'bug report template exists', exists('.github/ISSUE_TEMPLATE/bug_report.yml'), '.github/ISSUE_TEMPLATE/bug_report.yml'),
  check('PCT04', 'bug report requires reproduction, evidence, and claim boundary', bugTerms.every((term) => bug.includes(term)), bugTerms.join(', ')),
  check('PCT05', 'change request template exists', exists('.github/ISSUE_TEMPLATE/change_request.yml'), '.github/ISSUE_TEMPLATE/change_request.yml'),
  check('PCT06', 'change request requires spec, level, tool impact, and proposed evidence', changeTerms.every((term) => change.includes(term)), changeTerms.join(', ')),
  check('PCT07', 'blank issues are disabled until templates capture evidence', config.includes('blank_issues_enabled: false'), '.github/ISSUE_TEMPLATE/config.yml'),
  check('PCT08', 'templates avoid fake public contact or repository URL claims', config.includes('placeholder URL') && !config.includes('mailto:'), 'config keeps public URL owner-approved'),
  check('PCT09', 'open-source readiness audit includes collaboration templates', openSourceAudit.includes('audit-public-collaboration-templates.mjs') || openSourceAudit.includes('PULL_REQUEST_TEMPLATE.md'), 'scripts/audit-open-source-readiness.mjs'),
  check('PCT10', 'consolidated validator includes collaboration template audit', validate.includes('audit-public-collaboration-templates.mjs'), 'scripts/validate-gse.mjs'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    publicCollaborationTemplates: failed === 0 ? 'verified' : 'failed',
  },
  limits: [
    'This audit verifies local GitHub collaboration templates.',
    'It does not prove public repository issue settings, public URL ownership, maintainer response policy, or marketplace support.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Public Collaboration Template Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Public collaboration templates: ' + data.workflows.publicCollaborationTemplates)
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
