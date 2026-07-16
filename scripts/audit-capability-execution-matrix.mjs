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
const matrixPath = path.join(root, 'references', 'capability-execution-matrix.md')

function read(relativePath) {
  const absolutePath = path.join(root, relativePath)
  if (!fs.existsSync(absolutePath)) return ''
  return fs.readFileSync(absolutePath, 'utf8')
}

function check(id, label, passed, evidence, risk = '') {
  return {
    id,
    label,
    status: passed ? 'passed' : 'failed',
    evidence,
    risk,
  }
}

function parseMarkdownTable(markdown) {
  const rows = []
  const lines = markdown.split(/\r?\n/)
  const headerIndex = lines.findIndex((line) => line.trim().startsWith('| Capability | When to use |'))
  if (headerIndex === -1) return { header: [], rows }
  const header = lines[headerIndex]
    .split('|')
    .map((cell) => cell.trim())
    .filter(Boolean)
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim().startsWith('|')) break
    const cells = line
      .split('|')
      .map((cell) => cell.trim())
      .filter((cell, index, all) => !(index === 0 && cell === '') && !(index === all.length - 1 && cell === ''))
    if (cells.length !== header.length) continue
    rows.push(Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ''])))
  }
  return { header, rows }
}

const matrix = fs.existsSync(matrixPath) ? fs.readFileSync(matrixPath, 'utf8') : ''
const skill = read('SKILL.md')
const benchmark = read('references/benchmark-audit.md')
const validator = read('scripts/validate-gse.mjs')
const goalMap = read('.gse/goal-map.md')
const { header, rows } = parseMarkdownTable(matrix)

const requiredColumns = [
  'Capability',
  'When to use',
  'GSE behavior',
  'Implementation routes',
  'Current implementation status',
  'Known gap',
  'Next smallest core slice',
  'Required evidence level',
  'Focused verification',
  'Claim boundary',
]

const requiredCapabilities = [
  'Short-entry continuation',
  'Goal/state/evidence control',
  'Change/spec lifecycle',
  'Verification and evidence levels',
  'Product outcome steering',
  'Stage orchestration and progressive disclosure',
  'Goal discovery and choice routing',
  'Target adoption and repair ownership',
  'Optional tool and host adapter routing',
  'Release and public acceptance',
  'Packaging, install, and maintenance freshness',
  'Learning and drift promotion',
  'UI/browser evidence policy',
  'Gap and matrix governance',
]

const allowedEvidenceLevels = new Set([
  'result',
  'verified-unit',
  'verified-component',
  'verified-api',
  'verified-browser',
  'verified-ci',
  'accepted-owner',
  'accepted-release',
  'external-required',
])

const missingColumns = requiredColumns.filter((column) => !header.includes(column))
const capabilityNames = new Set(rows.map((row) => row.Capability))
const missingCapabilities = requiredCapabilities.filter((capability) => !capabilityNames.has(capability))
const incompleteRows = rows
  .filter((row) => requiredColumns.some((column) => !String(row[column] ?? '').trim()))
  .map((row) => row.Capability || '<unnamed>')
const invalidEvidenceRows = rows
  .filter((row) => !allowedEvidenceLevels.has(String(row['Required evidence level'] ?? '').trim()))
  .map((row) => `${row.Capability}:${row['Required evidence level']}`)
const rowsWithoutVerificationCommand = rows
  .filter((row) => !/(node |cmd \/c |gh |git |npm |browser|screenshot|target browser smoke)/i.test(String(row['Focused verification'] ?? '')))
  .map((row) => row.Capability)
const rowsWithoutImplementationRoute = rows
  .filter((row) => !/(gse|script|reference|browser|playwright|lsp|audit|command|route|pack|matrix)/i.test(String(row['Implementation routes'] ?? '')))
  .map((row) => row.Capability)
