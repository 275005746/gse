#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { analyzeEvidenceLevels } from './audit-evidence-levels.mjs'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const targetArg = readArg('--target')
const target = path.resolve(targetArg || root)
const jsonOnly = args.includes('--json')

function read(relativePath, base = root) {
  const fullPath = path.join(base, relativePath)
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, ok: false, records: [], error: 'missing' }
  const lines = fs.readFileSync(filePath, 'utf8')
    .replace(/^\uFEFF/, '')
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

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-ui-evidence-policy-'))
  fs.mkdirSync(path.join(dir, '.gse', 'evidence'), { recursive: true })
  const records = [
    {
      date: '2026-07-09',
      recordType: 'slice',
      status: 'verified',
      evidenceLevel: 'verified-component',
      requiredEvidenceLevel: 'verified-browser',
      summary: 'Component-only proof for visible UI behavior.',
      evidenceFile: '.gse/evidence/2026-07-09.md',
      commands: ['pnpm test component'],
      nextAction: 'Run browser smoke before release.',
    },
    {
      date: '2026-07-09',
      recordType: 'slice',
      status: 'verified',
      evidenceLevel: 'verified-browser',
      requiredEvidenceLevel: 'verified-browser',
      summary: 'Browser-backed proof for visible UI behavior.',
      evidenceFile: '.gse/evidence/2026-07-09.md',
      commands: ['pnpm smoke browser', 'playwright screenshot'],
      nextAction: 'Close slice.',
    },
  ]
  fs.writeFileSync(path.join(dir, '.gse', 'evidence', 'index.jsonl'), records.map((record) => JSON.stringify(record)).join('\n') + '\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'evidence', '2026-07-09.md'), '# Evidence\n', 'utf8')
  return dir
}

const qualityGates = read('references/quality-gates.md')
const taxonomy = read('references/evidence-taxonomy.md')
const template = read('assets/templates/evidence.md')
const continuePacket = read('scripts/generate-continue-packet.mjs')
const closeGate = read('scripts/audit-close-gate.mjs')
const validationProfile = read('scripts/run-validation-profile.mjs')
const validator = read('scripts/validate-gse.mjs')
const roadmap = read('references/final-form-roadmap.md')
const fixture = createFixture()
const fixtureAnalysis = analyzeEvidenceLevels(readJsonl(path.join(fixture, '.gse', 'evidence', 'index.jsonl')).records)
const targetEvidence = readJsonl(path.join(target, '.gse', 'evidence', 'index.jsonl'))
const targetAnalysis = analyzeEvidenceLevels(targetEvidence.records)

const checks = [
  check(
    'UIE01',
    'quality gates distinguish component proof from browser proof',
    qualityGates.includes('verified-component') &&
      qualityGates.includes('verified-browser') &&
      qualityGates.includes('Do not describe `verified-component` or `verified-api` as `verified-browser`') &&
      qualityGates.includes('Screenshot or visual inspection for layout-sensitive work'),
    'references/quality-gates.md',
  ),
  check(
    'UIE02',
    'evidence taxonomy defines browser proof and downgrade examples',
    taxonomy.includes('A UI component test can be `status: verified` with `evidenceLevel: verified-component`') &&
      taxonomy.includes('A Playwright smoke can be `status: verified` with `evidenceLevel: verified-browser`') &&
      taxonomy.includes('requiredEvidenceLevel'),
    'references/evidence-taxonomy.md',
  ),
  check(
    'UIE03',
    'evidence template requires status, level, and required level',
    template.includes('Evidence status') &&
      template.includes('Evidence level') &&
      template.includes('Required evidence level'),
    'assets/templates/evidence.md',
  ),
  check(
    'UIE04',
    'continue preflight exposes evidence level downgrades before implementation',
    continuePacket.includes('evidenceLevels') &&
      continuePacket.includes('downgraded') &&
      continuePacket.includes('verified-component') &&
      continuePacket.includes('verified-browser'),
    'scripts/generate-continue-packet.mjs',
  ),
  check(
    'UIE05',
    'close gate surfaces evidence downgrade before close',
    closeGate.includes('CG09') &&
      closeGate.includes('evidence level') &&
      closeGate.includes('downgrade'),
    'scripts/audit-close-gate.mjs',
  ),
  check(
    'UIE06',
    'fixture labels component proof downgrade from required browser proof',
    fixtureAnalysis.downgraded.length === 1 &&
      fixtureAnalysis.downgraded[0]?.evidenceLevel === 'verified-component' &&
      fixtureAnalysis.downgraded[0]?.requiredEvidenceLevel === 'verified-browser',
    `${fixtureAnalysis.downgraded.length} downgrade(s)`,
  ),
  check(
    'UIE07',
    'target evidence has no invalid evidence levels',
    targetEvidence.ok && targetAnalysis.invalidLevel.length === 0,
    targetEvidence.ok ? `${targetAnalysis.invalidLevel.length} invalid level(s), ${targetAnalysis.downgraded.length} downgrade(s)` : targetEvidence.error,
  ),
  check(
    'UIE08',
    'validation profiles include UI/browser evidence policy audit',
    validationProfile.includes('audit-ui-browser-evidence-policy.mjs') &&
      validator.includes('audit-ui-browser-evidence-policy.mjs'),
    'scripts/run-validation-profile.mjs + scripts/validate-gse.mjs',
  ),
  check(
    'UIE09',
    'final-form roadmap tracks browser UI evidence policy as Wave 4 capability',
    roadmap.includes('Done: Browser/UI evidence policy') &&
      roadmap.includes('verified-component') &&
      roadmap.includes('verified-browser'),
    'references/final-form-roadmap.md',
  ),
]

fs.rmSync(fixture, { recursive: true, force: true })

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  target,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    uiBrowserEvidencePolicy: failed === 0 ? 'verified' : 'failed',
    targetDowngrades: targetAnalysis.downgraded.length,
    targetInvalidLevels: targetAnalysis.invalidLevel.length,
  },
  checks,
  limits: [
    'This audit verifies UI/browser evidence policy and gate wiring.',
    'It does not run a real browser, Playwright, screenshot, or visual inspection.',
    'Only a project-specific browser/screenshot smoke can justify evidenceLevel verified-browser for visible UI behavior.',
  ],
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))

if (failed > 0) process.exit(1)
