#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const jsonOnly = args.includes('--json')

function read(relativePath) {
  const absolutePath = path.join(root, relativePath)
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : ''
}

function check(id, label, passed, evidence, risk = '') {
  return { id, label, status: passed ? 'passed' : 'failed', evidence, risk }
}

function write(relativePath, content) {
  const absolutePath = path.join(currentFixture, relativePath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, content, 'utf8')
}

function createFixture(name, files) {
  currentFixture = fs.mkdtempSync(path.join(os.tmpdir(), `gse-stage-${name}-`))
  for (const [relativePath, content] of Object.entries(files)) write(relativePath, content)
  return currentFixture
}

function detect(target, intent) {
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts', 'detect-project-stage.mjs'),
    '--root', root,
    '--target', target,
    '--intent', intent,
    '--json',
  ], { cwd: root, encoding: 'utf8', windowsHide: true })
  let data = null
  try {
    data = JSON.parse((result.stdout ?? '').trim())
  } catch {
    data = null
  }
  return { status: result.status ?? 1, data, stderr: (result.stderr ?? '').trim() }
}

let currentFixture = ''
const emptyProduct = createFixture('empty-product', {
  'README.md': '# AI cover generator\n',
})
const existingImplementation = createFixture('existing-implementation', {
  'README.md': '# Existing app\n',
  'docs/product-roadmap.md': '# Roadmap\n\nTarget user: creators.\n',
  'docs/requirements.md': '# Requirements\n\n## Acceptance Criteria\n\n- User can create a project.\n',
  'docs/architecture.md': '# Architecture\n\n## Modules\n\nWeb and API.\n',
  '.gse/state.json': JSON.stringify({ phase: 'execute', currentSlice: { status: 'in-progress' } }, null, 2),
  'src/app.ts': 'export const app = true\n',
  'tests/app.test.ts': 'test("app", () => {})\n',
  'CHANGELOG.md': '# Release\n\nSmoke and rollback notes.\n',
})
const genericUi = createFixture('generic-ui', {
  'README.md': '# Dashboard\n',
  'docs/requirements.md': '# Requirements\n\n## Acceptance Criteria\n\n- Dashboard opens.\n',
  'src/page.tsx': 'export default function Page(){ return <main>Dashboard</main> }\n',
  'styles.css': 'body { background: linear-gradient(#111, #222); }\n',
})
const adoptingProject = createFixture('adopting-project', {
  'docs/product-roadmap.md': '# Roadmap\n\nTarget user: creators.\n',
  'docs/requirements.md': '# Requirements\n\n## Acceptance Criteria\n\n- Existing workflow remains usable.\n',
  '.gse/state.json': JSON.stringify({ phase: 'adopt', currentSlice: { status: 'in-progress' } }, null, 2),
  '.gse/evidence/2026-07-13.md': '# Adoption evidence\n',
  'CHANGELOG.md': '# Changelog\n\n## Release\n',
})

const emptyResult = detect(emptyProduct, 'Build a profitable AI cover generator tonight')
const existingResult = detect(existingImplementation, 'Continue the existing project without restarting it')
const uiResult = detect(genericUi, 'Finish this product and declare it complete')
const gseResult = detect(root, 'Continue GSE skill development')
const adoptingResult = detect(adoptingProject, 'Continue adopting GSE into this existing project')

const precedenceProject = createFixture('approved-stage-precedence', {
  'README.md': '# Existing app\n',
  'docs/requirements.md': '# Requirements\n\n## Acceptance Criteria\n\n- App remains usable.\n',
  '.gse/state.json': JSON.stringify({ phase: 'execute', currentSlice: { status: 'in-progress' } }, null, 2),
  '.gse/evidence/verification.md': '# Verification\n\nAcceptance smoke passed.\n',
  'CHANGELOG.md': '# Release\n\nSmoke and rollback notes.\n',
  'src/app.ts': 'export const app = true\n',
  'tests/app.test.ts': 'test("app", () => {})\n',
})
const precedenceResult = detect(precedenceProject, 'Continue the approved implementation slice')

