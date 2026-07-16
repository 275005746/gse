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

const template = read('assets/templates/target-adoption-evidence.md')
const recipes = read('references/adoption-recipes.md')
const discovery = read('scripts/discover-project-profile.mjs')
const validate = read('scripts/validate-gse.mjs')

const fields = [
  'Target project:',
  'Adoption path:',
  'Project rules read:',
  'Files inspected:',
  'Files changed:',
  'Commands run:',
  'Detected project type:',
  'Detected package manager:',
  'Detected scripts:',
  'Host/tool statuses:',
  'Evidence status:',
  'Accepted by:',
  'Residual risks:',
  'Next action:',
]

const noOverclaim = [
  'documented` until executed',
  'unknown` unless the tool was actually checked',
  'Do not claim arbitrary real-repo certification',
  'host runtime support',
  'subagent support',
  'browser support',
  'MCP support',
  'CI support',
  'release publication',
  'owner acceptance',
  'Accepted by: not accepted',
]

const checks = [
  check('TAE01', 'target adoption evidence template exists', exists('assets/templates/target-adoption-evidence.md'), 'assets/templates/target-adoption-evidence.md'),
  check('TAE02', 'template captures target-project evidence fields', fields.every((item) => template.includes(item)), fields.join(', ')),
  check('TAE03', 'template prevents real-repo and host capability overclaims', noOverclaim.every((item) => template.includes(item)), 'anti-overclaim rules'),
  check('TAE04', 'adoption recipes route real target evidence to template', recipes.includes('assets/templates/target-adoption-evidence.md') && recipes.includes('Accepted by: not accepted'), 'references/adoption-recipes.md'),
  check('TAE05', 'discovery captures namespaced project scripts', discovery.includes('/^(smoke|evidence|replay|eval|release|deploy|publish|electron):/') && discovery.includes('package.json smoke script'), 'scripts/discover-project-profile.mjs'),
  check('TAE06', 'consolidated validator includes this audit', validate.includes('audit-target-adoption-evidence.mjs'), 'scripts/validate-gse.mjs'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { targetAdoptionEvidence: failed === 0 ? 'verified' : 'failed' },
  limits: [
    'This audit verifies the target-project evidence template and discovery support only.',
    'It does not certify any arbitrary repository or accept a host/runtime capability.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Target Adoption Evidence Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Target adoption evidence: ' + data.workflows.targetAdoptionEvidence)
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
