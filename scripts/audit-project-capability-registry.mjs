#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const target = path.resolve(readArg('--target', root))
const jsonOnly = args.includes('--json')
const allowedStatuses = new Set(['verified', 'documented', 'unknown', 'unavailable', 'external-required'])

const registrySpecs = [
  { id: 'skills', path: '.gse/skills/README.md', header: 'Skill', minimumColumns: 7 },
  { id: 'plugins', path: '.gse/plugins/README.md', header: 'Plugin', minimumColumns: 8 },
  { id: 'hooks', path: '.gse/hooks/README.md', header: 'Hook', minimumColumns: 9 },
  { id: 'mcp', path: '.gse/mcp/README.md', header: 'Server', minimumColumns: 9 },
  { id: 'lsp', path: '.gse/lsp/README.md', header: 'Capability', minimumColumns: 7 },
]

function read(relativePath) {
  const absolutePath = path.join(target, relativePath)
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function parseTable(text, spec) {
  const tableLines = text.split(/\r?\n/).filter((line) => line.trim().startsWith('|'))
  const headerIndex = tableLines.findIndex((line) => new RegExp(`^\\|\\s*${spec.header}\\s*\\|`, 'i').test(line.trim()))
  if (headerIndex === -1) return { header: [], rows: [] }
  const parse = (line) => line.trim().slice(1, -1).split('|').map((cell) => cell.trim())
  const header = parse(tableLines[headerIndex])
  const rows = tableLines.slice(headerIndex + 2).map(parse).filter((cells) => cells.length >= spec.minimumColumns)
  return { header, rows }
}

function concrete(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return Boolean(normalized && !['-', 'none', 'n/a', 'tbd', 'todo'].includes(normalized))
}

function statusCell(header, row) {
  const index = header.findIndex((cell) => /^status$/i.test(cell))
  return index === -1 ? '' : row[index]
}

function namedCell(header, row, name) {
  const index = header.findIndex((cell) => cell.toLowerCase() === name.toLowerCase())
  return index === -1 ? '' : row[index]
}

function evidenceCell(header, row) {
  return namedCell(header, row, 'Evidence') || namedCell(header, row, 'Source')
}

const registries = registrySpecs.map((spec) => {
  const text = read(spec.path)
  const table = parseTable(text, spec)
  const statuses = table.rows.map((row) => statusCell(table.header, row))
  const invalidStatuses = statuses.filter((status) => !allowedStatuses.has(status))
  const missingFallback = table.rows.filter((row) => !concrete(namedCell(table.header, row, 'Fallback'))).length
  const missingBoundary = table.rows.filter((row) => !concrete(namedCell(table.header, row, 'Claim Boundary'))).length
  const verifiedWithoutEvidence = table.rows.filter((row) => statusCell(table.header, row) === 'verified' && !concrete(evidenceCell(table.header, row))).length
  return {
    ...spec,
    exists: Boolean(text),
    rows: table.rows.length,
    statuses,
    invalidStatuses,
    missingFallback,
    missingBoundary,
    verifiedWithoutEvidence,
    hasVocabularyRule: ['verified', 'documented', 'unknown', 'unavailable', 'external-required'].every((status) => text.includes(status)),
  }
})

function check(id, label, passed, evidence, risk = '') {
  return { id, label, status: passed ? 'passed' : 'failed', evidence, risk }
}

const checks = []
for (const registry of registries) {
  const prefix = registry.id.toUpperCase()
  checks.push(check(`${prefix}01`, `${registry.id} registry exists and is non-empty`, registry.exists && registry.rows > 0, `${registry.path}: ${registry.rows} row(s)`))
  checks.push(check(`${prefix}02`, `${registry.id} statuses use the shared vocabulary`, registry.invalidStatuses.length === 0 && registry.hasVocabularyRule, registry.invalidStatuses.join(', ') || registry.statuses.join(', ')))
  checks.push(check(`${prefix}03`, `${registry.id} rows include fallbacks and claim boundaries`, registry.missingFallback === 0 && registry.missingBoundary === 0, `missing fallback=${registry.missingFallback}, missing boundary=${registry.missingBoundary}`))
  checks.push(check(`${prefix}04`, `${registry.id} verified rows include concrete evidence`, registry.verifiedWithoutEvidence === 0, `verified without evidence=${registry.verifiedWithoutEvidence}`))
}

const validationProfile = fs.readFileSync(path.join(root, 'scripts', 'run-validation-profile.mjs'), 'utf8')
const validator = fs.readFileSync(path.join(root, 'scripts', 'validate-gse.mjs'), 'utf8')
checks.push(check('PCR01', 'capability registry audit is wired into Lite and consolidated validation', validationProfile.includes('audit-project-capability-registry.mjs') && validator.includes('audit-project-capability-registry.mjs'), 'validation wiring'))

const failed = checks.filter((item) => item.status === 'failed').length
const report = {
  root,
  target,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed: checks.length - failed, failed, total: checks.length },
  workflows: { projectCapabilityRegistry: failed === 0 ? 'verified' : 'incomplete' },
  registries,
  checks,
  limits: [
    'Registry status reports repository evidence and declared fallback behavior.',
    'Documented and unknown rows do not prove current-session runtime availability.',
  ],
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))
if (failed > 0) process.exit(1)