const reference = read('references/stage-orchestrator.md')
const skill = read('SKILL.md')
const router = read('references/router.md')
const qualityGates = read('references/quality-gates.md')
const roles = read('references/agent-roles.md')
const matrix = read('references/capability-execution-matrix.md')
const validationProfile = read('scripts/run-validation-profile.mjs')
const validator = read('scripts/validate-gse.mjs')
const continuePacket = read('scripts/generate-continue-packet.mjs')
const commandRunner = read('scripts/run-gse-command.mjs')
const commandsReference = read('references/commands.md')

const stages = ['intake', 'opportunity', 'requirements', 'design', 'architecture', 'planning', 'implementation', 'verification', 'release', 'learning']
const outputFields = ['current_stage', 'stage_basis', 'missing_artifacts', 'required_references', 'role_route', 'evidence_gate', 'next_stage', 'decision']

const checks = [
  check('SO01', 'stage orchestrator reference exists', Boolean(reference), 'references/stage-orchestrator.md'),
  check('SO02', 'stage model covers the complete delivery lifecycle', stages.every((stage) => reference.includes(`\`${stage}\``)), stages.join(', ')),
  check('SO03', 'orchestrator exposes advisory-only precedence when persisted stage conflicts with heuristics', /advisory|approved.*wins|conflict/i.test(reference) && /state.*hint|hint.*state/i.test(reference), 'stage precedence contract'),
  check('SO04', 'orchestrator loads only current-stage references', /only.*current stage|current-stage.*only/i.test(reference) && /do not load every|must not load every/i.test(reference), 'progressive disclosure rule'),
  check('SO05', 'stage output contract is machine-scannable', outputFields.every((field) => reference.includes(field)), outputFields.join(', ')),
  check('SO06', 'opportunity gate blocks coding-first product shells', /opportunity gate/i.test(reference) && /target user/i.test(reference) && /comparable|alternative/i.test(reference) && /go\/no-go/i.test(reference), 'product value gate'),
  check('SO07', 'design gate requires design inputs and visible-state quality', /design gate/i.test(reference) && /design input/i.test(reference) && /empty.*loading.*error.*success/is.test(reference) && /responsive/i.test(reference), 'design quality gate'),
  check('SO08', 'product completion rejects demo-shell evidence', /demo shell|demo-shell/i.test(reference) && /not.*complete/i.test(reference) && /browser|runtime/i.test(reference), 'product completion gate'),
  check('SO09', 'worker results remain provisional until evidence passes', /provisional/i.test(reference) && /evidence gate/i.test(reference) && /loop_back/i.test(reference), 'worker/evidence rule'),
  check('SO10', 'roles map to stages with sequential fallback', /Product Analyst/i.test(reference) && /Architect/i.test(reference) && /Builder/i.test(reference) && /Verifier|QA/i.test(reference) && /sequential/i.test(reference), 'stage role routes'),
  check('SO11', 'existing projects resume from evidence instead of restarting', /existing project/i.test(reference) && /do not restart|without restarting/i.test(reference) && /earliest missing|first unmet/i.test(reference), 'mid-project adoption rule'),
  check('SO12', 'SKILL and router make stage orchestration the meaningful-work entry', skill.includes('references/stage-orchestrator.md') && router.includes('stage-orchestrator.md'), 'SKILL.md + references/router.md'),
  check('SO13', 'quality gates and agent roles link back to stage control', qualityGates.includes('stage-orchestrator.md') && roles.includes('stage-orchestrator.md'), 'quality-gates.md + agent-roles.md'),
  check('SO14', 'capability matrix governs stage orchestration', matrix.includes('Stage orchestration and progressive disclosure') && matrix.includes('audit-stage-orchestrator.mjs'), 'capability-execution-matrix.md'),
  check('SO15', 'empty product routes before implementation', emptyResult.status === 0 && ['intake', 'opportunity'].includes(emptyResult.data?.current_stage) && emptyResult.data?.decision !== 'complete', JSON.stringify(emptyResult.data), emptyResult.stderr),
  check('SO16', 'existing half-built project resumes implementation without restarting', existingResult.status === 0 && existingResult.data?.current_stage === 'implementation' && existingResult.data?.approved_stage === 'implementation' && existingResult.data?.stage_decision === 'approved-state-wins', JSON.stringify(existingResult.data), existingResult.stderr),
  check('SO17', 'generic UI cannot pass as complete without design evidence', uiResult.status === 0 && uiResult.data?.current_stage === 'design' && ['loop_back', 'block'].includes(uiResult.data?.decision), JSON.stringify(uiResult.data), uiResult.stderr),
  check('SO18', 'stage detector returns bounded references and gate fields', [emptyResult, existingResult, uiResult].every(({ data }) => Array.isArray(data?.required_references) && data.required_references.length > 0 && data.required_references.length <= 6 && data?.evidence_gate && data?.next_stage), 'three stage fixtures'),
  check('SO19', 'stage audit is wired into focused and consolidated validation', validationProfile.includes('audit-stage-orchestrator.mjs') && validator.includes('audit-stage-orchestrator.mjs'), 'validation wiring'),
  check('SO20', 'continue packet carries current-stage advice', continuePacket.includes('projectStage') && continuePacket.includes('detect-project-stage.mjs'), 'scripts/generate-continue-packet.mjs'),
  check('SO21', 'portable stage command exposes stage advice', commandRunner.includes("stage: {") && commandRunner.includes("verb === 'stage'") && commandsReference.includes('/gse stage'), 'run-gse-command.mjs + commands.md'),
  check('SO22', 'isolated UI-like files do not misroute a non-UI project', gseResult.status === 0 && gseResult.data?.current_stage !== 'design', JSON.stringify(gseResult.data), gseResult.stderr),
  check('SO23', 'adoption state without implementation does not jump to learning', adoptingResult.status === 0 && adoptingResult.data?.current_stage === 'intake', JSON.stringify(adoptingResult.data), adoptingResult.stderr),
  check('SO24', 'approved persisted stage wins over verification or release heuristics', precedenceResult.status === 0 && precedenceResult.data?.approved_stage === 'implementation' && precedenceResult.data?.current_stage === 'implementation' && precedenceResult.data?.stage_decision === 'approved-state-wins' && precedenceResult.data?.stage_conflict === true && ['verification', 'release'].includes(precedenceResult.data?.detected_stage) && precedenceResult.data?.lifecycle_stage === 'build' && precedenceResult.data?.required_references?.includes('operating-model.md'), JSON.stringify(precedenceResult.data), precedenceResult.stderr),
]

const failed = checks.filter((item) => item.status === 'failed').length
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed: checks.length - failed, failed, total: checks.length },
  workflows: { stageOrchestrator: failed === 0 ? 'verified' : 'incomplete' },
  fixtures: {
    emptyProduct: emptyResult.data,
    existingImplementation: existingResult.data,
    genericUi: uiResult.data,
    gseSkill: gseResult.data,
    adoptingProject: adoptingResult.data,
  precedenceProject: precedenceResult.data,
  },
  checks,
  limits: [
    'This audit verifies deterministic stage advice, routing contracts, and gate coverage with fixtures.',
    'Stage advice remains an agent input; project rules and directly inspected evidence can override a heuristic result when the basis is recorded.',
    'Fixture success does not prove a target product is useful, visually strong, deployed, or accepted by users.',
  ],
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else {
  console.log(`# Stage Orchestrator Audit\n\nStatus: ${report.summary.status}\nChecks: ${report.summary.passed}/${report.summary.total}`)
  for (const item of checks) console.log(`${item.status === 'passed' ? '[x]' : '[ ]'} ${item.id} ${item.label}`)
}

if (failed > 0) process.exit(1)
