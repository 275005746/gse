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

const contributing = read('CONTRIBUTING.md')
const security = read('SECURITY.md')
const support = read('SUPPORT.md')
const readme = read('README.md')
const readmeZh = read('README.zh-CN.md')
const communityChannels = read('references/community-channels.md')
const publicRelease = read('references/public-release.md')
const packaging = read('references/packaging.md')
const validate = read('scripts/validate-gse.mjs')
const changelog = read('CHANGELOG.md')
const ciWorkflow = read('.github/workflows/validate-gse.yml')
const prTemplate = read('.github/PULL_REQUEST_TEMPLATE.md')

const checks = [
  check('OS01', 'contributing guide exists', exists('CONTRIBUTING.md') && contributing.includes('Validation') && contributing.includes('Evidence') && contributing.includes('Do not claim support'), 'CONTRIBUTING.md'),
  check('OS02', 'security policy exists without fake public contact', exists('SECURITY.md') && security.includes('Until a public security contact is chosen') && security.includes('release trust') && security.includes('No public vulnerability disclosure address has been owner-approved yet'), 'SECURITY.md'),
  check('OS03', 'support guide exists with first diagnostic commands and community entry', exists('SUPPORT.md') && support.includes('validate-gse.mjs') && support.includes('audit-target-project.mjs') && support.includes('GateHub (`https://gatehub.top/`)'), 'SUPPORT.md'),
  check('OS04', 'open-source readiness keeps license owner-gated', publicRelease.includes('GSE must not choose a license by guessing') && changelog.includes('Open-source license selection remains an owner decision'), 'references/public-release.md, CHANGELOG.md'),
  check('OS05', 'package boundary includes open-source docs', packaging.includes('CONTRIBUTING.md') && packaging.includes('SECURITY.md') && packaging.includes('SUPPORT.md'), 'references/packaging.md'),
  check('OS06', 'validator includes open-source readiness audit', validate.includes('audit-open-source-readiness.mjs'), 'scripts/validate-gse.mjs'),
  check('OS07', 'public repository CI workflow is present and audited', ciWorkflow.includes('node scripts/validate-gse.mjs --root . --skip-skill-validator --json') && validate.includes('audit-ci-readiness.mjs'), '.github/workflows/validate-gse.yml, scripts/validate-gse.mjs'),
  check('OS08', 'public collaboration templates require GSE evidence fields', prTemplate.includes('## Outcome') && prTemplate.includes('## Evidence') && validate.includes('audit-public-collaboration-templates.mjs'), '.github/PULL_REQUEST_TEMPLATE.md, scripts/validate-gse.mjs'),
  check('OS09', 'community support channel is documented with release boundaries', exists('references/community-channels.md') && readme.includes('GateHub ([gatehub.top](https://gatehub.top/))') && readmeZh.includes('GateHub（[gatehub.top](https://gatehub.top/)）') && support.includes('GateHub (`https://gatehub.top/`)') && publicRelease.includes('references/community-channels.md') && communityChannels.includes('Do not describe GateHub as') && communityChannels.includes('vulnerability disclosure channel'), 'README.md, README.zh-CN.md, SUPPORT.md, references/community-channels.md, references/public-release.md'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { openSourceReadiness: failed === 0 ? 'verified' : 'failed' },
  limits: [
    'This audit verifies repository collaboration, security, and support documents.',
    'It does not choose a license, create a public security address, publish to GitHub, or approve a marketplace listing.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Open Source Readiness Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Open source readiness: ' + data.workflows.openSourceReadiness)
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
