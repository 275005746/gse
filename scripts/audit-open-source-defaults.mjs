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
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const license = read('LICENSE')
const defaults = read('references/open-source-defaults.md')
const publicRelease = read('references/public-release.md')
const skill = read('SKILL.md')
const releaseRecord = read('.gse/releases/public-release-owner-required.md')

const checks = [
  check('OSD01', 'MIT license file exists', exists('LICENSE') && license.includes('MIT License') && license.includes('GSE contributors'), 'LICENSE'),
  check('OSD02', 'open-source defaults reference exists', exists('references/open-source-defaults.md'), 'references/open-source-defaults.md'),
  check('OSD03', 'defaults align with mainstream public release path', ['License: MIT', 'public GitHub repository', 'GitHub Actions', 'SECURITY.md', 'GitHub Release', 'portable `/gse ...` commands'].every((term) => defaults.includes(term)), 'references/open-source-defaults.md'),
  check('OSD04', 'defaults preserve external evidence boundaries', ['public CI', 'public security contact', 'public publication', 'native slash commands'].every((term) => defaults.includes(term)), 'references/open-source-defaults.md'),
  check('OSD05', 'public release docs route to defaults', publicRelease.includes('references/open-source-defaults.md') && publicRelease.includes('owner-approved mainstream open-source default is MIT'), 'references/public-release.md'),
  check('OSD06', 'skill routes open-source defaults reference', skill.includes('references/open-source-defaults.md'), 'SKILL.md'),
  check('OSD07', 'owner license decision is accepted as MIT', releaseRecord.includes('License status: selected') && releaseRecord.includes('SPDX identifier: MIT') && releaseRecord.includes('License file: LICENSE') && releaseRecord.includes('Evidence status: accepted'), '.gse/releases/public-release-owner-required.md'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    openSourceDefaults: failed === 0 ? 'verified' : 'failed',
    licenseDecision: failed === 0 ? 'accepted' : 'unknown',
  },
  limits: [
    'This audit verifies the owner-approved default route and MIT license record.',
    'It does not prove public repository settings, public CI, registry publication, marketplace approval, or native host runtime invocation.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Open-Source Defaults Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Open-source defaults: ' + data.workflows.openSourceDefaults)
  lines.push('- License decision: ' + data.workflows.licenseDecision)
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
