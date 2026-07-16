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

const template = read('assets/templates/update-release-acceptance-record.md')
const release = read('references/release.md')
const packaging = read('references/packaging.md')
const evidenceTaxonomy = read('references/evidence-taxonomy.md')
const validate = read('scripts/validate-gse.mjs')

const requiredFields = [
  'Record type:',
  'Project path:',
  'Goal or slice:',
  'Release label or change id:',
  'Evidence status:',
  'Local decisions preserved:',
  'Files changed:',
  'Files intentionally not changed:',
  'Commands run:',
  'Focused verification:',
  'Compatibility evidence:',
  'Migration notes:',
  'Rollback notes:',
  'Owner or acceptance gate:',
  'Accepted by:',
  'Residual risks:',
  'Next action:',
]

const statusTerms = ['result', 'verified', 'accepted', 'not ready']
const antiOverclaimTerms = [
  'Do not mark `accepted` only because `validate-gse.mjs`, tests, lint, or a local smoke passed.',
  'release publication',
  'package install',
  'production rollout',
  'host runtime support',
  'registry access',
  'subagent support',
  'MCP support',
  'browser support',
  'owner approval',
  'Accepted by: not accepted',
]

const referenceTerms = [
  'assets/templates/update-release-acceptance-record.md',
  'local decisions',
  'changed files',
  'rollback notes',
  'owner gate',
  'accepted-by status',
  'residual risk',
]

const checks = [
  check('URA01', 'update/release acceptance record template exists', exists('assets/templates/update-release-acceptance-record.md'), 'assets/templates/update-release-acceptance-record.md'),
  check('URA02', 'template captures required project-local fields', requiredFields.every((item) => template.includes(item)), requiredFields.join(', ')),
  check('URA03', 'template separates result, verified, accepted, and not ready', statusTerms.every((item) => template.includes(item)), statusTerms.join(', ')),
  check('URA04', 'template prevents local smoke from becoming fake acceptance', antiOverclaimTerms.every((item) => template.includes(item)), 'anti-overclaim rules'),
  check('URA05', 'template records rollback and residual risk explicitly', template.includes('Rollback notes:') && template.includes('Residual risks:') && template.includes('If rollback is unknown, say `unknown`'), 'rollback and residual risk fields'),
  check('URA06', 'release reference routes to acceptance record template', referenceTerms.every((item) => release.includes(item)), 'references/release.md'),
  check('URA07', 'packaging reference routes project-local updates to acceptance record', packaging.includes('assets/templates/update-release-acceptance-record.md') && packaging.includes('accepted-by status') && packaging.includes('residual risks'), 'references/packaging.md'),
  check('URA08', 'evidence taxonomy routes update/release work to acceptance record', evidenceTaxonomy.includes('assets/templates/update-release-acceptance-record.md') && evidenceTaxonomy.includes('rollback notes') && evidenceTaxonomy.includes('accepted-by status'), 'references/evidence-taxonomy.md'),
  check('URA09', 'consolidated validator includes this audit', validate.includes('audit-update-release-acceptance.mjs'), 'scripts/validate-gse.mjs'),
  check('URA10', 'template examples show verified without fake acceptance', template.includes('Evidence status: verified') && template.includes('Accepted by: policy: Lite focused smoke policy') && template.includes('Accepted by: not accepted'), 'minimal examples'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { updateReleaseAcceptance: failed === 0 ? 'verified' : 'failed' },
  limits: [
    'This audit verifies the reusable update/release acceptance record and routing only.',
    'It does not publish a release, run project-specific commands, approve owner acceptance, or certify arbitrary repositories.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Update/Release Acceptance Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Update/release acceptance: ' + data.workflows.updateReleaseAcceptance)
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
