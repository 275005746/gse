#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const targetArg = readArg('--target')
const jsonOnly = args.includes('--json')

export const evidenceLevels = [
  'result',
  'verified-unit',
  'verified-component',
  'verified-api',
  'verified-browser',
  'verified-ci',
  'accepted-owner',
  'accepted-release',
  'external-required',
]

const levelRank = new Map([
  ['result', 0],
  ['verified-unit', 1],
  ['verified-component', 2],
  ['verified-api', 2],
  ['verified-browser', 3],
  ['verified-ci', 3],
  ['accepted-owner', 4],
  ['accepted-release', 4],
  ['external-required', 0],
])

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, ok: false, records: [], error: 'missing' }
  const lines = readText(filePath)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const records = []
  for (const [index, line] of lines.entries()) {
    try {
      records.push(JSON.parse(line))
    } catch (error) {
      return { exists: true, ok: false, records, error: `line ${index + 1}: ${error.message}` }
    }
  }
  return { exists: true, ok: true, records, error: '' }
}

export function analyzeEvidenceLevels(records) {
  const allowed = new Set(evidenceLevels)
  const recordsWithLevel = records.filter((record) => typeof record.evidenceLevel === 'string' && record.evidenceLevel)
  const missingLevel = records.filter((record) => !record.evidenceLevel).map((record) => record.summary || record.recordType || '(unknown)')
  const invalidLevel = records
    .filter((record) => record.evidenceLevel && !allowed.has(record.evidenceLevel))
    .map((record) => ({ summary: record.summary || record.recordType || '(unknown)', evidenceLevel: record.evidenceLevel }))
  const downgraded = records
    .filter((record) => record.evidenceLevel && record.requiredEvidenceLevel && allowed.has(record.evidenceLevel) && allowed.has(record.requiredEvidenceLevel))
    .filter((record) => (levelRank.get(record.evidenceLevel) ?? 0) < (levelRank.get(record.requiredEvidenceLevel) ?? 0))
    .map((record) => ({
      summary: record.summary || record.recordType || '(unknown)',
      evidenceLevel: record.evidenceLevel,
      requiredEvidenceLevel: record.requiredEvidenceLevel,
    }))
  return {
    allowed: evidenceLevels,
    records: records.length,
    recordsWithLevel: recordsWithLevel.length,
    missingLevel,
    invalidLevel,
    downgraded,
  }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-evidence-levels-'))
  fs.mkdirSync(path.join(dir, '.gse', 'evidence'), { recursive: true })
  const records = [
    {
      date: '2026-07-08',
      recordType: 'slice',
      status: 'verified',
      evidenceLevel: 'verified-component',
      requiredEvidenceLevel: 'verified-browser',
      summary: 'UI component proof is downgraded from required browser proof.',
      evidenceFile: '.gse/evidence/2026-07-08.md',
      commands: ['pnpm test component'],
      nextAction: 'Run browser smoke before release.',
    },
    {
      date: '2026-07-08',
      recordType: 'slice',
      status: 'verified',
      evidenceLevel: 'verified-browser',
      requiredEvidenceLevel: 'verified-browser',
      summary: 'Browser proof satisfies UI requirement.',
      evidenceFile: '.gse/evidence/2026-07-08.md',
      commands: ['pnpm smoke browser'],
      nextAction: 'Close slice.',
    },
    {
      date: '2026-07-08',
      recordType: 'release',
      status: 'result',
      evidenceLevel: 'external-required',
      requiredEvidenceLevel: 'accepted-release',
      summary: 'Release evidence still needs owner or external acceptance.',
      evidenceFile: '.gse/evidence/2026-07-08.md',
      commands: ['gse owner-actions'],
      nextAction: 'Collect external gate.',
    },
  ]
  fs.writeFileSync(path.join(dir, '.gse', 'evidence', 'index.jsonl'), records.map((record) => JSON.stringify(record)).join('\n') + '\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'evidence', '2026-07-08.md'), '# Evidence\n', 'utf8')
  return dir
}

function audit(target) {
  const resolvedTarget = path.resolve(target)
  const taxonomy = readText(path.join(root, 'references', 'evidence-taxonomy.md'))
  const qualityGates = readText(path.join(root, 'references', 'quality-gates.md'))
  const closeGate = readText(path.join(root, 'scripts', 'audit-close-gate.mjs'))
  const continuePacket = readText(path.join(root, 'scripts', 'generate-continue-packet.mjs'))
  const validationProfile = readText(path.join(root, 'scripts', 'run-validation-profile.mjs'))
  const validator = readText(path.join(root, 'scripts', 'validate-gse.mjs'))
  const evidenceIndex = readJsonl(path.join(resolvedTarget, '.gse', 'evidence', 'index.jsonl'))
  const analysis = analyzeEvidenceLevels(evidenceIndex.records)
  const fixtureRecords = [
    {
      status: 'verified',
      evidenceLevel: 'verified-component',
      requiredEvidenceLevel: 'verified-browser',
      summary: 'fixture component downgrade',
    },
    {
      status: 'verified',
      evidenceLevel: 'verified-browser',
      requiredEvidenceLevel: 'verified-browser',
      summary: 'fixture browser proof',
    },
  ]
  const fixtureAnalysis = analyzeEvidenceLevels(fixtureRecords)

  const requiredTerms = [
    'Evidence Level',
    'verified-unit',
    'verified-component',
    'verified-api',
    'verified-browser',
    'verified-ci',
    'accepted-owner',
    'accepted-release',
    'external-required',
    'Evidence status answers whether the work is result, verified, or accepted.',
    'Evidence level answers what kind of proof produced that status.',
  ]

  const checks = [
    check('EL01', 'taxonomy defines all evidence levels and separates status from level', requiredTerms.every((term) => taxonomy.includes(term)), 'references/evidence-taxonomy.md'),
    check('EL02', 'quality gates require explicit evidence level for UI/browser/API/CI claims', qualityGates.includes('Evidence level uses `evidence-taxonomy.md`') && qualityGates.includes('verified-browser') && qualityGates.includes('verified-component'), 'references/quality-gates.md'),
    check('EL03', 'continue packet exposes latest evidence level and downgrade summary', continuePacket.includes('analyzeEvidenceLevels') && continuePacket.includes('evidenceLevels') && continuePacket.includes('latestEvidenceLevel'), 'scripts/generate-continue-packet.mjs'),
    check('EL04', 'close gate checks evidence level validity and downgrade warnings', closeGate.includes('analyzeEvidenceLevels') && closeGate.includes('CG09') && closeGate.includes('evidence level'), 'scripts/audit-close-gate.mjs'),
    check('EL05', 'validation routes include evidence level audit', validationProfile.includes('audit-evidence-levels.mjs') && validator.includes('audit-evidence-levels.mjs'), 'validation profile and validate-gse'),
    check('EL06', 'target evidence index parses', evidenceIndex.ok, evidenceIndex.ok ? `${evidenceIndex.records.length} record(s)` : evidenceIndex.error),
    check('EL07', 'target evidence levels are valid when present', analysis.invalidLevel.length === 0, analysis.invalidLevel.length ? JSON.stringify(analysis.invalidLevel) : 'no invalid evidence levels'),
    check('EL08', 'fixture detects downgraded UI/browser proof without failing parse', fixtureAnalysis.downgraded.length === 1 && fixtureAnalysis.invalidLevel.length === 0, `${fixtureAnalysis.downgraded.length} downgrade(s), ${fixtureAnalysis.invalidLevel.length} invalid level(s)`),
  ]
  const passed = checks.filter((item) => item.status === 'passed').length
  const failed = checks.length - passed
  return {
    target: resolvedTarget,
    generatedAt: new Date().toISOString(),
    summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
    workflows: {
      evidenceLevels: failed === 0 ? 'verified' : 'failed',
      recordsWithLevel: analysis.recordsWithLevel,
      missingLevel: analysis.missingLevel.length,
      downgraded: analysis.downgraded.length,
    },
    evidenceLevels: analysis,
    checks,
    limits: [
      'Evidence level is a proof-strength dimension; it does not replace result/verified/accepted status.',
      'Missing evidenceLevel is tolerated for historical records but should be added to new records.',
      'Downgraded evidence is surfaced as a warning path in continue/close gates; project policy decides whether it blocks close.',
    ],
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  const target = targetArg || createFixture()
  const report = audit(target)

  if (jsonOnly) console.log(JSON.stringify(report, null, 2))
  else console.log(JSON.stringify(report, null, 2))
  if (report.summary.status === 'failed') process.exit(1)
}
