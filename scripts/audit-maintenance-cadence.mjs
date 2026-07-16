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

const maintenance = read('references/maintenance-cadence.md')
const skill = read('SKILL.md')
const validationProfile = read('scripts/run-validation-profile.mjs')
const validator = read('scripts/validate-gse.mjs')
const commandRunner = read('scripts/run-gse-command.mjs')
const roadmap = read('references/final-form-roadmap.md')
const masterPlan = read('.gse/gse-design-master-plan.md')

const requiredAreas = [
  'Gap audit',
  'Drift audit',
  'Dependency and security review',
  'Forward test',
  'Target-project hardening drill',
  'Public acceptance doctor',
  'Installed skill sync',
  'Active session sync',
]

const requiredCommands = [
  'audit-final-form-roadmap.mjs',
  'audit-learning-drift.mjs',
  'audit-release-trust.mjs',
  'forward-test-gse.mjs',
  'audit-target-hardening-drills.mjs',
  'audit-public-acceptance-readiness.mjs',
  'audit-installed-sync.mjs',
  'audit-session-sync.mjs',
  'record-session-sync.mjs',
  'generate-maintenance-snapshot.mjs',
  'audit-maintenance-snapshot.mjs',
  'run-gse-command.mjs',
]

const scriptTargets = [
  'scripts/audit-final-form-roadmap.mjs',
  'scripts/audit-learning-drift.mjs',
  'scripts/audit-release-trust.mjs',
  'scripts/forward-test-gse.mjs',
  'scripts/audit-target-hardening-drills.mjs',
  'scripts/audit-public-acceptance-readiness.mjs',
  'scripts/audit-installed-sync.mjs',
  'scripts/audit-session-sync.mjs',
  'scripts/record-session-sync.mjs',
  'scripts/generate-maintenance-snapshot.mjs',
  'scripts/audit-maintenance-snapshot.mjs',
  'scripts/run-gse-command.mjs',
]

const checks = [
  check('MC01', 'maintenance cadence reference exists', exists('references/maintenance-cadence.md'), 'references/maintenance-cadence.md'),
  check('MC02', 'cadence covers all final-form upkeep areas', requiredAreas.every((term) => maintenance.includes(term)), requiredAreas.join(', ')),
  check('MC03', 'cadence maps each area to executable commands', requiredCommands.every((term) => maintenance.includes(term)), requiredCommands.join(', ')),
  check('MC04', 'cadence distinguishes recurring maintenance from external acceptance', maintenance.includes('not a substitute for native host evidence') && maintenance.includes('remaining external gates stay visible'), 'claim boundary'),
  check('MC05', 'all referenced maintenance scripts exist', scriptTargets.every((target) => exists(target)), scriptTargets.join(', ')),
  check('MC06', 'skill routing exposes maintenance cadence', skill.includes('references/maintenance-cadence.md') && skill.includes('audit-maintenance-cadence.mjs'), 'SKILL.md'),
  check('MC07', 'portable command runner exposes /gse maintenance snapshot route', commandRunner.includes('maintenance') && commandRunner.includes('generate-maintenance-snapshot.mjs'), 'scripts/run-gse-command.mjs'),
  check('MC08', 'validation profile includes maintenance cadence audit', validationProfile.includes('audit-maintenance-cadence.mjs'), 'scripts/run-validation-profile.mjs'),
  check('MC09', 'consolidated validator includes maintenance cadence audit', validator.includes('audit-maintenance-cadence.mjs'), 'scripts/validate-gse.mjs'),
  check('MC10', 'final-form roadmap tracks maintenance cadence as Wave 5 capability', roadmap.includes('Maintenance cadence') && roadmap.includes('audit-maintenance-cadence.mjs'), 'references/final-form-roadmap.md'),
  check('MC11', 'master plan current priority includes maintenance cadence evidence', masterPlan.includes('maintenance cadence') && masterPlan.includes('audit-maintenance-cadence.mjs'), '.gse/gse-design-master-plan.md'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    maintenanceCadence: failed === 0 ? 'verified' : 'failed',
    externalNativeSlashCommand: 'external-required',
  },
  limits: [
    'This audit verifies recurring maintenance coverage and command wiring.',
    'It does not prove a real host-native slash command, public CI run, marketplace approval, or owner acceptance.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Maintenance Cadence Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Maintenance cadence: ' + data.workflows.maintenanceCadence)
  lines.push('- External native slash command: ' + data.workflows.externalNativeSlashCommand)
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
