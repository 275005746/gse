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

function section(markdown, heading) {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === '## ' + heading)
  if (start === -1) return ''
  const body = []
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.startsWith('## ')) break
    body.push(line)
  }
  return body.join('\n').trim()
}

const requiredInputs = [
  'SKILL.md',
  '.gse/gse-design-master-plan.md',
  '.gse/goal-map.md',
  '.gse/current-slice.md',
  'references/forward-test.md',
  'references/evidence-taxonomy.md',
]

const skill = read('SKILL.md')
const masterPlan = read('.gse/gse-design-master-plan.md')
const goalMap = read('.gse/goal-map.md')
const currentSlice = read('.gse/current-slice.md')
const forwardTest = read('references/forward-test.md')
const taxonomy = read('references/evidence-taxonomy.md')

const outcome = section(currentSlice, 'Outcome')
const scope = section(currentSlice, 'Scope')
const acceptance = section(currentSlice, 'Acceptance')
const evidence = section(currentSlice, 'Evidence') || section(currentSlice, 'Evidence Plan')
const nextAction = section(currentSlice, 'Next Action')

const probePacketLines = [
  '# GSE Fresh-Session Probe Packet',
  '',
  'Purpose: verify whether a separate session can continue GSE development without hidden conversation history.',
  '',
  'Read these files in order:',
  ...requiredInputs.map((item) => '- ' + item),
  '',
  'Task for the fresh session:',
  '- Identify the active GSE slice from `.gse/current-slice.md`.',
  '- State outcome, scope, acceptance, evidence, risk, and next action.',
  '- Do not claim accepted unless a separate session actually ran the path or an explicit policy accepts it.',
  '- Do not invent subagent, MCP, LSP, browser, model, hook, or host support.',
  '',
  'Expected active slice:',
  outcome || '(missing)',
  '',
  'Expected next action:',
  nextAction || '(missing)',
  '',
  'Required response fields:',
  '- Forward-test level',
  '- Scenario',
  '- Changed behavior',
  '- Commands or inspection',
  '- Result evidence',
  '- Verification evidence',
  '- Accepted by',
  '- Residual risk',
  '- Next action',
]
const probePacket = probePacketLines.join('\n') + '\n'

const checks = [
  check('FS01', 'required startup inputs exist', requiredInputs.every(exists), requiredInputs.join(', ')),
  check('FS02', 'SKILL routes GSE changes through control and validation', skill.includes('references/router.md') && skill.includes('scripts/validate-gse.mjs') && skill.includes('references/forward-test.md'), 'SKILL.md'),
  check('FS03', 'master plan preserves fresh-session boundary after owner acceptance', masterPlan.includes('owner-approved AION project-write acceptance is executed') && (masterPlan.includes('fresh-session acceptance remains optional future confidence evidence') || masterPlan.includes('Marketplace discovery, public key custody, and cross-host native command execution remain final-form work') || masterPlan.includes('Marketplace discovery and real host UI invocation remain final-form work') || masterPlan.includes('Public marketplace approval, public registry publication, other host runtime invocation records, and host-native slash-command execution remain final-form work') || masterPlan.includes('Remaining final-form work is host-native slash-command support with real host runtime evidence.') || masterPlan.includes('The Final Form Roadmap now lives in `references/final-form-roadmap.md`')), '.gse/gse-design-master-plan.md'),
  check('FS04', 'goal map exposes active slice and next action without hidden history', goalMap.includes('- Active slice:') && goalMap.includes('- Next action:') && goalMap.includes('scripts/audit-fresh-session-readiness.mjs'), '.gse/goal-map.md'),
  check('FS05', 'current slice has required GSE fields', Boolean(outcome && scope && acceptance && evidence && nextAction), 'Outcome, Scope, Acceptance, Evidence or Evidence Plan, Next Action'),
  check('FS06', 'probe packet explicitly avoids false acceptance', probePacket.includes('Do not claim accepted unless a separate session actually ran the path or an explicit policy accepts it.'), 'generated probe packet'),
  check('FS07', 'forward-test protocol defines fresh-session acceptance rules', forwardTest.includes('Fresh-session forward test') && forwardTest.includes('accepted by: fresh-session') && forwardTest.includes('separate agent/session actually ran the path'), 'references/forward-test.md'),
  check('FS08', 'evidence taxonomy supports result verified accepted labels', taxonomy.includes('result -> verified -> accepted') && taxonomy.includes('Not enough for `accepted`'), 'references/evidence-taxonomy.md'),
  check('FS09', 'probe packet uses only documented inputs', requiredInputs.every((item) => probePacket.includes(item)) && probePacket.includes('without hidden conversation history'), 'generated probe packet'),
  check('FS10', 'probe packet asks for evidence taxonomy and residual risk', probePacket.includes('Accepted by') && probePacket.includes('Residual risk') && probePacket.includes('Do not claim accepted'), 'generated probe packet fields'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  level: 'fresh-session readiness probe',
  scenario: 'Prepare a separate-session GSE continuation packet using documented startup inputs.',
  changedBehavior: 'GSE now has a repeatable readiness check for fresh-session acceptance without overstating acceptance when no separate-session tool is available.',
  evidenceStatus: failed === 0 ? 'verified' : 'result',
  acceptedBy: 'not accepted; no separate-session tool was available to execute the probe in this run',
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { freshSessionReadiness: failed === 0 ? 'verified' : 'failed', freshSessionAcceptance: 'not accepted' },
  commandsOrInspection: [
    'Read documented startup inputs: ' + requiredInputs.join(', '),
    'Generate fresh-session probe packet from current slice and forward-test rules',
    'Verify accepted status is not claimed without a real separate-session run',
  ],
  probePacket,
  residualRisk: [
    'This readiness probe is not a true fresh-session run.',
    'The result cannot be marked accepted until a separate session, thread, or host-specific equivalent actually follows the packet.',
    'Host-specific thread/subagent tools must be verified before using them as acceptance evidence.',
  ],
  nextAction: 'When a separate-session or thread tool is available, run the probe packet and record accepted or failed evidence.',
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Fresh-Session Readiness Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Record')
  lines.push('')
  lines.push('- Forward-test level: ' + data.level)
  lines.push('- Scenario: ' + data.scenario)
  lines.push('- Changed behavior: ' + data.changedBehavior)
  lines.push('- Result evidence: probe packet generated from documented inputs')
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
  lines.push('## Probe Packet')
  lines.push('')
  lines.push('```text')
  lines.push(data.probePacket.trimEnd())
  lines.push('```')
  lines.push('')
  lines.push('## Residual Risk')
  lines.push('')
  for (const item of data.residualRisk) lines.push('- ' + item)
  return lines.join('\n') + '\n'
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(renderMarkdown(report))

if (failed > 0) process.exit(1)
