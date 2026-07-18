#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { mapLegacyStage } from './core/lifecycle.mjs'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1] ?? fallback
}

const target = path.resolve(readArg('--target', process.cwd()))
const intent = readArg('--intent', '')
const jsonOnly = args.includes('--json')
const ignoredDirectories = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', '.next', 'coverage', '.cache', '.turbo'])
const textExtensions = new Set(['.md', '.mdx', '.txt', '.json', '.jsonl', '.yaml', '.yml', '.toml', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.kt', '.cs', '.html', '.css', '.scss', '.vue', '.svelte', '.sql'])
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.kt', '.cs', '.html', '.css', '.scss', '.vue', '.svelte'])
const stages = ['intake', 'opportunity', 'requirements', 'design', 'architecture', 'planning', 'implementation', 'verification', 'release', 'learning']

function walk(directory, relative = '', output = []) {
  if (output.length >= 4000 || !fs.existsSync(directory)) return output
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
    const relativePath = relative ? `${relative}/${entry.name}` : entry.name
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(absolutePath, relativePath, output)
    else output.push(relativePath.replaceAll('\\', '/'))
    if (output.length >= 4000) break
  }
  return output
}

function readText(relativePath, maxBytes = 160000) {
  const absolutePath = path.join(target, relativePath)
  try {
    const size = fs.statSync(absolutePath).size
    if (size > maxBytes || !textExtensions.has(path.extname(relativePath).toLowerCase())) return ''
    return fs.readFileSync(absolutePath, 'utf8')
  } catch {
    return ''
  }
}

function parseState() {
  try {
    return JSON.parse(fs.readFileSync(path.join(target, '.gse', 'state.json'), 'utf8'))
  } catch {
    return null
  }
}

function pathsMatching(files, pattern) {
  return files.filter((file) => pattern.test(file))
}

function anyContent(files, pattern) {
  return files.some((file) => pattern.test(readText(file)))
}

function mappedStatePhase(phase) {
  const value = String(phase ?? '').toLowerCase()
  if (/adopt|bootstrap|discover|intake/.test(value)) return 'intake'
  if (/opportunity|research|market/.test(value)) return 'opportunity'
  if (/requirement|spec|proposal/.test(value)) return 'requirements'
  if (/ux|ui|design/.test(value)) return 'design'
  if (/architect/.test(value)) return 'architecture'
  if (/plan/.test(value)) return 'planning'
  if (/execute|build|implement/.test(value)) return 'implementation'
  if (/verify|review|test|qa/.test(value)) return 'verification'
  if (/release|ship|deploy|final-form/.test(value)) return 'release'
  if (/learn|operate|monitor/.test(value)) return 'learning'
  return null
}

const files = walk(target)
const state = parseState()
const markdownFiles = files.filter((file) => /\.mdx?$/i.test(file))
const sourceFiles = files.filter((file) => sourceExtensions.has(path.extname(file).toLowerCase()) && !/(^|\/)(tests?|spec|examples?|fixtures?)(\/|$)/i.test(file))
const testFiles = pathsMatching(files, /(^|\/)(tests?|specs?|__tests__)(\/|$)|\.(test|spec)\.[^.]+$/i)
const uiFiles = pathsMatching(sourceFiles, /(^|\/)(app|pages?|components?|views?|screens?|ui)(\/|$)|\.(tsx|jsx|vue|svelte|html|css|scss)$/i)
const backendFiles = pathsMatching(sourceFiles, /(^|\/)(api|server|backend|workers?|queues?|db|database|migrations?)(\/|$)|\.(sql)$/i)
const opportunityDocs = pathsMatching(markdownFiles, /(opportunity|market|competitor|validation|product-brief|business-case)/i)
const requirementDocs = pathsMatching(markdownFiles, /(requirements?|prd|spec|proposal|user-stor|acceptance)/i)
const designDocs = pathsMatching(files, /(design-system|design-direction|visual-direction|wireframe|mockup|prototype|user-flow|ux|ui-spec)/i)
const architectureDocs = pathsMatching(markdownFiles, /(architecture|adr|decision-record|system-design|technical-design|contracts?)/i)
const planningDocs = pathsMatching(markdownFiles, /(^|\/)(tasks?|plans?|implementation-plan|current-slice)\b|(^|\/)tasks?\.md$/i)
const screenshotFiles = pathsMatching(files, /(^|\/)(screenshots?|visual-evidence|browser-evidence)(\/|$)|\.(png|jpe?g|webp)$/i)
const releaseFiles = pathsMatching(files, /(^|\/)(releases?|deploy|deployment)(\/|$)|CHANGELOG\.md$|release-notes/i)
const evidenceFiles = pathsMatching(files, /(^|\/)\.gse\/evidence\/|verification-report|qa-report|test-report/i)
const uiShare = sourceFiles.length ? uiFiles.length / sourceFiles.length : 0
const backendShare = sourceFiles.length ? backendFiles.length / sourceFiles.length : 0
const wantsUi = /\b(ui|ux|frontend|page|website|dashboard)\b|界面|页面|前端|网站/i.test(intent) || (uiFiles.length >= 2 && uiShare >= 0.1)
const wantsBackend = /\b(api|backend|server|database|worker|queue)\b|后端|接口|数据库/i.test(intent) || (backendFiles.length >= 2 && backendShare >= 0.1)
const wantsProduct = /\b(product|app|tool|saas|mvp|generator)\b|赚钱|产品|应用|工具|小程序/i.test(intent)
const productFraming = anyContent(markdownFiles, /target user|audience|user outcome|用户|受众|目标人群|problem|pain|痛点/i)
const opportunityEvidence = opportunityDocs.length > 0 && anyContent(opportunityDocs, /target user|problem|pain|alternative|comparable|competitor|go\/no-go|用户|痛点|竞品|替代/i)
const requirementEvidence = requirementDocs.length > 0 && anyContent(requirementDocs, /acceptance criteria|in scope|out of scope|user stor|验收|范围|非目标/i)
const designEvidence = designDocs.length > 0 && anyContent(designDocs.filter((file) => textExtensions.has(path.extname(file).toLowerCase())), /visual|direction|layout|typography|responsive|empty|loading|error|success|视觉|方向|布局|响应式/i)
const architectureEvidence = architectureDocs.length > 0 && anyContent(architectureDocs, /module|boundary|contract|data flow|interface|risk|模块|边界|契约|数据流/i)
const planningEvidence = planningDocs.length > 0 || Boolean(state?.currentSlice?.nextAction)
const implementationEvidence = sourceFiles.length > 0
const verificationEvidence = testFiles.length > 0 && evidenceFiles.length > 0
const releaseEvidence = releaseFiles.length > 0 && anyContent(releaseFiles.filter((file) => textExtensions.has(path.extname(file).toLowerCase())), /smoke|rollback|published|deployed|release|回滚|发布/i)
const stateStage = mappedStatePhase(state?.phase)

let detectedStage = 'intake'
let detectedDecision = 'proceed'
const missingArtifacts = []
const stageBasis = []

if (stateStage) stageBasis.push(`state phase maps to ${stateStage}`)
if (implementationEvidence) stageBasis.push(`${sourceFiles.length} implementation file(s) discovered`)
if (testFiles.length) stageBasis.push(`${testFiles.length} test file(s) discovered`)

if (!productFraming && !implementationEvidence) {
  detectedStage = 'intake'
  missingArtifacts.push('project brief with outcome, target user, constraints, and non-goals')
} else if ((wantsProduct || !implementationEvidence) && !opportunityEvidence && !implementationEvidence) {
  detectedStage = 'opportunity'
  missingArtifacts.push('opportunity brief with user pain, alternatives, differentiation, success metric, and go/no-go')
} else if (!requirementEvidence) {
  detectedStage = 'requirements'
  detectedDecision = implementationEvidence ? 'loop_back' : 'proceed'
  missingArtifacts.push('testable requirements with scope, non-goals, workflows, edge cases, and acceptance criteria')
} else if (wantsUi && !designEvidence) {
  detectedStage = 'design'
  detectedDecision = implementationEvidence ? 'loop_back' : 'proceed'
  missingArtifacts.push('design direction with selected design inputs and adapted patterns')
  missingArtifacts.push('UX state map covering empty, loading, error, success, and responsive behavior')
} else if (wantsBackend && !architectureEvidence) {
  detectedStage = 'architecture'
  detectedDecision = implementationEvidence ? 'loop_back' : 'proceed'
  missingArtifacts.push('architecture and contract decision covering boundaries, data flow, risks, and recovery')
} else if (!planningEvidence && !implementationEvidence) {
  detectedStage = 'planning'
  missingArtifacts.push('ordered implementation plan with Definition of Done and evidence per task')
} else if (implementationEvidence && !verificationEvidence) {
  detectedStage = testFiles.length ? 'verification' : 'implementation'
  missingArtifacts.push(testFiles.length ? 'verification report tied to acceptance criteria' : 'focused tests for the active implementation slice')
  if (wantsUi && !screenshotFiles.length) missingArtifacts.push('browser or screenshot evidence for visible behavior')
} else if (!releaseEvidence && verificationEvidence) {
  detectedStage = 'release'
  missingArtifacts.push('release artifact, smoke result, known risks, and rollback or recovery note')
} else if (releaseEvidence) {
  detectedStage = 'learning'
  missingArtifacts.push('operations feedback and reusable learning record')
}

const approvedStage = stateStage
const advisoryStage = releaseEvidence
  ? 'release'
  : verificationEvidence
    ? 'verification'
    : detectedStage
const stageConflict = Boolean(approvedStage && approvedStage !== advisoryStage)
const currentStage = approvedStage ?? advisoryStage
const decision = approvedStage ? 'approved-state-wins' : detectedDecision
const nextStage = stages[Math.min(stages.indexOf(currentStage) + 1, stages.length - 1)]
const lifecycle = mapLegacyStage(currentStage)
const routes = {
  intake: ['stage-orchestrator.md', 'project-bootstrap.md', 'project-profile.md'],
  opportunity: ['stage-orchestrator.md', 'goal-map.md', 'spec-workflow.md'],
  requirements: ['stage-orchestrator.md', 'spec-workflow.md', 'quality-gates.md'],
  design: ['stage-orchestrator.md', 'frontend-delivery-pack.md', 'quality-gates.md'],
  architecture: ['stage-orchestrator.md', 'architecture-health.md', 'backend-data-delivery-pack.md', 'quality-gates.md'],
  planning: ['stage-orchestrator.md', 'task-levels.md', 'spec-workflow.md', 'agent-roles.md'],
  implementation: ['stage-orchestrator.md', 'operating-model.md', 'tool-adapters.md', 'quality-gates.md'],
  verification: ['stage-orchestrator.md', 'review-router.md', 'acceptance-scenarios.md', 'quality-gates.md'],
  release: ['stage-orchestrator.md', 'release.md', 'quality-gates.md'],
  learning: ['stage-orchestrator.md', 'learning-system.md', 'drift-audit.md'],
}
const roles = {
  intake: ['Coordinator', 'Planner'],
  opportunity: ['Product Analyst', 'Planner'],
  requirements: ['Product Analyst', 'Planner'],
  design: ['Product Analyst', 'Builder', 'QA'],
  architecture: ['Architect', 'Reviewer'],
  planning: ['Planner', 'Architect'],
  implementation: ['Code Locator', 'Builder', 'Verifier'],
  verification: ['Verifier', 'Reviewer', 'QA'],
  release: ['Release', 'Docs/Evidence'],
  learning: ['Coordinator', 'Docs/Evidence'],
}
const gates = {
  intake: 'Goal, user, constraints, current evidence, and entry decision are explicit.',
  opportunity: 'User pain, alternatives, differentiation, success metric, and go/no-go are evidenced.',
  requirements: 'Every core workflow has testable acceptance criteria, edge cases, and non-goals.',
  design: 'Selected design inputs, user flow, responsive rules, and visible states are reviewed before UI completion.',
  architecture: 'Boundaries, contracts, data flow, risks, and recovery are testable.',
  planning: 'Tasks are ordered, bounded, independently verifiable, and carry evidence requirements.',
  implementation: 'The bounded slice follows the accepted spec and passes focused checks.',
  verification: 'Acceptance criteria pass with the evidence level required by each claim.',
  release: 'The intended user can use the shipped artifact; smoke and rollback evidence exist.',
  learning: 'Feedback and failures become bounded improvements, not unverified process claims.',
}

const report = {
  schemaVersion: 1,
  target,
  intent,
  current_stage: currentStage,
  detected_stage: advisoryStage,
  approved_stage: approvedStage,
  stage_decision: decision,
  stage_conflict: stageConflict,
  lifecycle_stage: lifecycle.stage,
  lifecycle_concern: lifecycle.concern,
  stage_basis: stageBasis.length ? stageBasis : ['repository contains no corroborating lifecycle evidence'],
  missing_artifacts: missingArtifacts,
  required_references: routes[currentStage],
  role_route: roles[currentStage],
  evidence_gate: gates[currentStage],
  next_stage: nextStage,
  decision,
  confidence: approvedStage ? (stageConflict ? 'advisory-conflict' : 'high') : (currentStage === 'intake' ? 'high' : 'medium'),
  risk_flags: [
    ...(wantsUi ? ['ui'] : []),
    ...(wantsBackend ? ['api-or-data'] : []),
    ...(wantsProduct && !opportunityEvidence ? ['unvalidated-product-value'] : []),
    ...(implementationEvidence && !verificationEvidence ? ['unverified-implementation'] : []),
  ],
  observed: {
    files: files.length,
    sourceFiles: sourceFiles.length,
    testFiles: testFiles.length,
    uiFiles: uiFiles.length,
    backendFiles: backendFiles.length,
    statePhase: state?.phase ?? null,
    evidenceFiles: evidenceFiles.length,
    screenshots: screenshotFiles.length,
  },
  limits: [
    'This is deterministic stage advice, not an automatic completion claim.',
    'The agent must inspect the cited evidence before acting and record why any override is safer.',
    'Only the returned current-stage references should be loaded initially; add another reference only for a named risk or failed gate.',
  ],
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else {
  console.log(`Current stage: ${report.current_stage}`)
  console.log(`Decision: ${report.decision}`)
  console.log(`Next stage: ${report.next_stage}`)
  console.log(`Required references: ${report.required_references.join(', ')}`)
}
