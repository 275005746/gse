#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const jsonOnly = args.includes('--json')

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function readText(relativePath) {
  const fullPath = path.join(root, relativePath)
  if (!fs.existsSync(fullPath)) return ''
  return fs.readFileSync(fullPath, 'utf8')
}

function runNode(script, commandArgs) {
  return spawnSync(process.execPath, [script, ...commandArgs], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const requiredDocs = [
  'SKILL.md',
  'references/router.md',
  'references/forward-test.md',
  'references/evidence-taxonomy.md',
  'examples/README.md',
]

const startupText = readText('SKILL.md')
const routerText = readText('references/router.md')
const forwardText = readText('references/forward-test.md')
const taxonomyText = readText('references/evidence-taxonomy.md')
const examplesText = readText('examples/README.md')

const smallAppTarget = path.join(root, 'examples', 'small-app')
const profileRun = runNode(path.join(root, 'scripts', 'discover-project-profile.mjs'), ['--target', smallAppTarget, '--json'])
const profile = profileRun.status === 0 ? parseJson(profileRun.stdout) : null
const frameworkSet = new Set(profile?.identity?.frameworks ?? [])
const toolStatuses = new Set((profile?.toolConnections ?? []).map((item) => item.status))

const codexAdapter = readText('examples/agent-runtime-host/.codex/gse-adapter.md')
const claudeAdapter = readText('examples/agent-runtime-host/.claude/gse-adapter.md')
const runtimeProfile = readText('examples/agent-runtime-host/.gse/project-profile.md')
const runtimeTooling = readText('examples/agent-runtime-host/.gse/tooling.md')
const modelRouting = readText('examples/agent-runtime-host/docs/model-routing.md')

const checks = [
  check('FT01', 'documented startup inputs exist', requiredDocs.every(exists), requiredDocs.join(', ')),
  check('FT02', 'SKILL startup routes GSE changes through validation', startupText.includes('scripts/validate-gse.mjs') && startupText.includes('references/router.md'), 'SKILL.md startup flow'),
  check('FT03', 'router exposes GSE self-development route', routerText.includes('GSE self-development') && routerText.includes('.gse/gse-design-master-plan.md') && routerText.includes('current-slice'), 'references/router.md'),
  check('FT04', 'forward-test protocol defines fixture versus fresh-session gates', forwardText.includes('Fixture forward test') && forwardText.includes('Fresh-session forward test') && forwardText.includes('accepted by: fresh-session'), 'references/forward-test.md'),
  check('FT05', 'evidence taxonomy distinguishes result verified accepted', taxonomyText.includes('result -> verified -> accepted') && taxonomyText.includes('Not enough for `accepted`'), 'references/evidence-taxonomy.md'),
  check('FT06', 'fixture docs forbid claiming fresh-session acceptance from fixture presence', examplesText.includes('do not claim fresh-session acceptance') && examplesText.includes('audit-fixtures.mjs'), 'examples/README.md'),
  check('FT07', 'small-app fixture profile discovery runs from documented command', profileRun.status === 0 && Boolean(profile), 'discover-project-profile.mjs --target examples/small-app --json'),
  check('FT08', 'small-app profile discovery detects representative app shape', frameworkSet.has('React') && frameworkSet.has('Vite') && frameworkSet.has('TypeScript') && frameworkSet.has('Playwright'), 'frameworks: ' + [...frameworkSet].join(', ')),
  check('FT09', 'small-app keeps configured tools documented not over-verified', toolStatuses.has('documented') && toolStatuses.has('unknown') && ![...(profile?.toolConnections ?? [])].some((item) => item.status === 'verified'), 'tool statuses: ' + [...toolStatuses].join(', ')),
  check('FT10', 'agent-runtime host adapters point back to .gse source of truth', codexAdapter.includes('Source of truth: `.gse/`.') && claudeAdapter.includes('Source of truth: `.gse/`.'), 'Codex and Claude adapter notes'),
  check('FT11', 'agent-runtime fixture avoids unsupported capability claims', runtimeProfile.includes('unknown') && runtimeTooling.includes('not verified') && modelRouting.includes('provider support from docs alone'), 'runtime profile/tooling/model routing status text'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  level: 'fixture forward test',
  scenario: 'Documented GSE startup plus small-app and agent-runtime-host fixture adoption',
  changedBehavior: 'Future agents can use SKILL.md, router, forward-test, evidence taxonomy, and fixtures without hidden author memory.',
  evidenceStatus: failed === 0 ? 'verified' : 'result',
  acceptedBy: 'not accepted; fresh-session acceptance requires a separate agent/session or explicit acceptance policy',
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  commandsOrInspection: [
    'Read SKILL.md, references/router.md, references/forward-test.md, references/evidence-taxonomy.md, examples/README.md',
    'Run node scripts/discover-project-profile.mjs --target examples/small-app --json',
    'Inspect examples/agent-runtime-host host adapters and tool/model status files',
  ],
  residualRisk: [
    'This is fixture-level verification, not a true fresh-session run.',
    'No package install, CI, browser, MCP, LSP, or external service was executed.',
    'Real repository adoption still needs a later smoke against an existing repo fixture or project.',
  ],
  nextAction: 'Add real-repo adoption smoke or run a true fresh-session forward test when a separate-session tool is available.',
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Forward Test')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Record')
  lines.push('')
  lines.push('- Forward-test level: ' + data.level)
  lines.push('- Scenario: ' + data.scenario)
  lines.push('- Changed behavior: ' + data.changedBehavior)
  lines.push('- Result evidence: documented inputs and fixture checks exist')
  lines.push('- Verification evidence: ' + data.summary.passed + '/' + data.summary.total + ' checks passed')
  lines.push('- Evidence status: ' + data.evidenceStatus)
  lines.push('- Accepted by: ' + data.acceptedBy)
  lines.push('- Next action: ' + data.nextAction)
  lines.push('')
  lines.push('## Checks')
  lines.push('')
  for (const item of data.checks) {
    const marker = item.status === 'passed' ? '[x]' : '[ ]'
    lines.push('- ' + marker + ' ' + item.id + ' ' + item.label + ': ' + item.evidence)
  }
  lines.push('')
  lines.push('## Residual Risk')
  lines.push('')
  for (const item of data.residualRisk) lines.push('- ' + item)
  return lines.join('\n') + '\n'
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(renderMarkdown(report))

if (failed > 0) process.exit(1)
