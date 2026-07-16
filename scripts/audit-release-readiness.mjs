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

const skill = read('SKILL.md')
const packaging = read('references/packaging.md')
const release = read('references/release.md')
const publicRelease = read('references/public-release.md')
const quality = read('references/quality-gates.md')
const openai = read('agents/openai.yaml')
const validate = read('scripts/validate-gse.mjs')

const packageBoundary = ['SKILL.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'SUPPORT.md', 'references/', 'scripts/', 'assets/templates/', 'assets/marketplace/', 'examples/', 'agents/openai.yaml', '.gse/', '.learnings/']
const releaseNoteFields = ['Release label:', 'Date:', 'Readiness:', 'Changed:', 'Validation:', 'Compatibility impact:', 'Migration or rollback:', 'Known risks:', 'Follow-up slices:']
const handoffFields = ['Skill path:', 'Release label or date.', 'Validation command and latest result.', 'Evidence log path.', 'Known residual risks.', 'Next slice from `.gse/current-slice.md`.']

const checks = [
  check('R01', 'packaging reference exists', exists('references/packaging.md'), 'references/packaging.md'),
  check('R02', 'SKILL routes packaging reference', skill.includes('references/packaging.md'), 'SKILL.md Reference Routing'),
  check('R03', 'package boundary lists core skill artifacts', packageBoundary.every((item) => packaging.includes(item)), packageBoundary.join(', ')),
  check('R04', 'validation command is the release gate', packaging.includes('node <skill>/scripts/validate-gse.mjs --root <skill>') && quality.includes('Use `references/release.md`') && release.includes('references/quality-gates.md'), 'packaging, quality, and release references'),
  check('R05', 'release label policy is explicit without fake semver', packaging.includes('gse-internal-YYYY-MM-DD-N') && packaging.includes('Use semver only after there is a maintained distribution channel'), 'internal release label policy'),
  check('R06', 'release notes fields are complete', releaseNoteFields.every((item) => packaging.includes(item)), releaseNoteFields.join(', ')),
  check('R07', 'install/update handoff fields are complete', handoffFields.every((item) => packaging.includes(item)), 'handoff checklist'),
  check('R08', 'rollback guidance distinguishes low-risk and generated artifacts', packaging.includes('file-level revert') && packaging.includes('generated files or adapters') && packaging.includes('re-running `validate-gse.mjs`'), 'rollback section'),
  check('R09', 'readiness status avoids overstating acceptance', packaging.includes('Do not call a release accepted only because local validation passed') && packaging.includes('true fresh-session acceptance separate from fresh-session readiness'), 'readiness status and release notes rules'),
  check('R10', 'host UI metadata is present and minimal', openai.includes('display_name: "GSE"') && openai.includes('short_description') && openai.includes('default_prompt'), 'agents/openai.yaml'),
  check('R11', 'consolidated validator includes packaging-adjacent gates', validate.includes('audit-fresh-session-readiness.mjs') && validate.includes('audit-compatibility.mjs') && validate.includes('audit-marketplace-discovery.mjs') && validate.includes('audit-host-ui-invocation.mjs') && validate.includes('quick_validate.py'), 'scripts/validate-gse.mjs'),
  check('R12', 'no external distribution is claimed', packaging.includes('not a registry publication process') && packaging.includes('Do not claim marketplace distribution') && packaging.includes('Do not call a release accepted'), 'distribution boundary'),
  check('R13', 'public release metadata gate is linked', release.includes('references/public-release.md') && packaging.includes('references/public-release.md') && publicRelease.includes('owner-required') && publicRelease.includes('assets/templates/public-release-record.md'), 'release, packaging, public-release references'),
  check('R14', 'release docs include npm publish dry-run preflight', packaging.includes('audit-npm-publish-dry-run.mjs') && packaging.includes('harmful metadata auto-correction warnings') && validate.includes('audit-npm-publish-dry-run.mjs'), 'references/packaging.md, scripts/validate-gse.mjs'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { releasePackagingReadiness: failed === 0 ? 'verified' : 'failed' },
  releaseReadiness: failed === 0 ? 'verified' : 'result',
  acceptedBy: 'not accepted; this audit verifies release packaging readiness but does not publish or owner-accept a release',
  limits: [
    'Release readiness audit verifies packaging policy, validation gate, handoff fields, rollback guidance, and metadata presence.',
    'It does not publish GSE, install it in another host, run marketplace checks, or mark v1.0 complete.',
    'A real release still needs the project or owner policy required for accepted status.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Release Readiness Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Release packaging readiness: ' + data.workflows.releasePackagingReadiness)
  lines.push('- Release readiness: ' + data.releaseReadiness)
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
