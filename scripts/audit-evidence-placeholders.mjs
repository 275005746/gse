#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { isPlaceholderEvidence, placeholderEvidenceError } from './lib/evidence-placeholders.mjs'

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

const placeholderCases = [
  '__PLACEHOLDER__',
  '<placeholder>',
  'fixture-owner',
  'todo',
  'https://example.com/security',
  'https://github.com/example/gse/actions/runs/123',
  'https://registry.example/gse',
  'http://localhost:3000/result',
  'http://127.0.0.1/result',
  'security@example.com',
  'https://release.local/gse',
]

const realCases = [
  'gse-maintainer',
  'security@gse.dev',
  'https://github.com/gse-org/gse/actions/runs/123',
  'https://registry.npmjs.org/@t275005746/gse',
  'https://marketplace.openai.com/gse',
  'sha256:0123456789abcdef',
]

const recordScripts = [
  'scripts/record-public-ci-run.mjs',
  'scripts/record-public-repository-settings.mjs',
  'scripts/record-public-security-contact.mjs',
  'scripts/record-public-channel-publication.mjs',
]

const localFunctionRegex = /function\s+(isPlaceholderEvidence|rejectPlaceholderEvidence)\s*\(/
const importNeedle = "from './lib/evidence-placeholders.mjs'"

const helperSource = read('scripts/lib/evidence-placeholders.mjs')
const scriptSources = recordScripts.map((relativePath) => ({ relativePath, source: read(relativePath) }))
const duplicateDefinitions = scriptSources
  .filter((item) => localFunctionRegex.test(item.source))
  .map((item) => item.relativePath)
const missingImports = scriptSources
  .filter((item) => !item.source.includes(importNeedle))
  .map((item) => item.relativePath)

const checks = [
  check('EPH01', 'shared placeholder helper exists', exists('scripts/lib/evidence-placeholders.mjs') && helperSource.includes('export function isPlaceholderEvidence'), 'scripts/lib/evidence-placeholders.mjs'),
  check('EPH02', 'placeholder cases are rejected', placeholderCases.every((value) => isPlaceholderEvidence(value)), placeholderCases.map((value) => `${value}:${isPlaceholderEvidence(value)}`).join(', ')),
  check('EPH03', 'real-looking public evidence cases are allowed', realCases.every((value) => !isPlaceholderEvidence(value)), realCases.map((value) => `${value}:${isPlaceholderEvidence(value)}`).join(', ')),
  check('EPH04', 'placeholder error message stays operator-readable', placeholderEvidenceError('--evidence-url').includes('real public evidence') && placeholderEvidenceError('--evidence-url').includes('--evidence-url'), placeholderEvidenceError('--evidence-url')),
  check('EPH05', 'public record scripts import shared helper', missingImports.length === 0, missingImports.length ? missingImports.join(', ') : recordScripts.join(', ')),
  check('EPH06', 'public record scripts do not carry duplicate placeholder functions', duplicateDefinitions.length === 0, duplicateDefinitions.length ? duplicateDefinitions.join(', ') : 'no duplicate definitions'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    evidencePlaceholderHelper: failed === 0 ? 'verified' : 'failed',
  },
  limits: [
    'This audit verifies local placeholder detection and script wiring.',
    'It does not decide whether a real owner/external URL is valid or published.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Evidence Placeholder Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Evidence placeholder helper: ' + data.workflows.evidencePlaceholderHelper)
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