const rowsWithUnsafeHostClaim = rows
  .filter((row) => /native slash/i.test(`${row.Capability} ${row['Claim boundary']}`) && !/not prove|not claimed|unclaimed|external|required|host invocation/i.test(String(row['Claim boundary'] ?? '')))
  .map((row) => row.Capability)

const checks = [
  check('CEM01', 'capability execution matrix reference exists', fs.existsSync(matrixPath), 'references/capability-execution-matrix.md'),
  check('CEM02', 'matrix explains operating rule before implementation', matrix.includes('Find the capability row before implementation') && matrix.includes('If no row exists'), 'Operating Rule'),
  check('CEM03', 'matrix includes all required columns', missingColumns.length === 0, missingColumns.length ? missingColumns.join(', ') : requiredColumns.join(', ')),
  check('CEM04', 'matrix covers required GSE core capability families', missingCapabilities.length === 0, missingCapabilities.length ? missingCapabilities.join(', ') : `${rows.length} row(s)`),
  check('CEM05', 'all matrix rows are complete', incompleteRows.length === 0, incompleteRows.join(', ')),
  check('CEM06', 'all rows use valid evidence levels', invalidEvidenceRows.length === 0, invalidEvidenceRows.join(', ')),
  check('CEM07', 'all rows include focused verification commands or concrete checks', rowsWithoutVerificationCommand.length === 0, rowsWithoutVerificationCommand.join(', ')),
  check('CEM08', 'all rows bind implementation routes', rowsWithoutImplementationRoute.length === 0, rowsWithoutImplementationRoute.join(', ')),
  check('CEM09', 'native slash-command claim boundary remains external or not-claimed', rowsWithUnsafeHostClaim.length === 0, rowsWithUnsafeHostClaim.join(', ')),
  check('CEM10', 'SKILL routes capability matrix for GSE improvements', skill.includes('references/capability-execution-matrix.md'), 'SKILL.md Reference Routing'),
  check('CEM11', 'GSE gap audit routes capability matrix before coding', benchmark.includes('capability-execution-matrix.md') && benchmark.includes('Capability Execution Matrix'), 'references/benchmark-audit.md'),
  check('CEM12', 'validator includes capability matrix audit', validator.includes('audit-capability-execution-matrix.mjs'), 'scripts/validate-gse.mjs'),
  check('CEM13', 'goal map records the matrix governance slice', goalMap.includes('GSE-157') && goalMap.includes('Capability Execution Matrix'), '.gse/goal-map.md'),
]

const failed = checks.filter((item) => item.status === 'failed').length
const passed = checks.filter((item) => item.status === 'passed').length
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: {
    status: failed === 0 ? 'passed' : 'failed',
    passed,
    failed,
    total: checks.length,
    rows: rows.length,
  },
  workflows: {
    capabilityExecutionMatrix: failed === 0 ? 'verified' : 'incomplete',
    requiredCapabilities: missingCapabilities.length === 0 ? 'covered' : 'missing',
  },
  missingColumns,
  missingCapabilities,
  incompleteRows,
  invalidEvidenceRows,
  rowsWithoutVerificationCommand,
  rowsWithoutImplementationRoute,
  rowsWithUnsafeHostClaim,
  checks,
  limits: [
    'This audit verifies that GSE self-development has a capability-to-execution router.',
    'It does not prove a target project adopted the matrix.',
    'It does not prove native host slash-command support.',
  ],
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# Capability Execution Matrix Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + ' passed, ' + data.summary.failed + ' failed, ' + data.summary.total + ' total')
  lines.push('- Rows: ' + data.summary.rows)
  lines.push('')
  lines.push('## Checks')
  lines.push('')
  for (const item of data.checks) {
    const marker = item.status === 'passed' ? '[x]' : '[ ]'
    lines.push('- ' + marker + ' ' + item.id + ' ' + item.label + ': ' + item.status)
    if (item.evidence) lines.push('  - Evidence: ' + item.evidence)
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
