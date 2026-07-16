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

const roadmap = read('references/final-form-roadmap.md')
const masterPlan = read('.gse/gse-design-master-plan.md')
const goalMap = read('.gse/goal-map.md')
const currentSlice = read('.gse/current-slice.md')
const stateRaw = read('.gse/state.json')
const evidenceIndexRaw = read('.gse/evidence/index.jsonl')
const skill = read('SKILL.md')

let state = null
try {
  state = JSON.parse(stateRaw)
} catch {
  state = null
}

let evidenceRecords = []
try {
  evidenceRecords = evidenceIndexRaw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
} catch {
  evidenceRecords = []
}

const latestEvidence = evidenceRecords.at(-1)
const stateHasCurrentEvidence =
  state?.phase === 'final-form' &&
  typeof state?.currentSlice?.id === 'string' &&
  state.currentSlice.id.startsWith('GSE-') &&
  typeof state?.currentSlice?.nextAction === 'string' &&
  typeof state?.lastEvidence === 'string' &&
  state.lastEvidence.startsWith('.gse/evidence/') &&
  exists(state.lastEvidence) &&
  latestEvidence?.evidenceFile === state.lastEvidence &&
  latestEvidence?.nextAction === state.currentSlice.nextAction

const priorities = Array.from({ length: 11 }, (_, index) => `P${index}`)
const roadmapHasPriorities = priorities.every((item) => roadmap.includes(`| ${item} |`))
const requiredTerms = [
  '/gse continue',
  'Completion Definition',
  'Short entry takeover',
  'State system',
  'Evidence gate',
  'Spec and change lifecycle',
  'Roles and subagents',
  'Learning automation',
  'Final Form Execution Plan',
  'Current Final-Form Gap List',
  'Goal Mode Operating Contract',
  'Claim Boundary',
]

const executionWaveTerms = [
  'Wave 1 - Short Entry And State Control',
  'Wave 2 - Spec, Role, And Execution Discipline',
  'Wave 3 - Learning To Guard Promotion',
  'Wave 4 - Tool And Host Runtime Adapters',
  'Wave 5 - Distribution, Public Trust, And Maintenance',
]

const checks = [
  check('FFR01', 'final form roadmap exists', exists('references/final-form-roadmap.md'), 'references/final-form-roadmap.md'),
  check('FFR02', 'roadmap covers P0 through P10', roadmapHasPriorities, priorities.join(', ')),
  check('FFR03', 'roadmap contains required final-form concepts', requiredTerms.every((term) => roadmap.includes(term)), requiredTerms.join(', ')),
  check('FFR04', 'master plan points to the final-form roadmap', masterPlan.includes('references/final-form-roadmap.md') && masterPlan.includes('Final Form Roadmap'), '.gse/gse-design-master-plan.md'),
  check('FFR05', 'goal map has an active final-form roadmap contract node', goalMap.includes('GSE-109') && goalMap.includes('final-form roadmap contract') && goalMap.includes('references/final-form-roadmap.md'), '.gse/goal-map.md'),
  check('FFR06', 'current slice continues from the final-form roadmap', currentSlice.includes('references/final-form-roadmap.md') && currentSlice.includes('final-form') && currentSlice.includes('Next Action'), '.gse/current-slice.md'),
  check('FFR07', 'state points to a current final-form execution slice and current evidence', stateHasCurrentEvidence, '.gse/state.json + .gse/evidence/index.jsonl'),
  check('FFR08', 'skill reference routing includes final-form roadmap', skill.includes('references/final-form-roadmap.md'), 'SKILL.md'),
  check('FFR09', 'roadmap contains ordered final-form execution waves', executionWaveTerms.every((term) => roadmap.includes(term)), executionWaveTerms.join(', ')),
  check('FFR10', 'roadmap separates current gaps from optional adapter claims', roadmap.includes('Current Final-Form Gap List') && roadmap.includes('host-native slash-command evidence is optional per host adapter') && roadmap.includes('no AION/MuseFlow-specific behavior is hardcoded'), 'references/final-form-roadmap.md'),
  check(
    'FFR11',
    'roadmap preserves process-skill versus host-capability boundary',
    roadmap.includes('GSE workflow artifacts define requirements') &&
      roadmap.includes('They do not provide native slash commands') &&
      roadmap.includes('Portable workflow artifacts do not satisfy host-native slash-command'),
    'references/final-form-roadmap.md',
  ),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { finalFormRoadmap: failed === 0 ? 'verified' : 'failed' },
  limits: [
    'This audit verifies the final-form roadmap contract and routing.',
    'It does not prove every final-form capability is complete.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Final Form Roadmap Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Final form roadmap: ' + data.workflows.finalFormRoadmap)
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
