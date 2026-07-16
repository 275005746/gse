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

const template = read('assets/templates/acceptance-execution-packet.md')
const forwardTest = read('references/forward-test.md')
const recipes = read('references/adoption-recipes.md')
const validate = read('scripts/validate-gse.mjs')

const fields = [
  'Acceptance path:',
  'Target project or session:',
  'Purpose:',
  'Required inputs:',
  'Allowed files:',
  'Forbidden files:',
  'Allowed commands:',
  'Forbidden commands:',
  'Expected output:',
  'Evidence record path:',
  'Acceptance gate:',
  'Accepted by:',
  'Stop conditions:',
  'Residual risk if incomplete:',
  'Next action after completion:',
]

const freshInputs = [
  'SKILL.md',
  '.gse/gse-design-master-plan.md',
  '.gse/goal-map.md',
  '.gse/current-slice.md',
  'references/forward-test.md',
  'references/evidence-taxonomy.md',
]

const projectInputs = [
  'Project owner approval text or issue/task link.',
  'references/adoption-recipes.md',
  'assets/templates/target-adoption-evidence.md',
  'assets/templates/update-release-acceptance-record.md',
]

const antiOverclaim = [
  'Do not write `Accepted by: fresh-session` unless a separate session actually ran the packet.',
  'Do not write `Accepted by: owner` unless owner approval is explicit and recorded.',
  'Do not treat a generated packet, local validation, fixture audit, or read-only discovery as acceptance.',
  'Evidence status: not ready',
  'Accepted by: not accepted',
]

const checks = [
  check('AEP01', 'acceptance execution packet template exists', exists('assets/templates/acceptance-execution-packet.md'), 'assets/templates/acceptance-execution-packet.md'),
  check('AEP02', 'packet captures execution boundaries', fields.every((item) => template.includes(item)), fields.join(', ')),
  check('AEP03', 'fresh-session path uses documented GSE inputs', freshInputs.every((item) => template.includes(item)), freshInputs.join(', ')),
  check('AEP04', 'owner-approved path requires explicit owner evidence and project templates', projectInputs.every((item) => template.includes(item)), projectInputs.join(', ')),
  check('AEP05', 'packet limits default project writes to .gse artifacts', template.includes('.gse/project-profile.md') && template.includes('.gse/evidence/YYYY-MM-DD.md') && template.includes('Source code, lockfiles, secrets'), 'allowed and forbidden file sections'),
  check('AEP06', 'packet prevents fake acceptance', antiOverclaim.every((item) => template.includes(item)), 'anti-overclaim rules'),
  check('AEP07', 'forward-test reference supports fresh-session acceptance boundary', forwardTest.includes('Use `accepted by: fresh-session` only when a separate agent/session actually ran the path.'), 'references/forward-test.md'),
  check('AEP08', 'adoption recipes support target adoption evidence template', recipes.includes('assets/templates/target-adoption-evidence.md'), 'references/adoption-recipes.md'),
  check('AEP09', 'consolidated validator includes this audit', validate.includes('audit-acceptance-execution-packet.mjs'), 'scripts/validate-gse.mjs'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { acceptanceExecutionPacket: failed === 0 ? 'verified' : 'failed' },
  acceptedBy: 'not accepted; this audit verifies packet readiness only',
  limits: [
    'This audit verifies acceptance packet readiness only.',
    'It does not create a separate session, write to a target project, or record owner acceptance.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Acceptance Execution Packet Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Acceptance execution packet: ' + data.workflows.acceptanceExecutionPacket)
  lines.push('- Accepted by: ' + data.acceptedBy)
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
