#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
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

function run(script, commandArgs) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...commandArgs], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    command: [process.execPath, path.join(root, 'scripts', script), ...commandArgs].join(' '),
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
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

function fixture(invalidEvidence = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-continue-audit-'))
  fs.mkdirSync(path.join(dir, '.gse', 'evidence'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.gse', 'maintenance'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'references'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.gse', 'README.md'), '# GSE\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'project-profile.md'), '# Project Profile\n\n- Product/system name: Continue Fixture\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'goal-map.md'), '# Goal Map\n\n- Active slice: Continue fixture.\n- Next action: Run continue audit.\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'quality-gates.md'), '# Quality Gates\n\n- Evidence required.\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'session-sync.jsonl'), '', 'utf8')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { 'check:encoding': 'node scripts/check-encoding.mjs' } }, null, 2) + '\n', 'utf8')
  fs.writeFileSync(path.join(dir, 'scripts', 'run-gse-command.mjs'), '#!/usr/bin/env node\n', 'utf8')
  fs.writeFileSync(path.join(dir, 'references', 'final-readiness.md'), '# Final Readiness\n', 'utf8')
  fs.writeFileSync(path.join(dir, 'docs', 'productization-architecture.md'), '# Productization\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'state.json'), JSON.stringify({
    schemaVersion: 1,
    projectName: 'continue-fixture',
    mode: 'standard',
    canonicalPlan: 'docs/productization-architecture.md',
    phase: 'execute',
    currentSlice: {
      id: 'continue-fixture',
      outcome: 'Continue fixture.',
      status: 'planned',
      nextAction: 'Run continue audit.',
    },
    toolStatuses: {
      browser: 'unknown',
      lsp: 'unknown',
      mcp: 'unknown',
      subagents: 'unknown',
      ci: 'unknown',
    },
    lastEvidence: '.gse/evidence/2026-07-08.md',
    residualRisks: ['risk one', 'risk two', 'risk three', 'risk four'],
    riskArchive: [
      {
        archivedAt: '2026-07-08',
        risk: 'archived risk',
        resolution: 'fixture resolution',
      },
    ],
  }, null, 2) + '\n', 'utf8')
  fs.writeFileSync(
    path.join(dir, '.gse', 'evidence', 'index.jsonl'),
    invalidEvidence
      ? '{"date":"2026-07-08"\n'
      : JSON.stringify({
        date: '2026-07-08',
        recordType: 'slice',
        status: 'verified',
        evidenceLevel: 'verified-unit',
        requiredEvidenceLevel: 'verified-unit',
        summary: 'Continue fixture evidence.',
        evidenceFile: '.gse/evidence/2026-07-08.md',
        commands: ['fixture'],
        nextAction: 'Run continue audit.',
      }) + '\n',
    'utf8',
  )
  fs.writeFileSync(path.join(dir, '.gse', 'evidence', '2026-07-08.md'), '# Evidence\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'maintenance', 'latest-maintenance-snapshot.json'), JSON.stringify({
    schemaVersion: 1,
    root: dir,
    target: dir,
    installedRoot: null,
    generatedAt: '2026-07-08T00:00:00.000Z',
    summary: {
      status: 'passed',
      passed: 9,
      failed: 0,
      total: 9,
      installedSyncMode: 'package-only',
      releaseBundleChecked: false,
    },
    workflows: {
      maintenanceSnapshot: 'verified',
      installedSync: 'package-only',
      releaseBundleFreshness: 'skipped',
    },
    results: [],
  }, null, 2) + '\n', 'utf8')
  spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8', windowsHide: true })
  return dir
}

function externalRiskHistoryFixture() {
  const dir = fixture(false)
  const statePath = path.join(dir, '.gse', 'state.json')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  delete state.riskArchive
  state.stateRevision = 4
  state.activeChangeId = null
  state.riskHistoryPath = '.gse/risk-history.jsonl'
  state.archivedRiskCount = 2
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8')
  fs.writeFileSync(
    path.join(dir, '.gse', 'risk-history.jsonl'),
    [
      {
        schemaVersion: 1,
        eventId: 'risk-history-one',
        transactionId: null,
        recordType: 'risk-history',
        riskId: 'risk-history-one',
        deduplicationKey: `sha256:${'1'.repeat(64)}`,
        risk: 'historical ledger secret one',
        sourceRevision: 3,
        archivedAt: '2026-07-08T00:00:00.000Z',
        resolution: 'fixture archive',
        stateRevision: 4,
      },
      {
        schemaVersion: 1,
        eventId: 'risk-history-two',
        transactionId: null,
        recordType: 'risk-history',
        riskId: 'risk-history-two',
        deduplicationKey: `sha256:${'2'.repeat(64)}`,
        risk: 'historical ledger secret two',
        sourceRevision: 3,
        archivedAt: '2026-07-08T00:00:00.000Z',
        resolution: 'fixture archive',
        stateRevision: 4,
      },
    ].map((record) => JSON.stringify(record)).join('\n') + '\n',
    'utf8',
  )
  return dir
}

function verifiedSliceFixture() {
  const dir = fixture(false)
  const statePath = path.join(dir, '.gse', 'state.json')
  const goalMapPath = path.join(dir, '.gse', 'goal-map.md')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  state.currentSlice.status = 'verified'
  state.currentSlice.nextAction = 'Open the next fixture slice with a deliberately long machine-readable reason that should remain available to successor agents even when the display reason is compacted for the short entry prompt and JSON packet overview.'
  state.residualRisks = [
    'A deliberately long actionable risk should become the first next-slice candidate when the current next action is only a meta instruction, because successor agents need concrete work instead of a process reminder.',
  ]
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8')
  fs.writeFileSync(goalMapPath, '# Goal Map\n\n- Active slice: Continue fixture verified.\n- Next action: Open the next fixture slice with a deliberately long machine-readable reason that should remain available to successor agents even when the display reason is compacted for the short entry prompt and JSON packet overview.\n', 'utf8')
  return dir
}

function productDriftFixture() {
  const dir = fixture(false)
  const statePath = path.join(dir, '.gse', 'state.json')
  const goalMapPath = path.join(dir, '.gse', 'goal-map.md')
  const indexPath = path.join(dir, '.gse', 'evidence', 'index.jsonl')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  state.currentSlice.status = 'verified'
  state.currentSlice.outcome = 'Response-inspection decision provenance continuity.'
  state.currentSlice.nextAction = 'Continue downstream provenance boundary hardening for the next handoff layer.'
  state.residualRisks = []
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8')
  fs.writeFileSync(goalMapPath, '# Goal Map\n\n- Active slice: Internal provenance verified.\n- Next action: Continue downstream provenance boundary hardening for the next handoff layer.\n', 'utf8')
  const records = [1, 2, 3, 4].map((index) => ({
    date: '2026-07-08',
    recordType: 'slice',
    status: 'verified',
    evidenceLevel: 'verified-component',
    requiredEvidenceLevel: 'verified-component',
    summary: `Internal provenance boundary handoff continuity ${index}.`,
    evidenceFile: '.gse/evidence/2026-07-08.md',
    commands: ['focused component store test'],
    nextAction: 'Continue downstream provenance boundary hardening.',
  }))
  fs.writeFileSync(indexPath, records.map((record) => JSON.stringify(record)).join('\n') + '\n', 'utf8')
  return dir
}

function productVisibleFixture() {
  const dir = fixture(false)
  const statePath = path.join(dir, '.gse', 'state.json')
  const indexPath = path.join(dir, '.gse', 'evidence', 'index.jsonl')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  state.currentSlice.status = 'verified'
  state.currentSlice.outcome = 'Provider API workflow now returns a visible generation result.'
  state.currentSlice.nextAction = 'Open the next user-visible export workflow slice.'
  state.currentSlice.userVisibleDelta = 'Users can run the provider workflow and see a generated result or actionable failure state.'
  state.residualRisks = []
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8')
  const records = [
    {
      date: '2026-07-08',
      recordType: 'slice',
      status: 'verified',
      evidenceLevel: 'verified-api',
      requiredEvidenceLevel: 'verified-api',
      summary: 'Provider API workflow smoke returned a visible result payload.',
      userVisibleDelta: 'Users can run the provider workflow and see a generated result or actionable failure state.',
      evidenceFile: '.gse/evidence/2026-07-08.md',
      commands: ['provider workflow API smoke'],
      nextAction: 'Open the next user-visible export workflow slice.',
    },
  ]
  fs.writeFileSync(indexPath, records.map((record) => JSON.stringify(record)).join('\n') + '\n', 'utf8')
  return dir
}

function boundedSupportFixture() {
  const dir = productDriftFixture()
  const statePath = path.join(dir, '.gse', 'state.json')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  state.currentSlice.supportSliceBoundary = 'Repair only the malformed evidence index, then return to a user-visible export workflow slice.'
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8')
  return dir
}

function bloatedCanonicalFixture() {
  const dir = fixture(false)
  const canonicalPath = path.join(dir, 'docs', 'productization-architecture.md')
  const landedRows = Array.from({ length: 80 }, (_, index) => [
    `- Already landed slice ${index + 1}: internal evidence/preflight/readback boundary was verified.`,
    `- Evidence: focused component smoke and .gse/evidence/2026-07-08.md record for slice ${index + 1}.`,
    `- Next action: continue the next slice ledger instead of changing product intent.`,
  ].join('\n')).join('\n')
  fs.writeFileSync(canonicalPath, [
    '# Productization Architecture',
    '',
    '## Durable Product Intent',
    '',
    'This section is intentionally short.',
    '',
    '## Already Landed',
    '',
    landedRows,
    '',
    '## Current Priority',
    '',
    '- Current focus: preflight evidence ledger hygiene.',
    '',
    '## Next Slice',
    '',
    '- Next action: move ledger details into .gse/goal-map.md and .gse/evidence/.',
    '',
  ].join('\n'), 'utf8')
  return dir
}

function appStyleProductFixture() {
  const dir = fixture(false)
  const statePath = path.join(dir, '.gse', 'state.json')
  const packagePath = path.join(dir, 'package.json')
  const docPath = path.join(dir, 'docs', 'productization-architecture.md')
  const indexPath = path.join(dir, '.gse', 'evidence', 'index.jsonl')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  state.projectName = 'fixture-ai-film-app'
  state.currentSlice.status = 'verified'
  state.currentSlice.outcome = 'Internal provenance evidence boundary.'
  state.currentSlice.nextAction = 'Continue preflight and evidence index hardening.'
  state.residualRisks = []
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8')
  fs.writeFileSync(packagePath, JSON.stringify({ name: '@fixture/ai-film-package', description: 'Desktop AI film productization app package.' }, null, 2) + '\n', 'utf8')
  fs.writeFileSync(docPath, '# AI Film Productization Architecture\n\nUser workflow, canvas execution, provider result, export, and browser-visible failure states.\n', 'utf8')
  const records = [1, 2, 3, 4].map((index) => ({
    date: '2026-07-08',
    recordType: 'slice',
    status: 'verified',
    evidenceLevel: 'verified-component',
    requiredEvidenceLevel: 'verified-component',
    summary: `Internal provenance boundary ${index}.`,
    evidenceFile: '.gse/evidence/2026-07-08.md',
    commands: ['component smoke'],
    nextAction: 'Continue preflight and evidence index hardening.',
  }))
  fs.writeFileSync(indexPath, records.map((record) => JSON.stringify(record)).join('\n') + '\n', 'utf8')
  return dir
}

function libraryCliFixture() {
  const dir = fixture(false)
  const statePath = path.join(dir, '.gse', 'state.json')
  const packagePath = path.join(dir, 'package.json')
  const docPath = path.join(dir, 'docs', 'sdk-architecture.md')
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  state.projectName = 'fixture-sdk-cli'
  state.canonicalPlan = 'docs/sdk-architecture.md'
  state.currentSlice.status = 'verified'
  state.currentSlice.outcome = 'CLI parser audit.'
  state.currentSlice.nextAction = 'Continue CLI package validation.'
  state.residualRisks = []
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'project-profile.md'), '# Project Profile\n\n- Product/system name: Fixture SDK CLI\n- Type: developer library and CLI tool\n', 'utf8')
  fs.writeFileSync(packagePath, JSON.stringify({ name: '@fixture/sdk-cli', description: 'SDK and CLI tool library package.' }, null, 2) + '\n', 'utf8')
  fs.writeFileSync(docPath, '# SDK Architecture\n\nDeveloper library and CLI tool design.\n', 'utf8')
  return dir
}

const validFixture = fixture(false)
const externalRiskHistory = externalRiskHistoryFixture()
const invalidFixture = fixture(true)
const verifiedFixture = verifiedSliceFixture()
const driftFixture = productDriftFixture()
const visibleFixture = productVisibleFixture()
const boundedSupport = boundedSupportFixture()
const bloatedCanonical = bloatedCanonicalFixture()
const appStyleProduct = appStyleProductFixture()
const libraryCli = libraryCliFixture()
const directValid = run('generate-continue-packet.mjs', ['--root', root, '--target', validFixture, '--json'])
const directExternalRiskHistory = run('generate-continue-packet.mjs', ['--root', root, '--target', externalRiskHistory, '--json'])
const directInvalid = run('generate-continue-packet.mjs', ['--root', root, '--target', invalidFixture, '--json'])
const directVerified = run('generate-continue-packet.mjs', ['--root', root, '--target', verifiedFixture, '--json'])
const directProductDrift = run('generate-continue-packet.mjs', ['--root', root, '--target', driftFixture, '--json'])
const directProductVisible = run('generate-continue-packet.mjs', ['--root', root, '--target', visibleFixture, '--json'])
const directBoundedSupport = run('generate-continue-packet.mjs', ['--root', root, '--target', boundedSupport, '--json'])
const directBloatedCanonical = run('generate-continue-packet.mjs', ['--root', root, '--target', bloatedCanonical, '--json'])
const directAppStyleProduct = run('generate-continue-packet.mjs', ['--root', root, '--target', appStyleProduct, '--json'])
const directLibraryCli = run('generate-continue-packet.mjs', ['--root', root, '--target', libraryCli, '--json'])
const directBrief = run('generate-continue-packet.mjs', ['--root', root, '--target', validFixture, '--brief'])
const directDoctor = run('generate-continue-packet.mjs', ['--root', root, '--target', validFixture, '--doctor'])
const documentHygiene = run('audit-document-hygiene.mjs', ['--target', bloatedCanonical, '--json'])
const compactionPlan = run('compact-canonical-goal-source.mjs', ['--target', bloatedCanonical, '--dry-run', '--json'])
const commandValid = run('run-gse-command.mjs', ['--root', root, '--target', validFixture, '--command', '/gse continue', '--json'])
const commandCompact = run('run-gse-command.mjs', ['--root', root, '--target', validFixture, '--command', '/gse continue', '--json', '--compact'])
const commandInvalid = run('run-gse-command.mjs', ['--root', root, '--target', invalidFixture, '--command', '/gse continue', '--json'])
const gseSelf = run('run-gse-command.mjs', ['--root', root, '--target', root, '--command', '/gse continue', '--json', '--compact'])

const validData = parseJson(directValid.stdout)
const externalRiskHistoryData = parseJson(directExternalRiskHistory.stdout)
const invalidData = parseJson(directInvalid.stdout)
const verifiedData = parseJson(directVerified.stdout)
const productDriftData = parseJson(directProductDrift.stdout)
const productVisibleData = parseJson(directProductVisible.stdout)
const boundedSupportData = parseJson(directBoundedSupport.stdout)
const bloatedCanonicalData = parseJson(directBloatedCanonical.stdout)
const appStyleProductData = parseJson(directAppStyleProduct.stdout)
const libraryCliData = parseJson(directLibraryCli.stdout)
const documentHygieneData = parseJson(documentHygiene.stdout)
const compactionPlanData = parseJson(compactionPlan.stdout)
const commandValidData = parseJson(commandValid.stdout)
const commandCompactData = parseJson(commandCompact.stdout)
const commandInvalidData = parseJson(commandInvalid.stdout)
const gseSelfData = parseJson(gseSelf.stdout)
const runnerSource = fs.readFileSync(path.join(root, 'scripts', 'run-gse-command.mjs'), 'utf8')
const skillSource = fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8')
const commandsSource = fs.readFileSync(path.join(root, 'references', 'commands.md'), 'utf8')
const promptLines = String(validData?.prompt ?? '').split(/\r?\n/).filter(Boolean)

const checks = [
  check('CPF01', 'continue packet generator exists', fs.existsSync(path.join(root, 'scripts', 'generate-continue-packet.mjs')), 'scripts/generate-continue-packet.mjs'),
  check('CPF02', '/gse continue routes through continue packet generator', runnerSource.includes("runNode('generate-continue-packet.mjs'") && runnerSource.includes("route: 'scripts/generate-continue-packet.mjs'"), 'scripts/run-gse-command.mjs'),
  check('CPF03', 'valid fixture returns passed preflight and compact active-risk state', directValid.status === 0 && validData?.summary?.status === 'passed' && validData?.compactState?.riskCount === 4 && validData?.compactState?.activeRiskCount === 4 && validData?.compactState?.archivedRiskCount === 1 && validData?.compactState?.totalRiskCount === 5 && validData?.compactState?.topRisks?.length === 3 && !directValid.stdout.includes('archived risk'), directValid.command),
  check('CPF03b', 'external risk ledger contributes count and path without loading historical text', directExternalRiskHistory.status === 0 && externalRiskHistoryData?.compactState?.activeRiskCount === 4 && externalRiskHistoryData?.compactState?.archivedRiskCount === 2 && externalRiskHistoryData?.compactState?.totalRiskCount === 6 && externalRiskHistoryData?.compactState?.riskHistoryPath === '.gse/risk-history.jsonl' && !directExternalRiskHistory.stdout.includes('historical ledger secret'), directExternalRiskHistory.command),
  check('CPF04', 'bad evidence index is a hard preflight failure', directInvalid.status !== 0 && invalidData?.summary?.status === 'failed' && invalidData?.preflight?.failures?.some((item) => item.id === 'CP03'), directInvalid.command),
  check('CPF04b', 'bad evidence index returns concrete repair actions before implementation', directInvalid.status !== 0 && invalidData?.preflight?.failures?.some((item) => item.id === 'CP15') && invalidData?.compactState?.stateRepair?.repairActions?.some((item) => item.id === 'SR03'), directInvalid.command),
  check('CPF05', 'portable /gse continue exposes structured preflight wrapper', commandValid.status === 0 && commandValidData?.execution?.command?.includes('generate-continue-packet.mjs') && commandValidData?.execution?.stdout?.includes('"compactState"'), commandValid.command),
  check('CPF06', 'compact mode returns packet without wrapper diagnostics', commandCompact.status === 0 && commandCompactData?.outputProfile === 'compact' && commandCompactData?.currentSlice && !commandCompact.stdout.includes('"execution"'), commandCompact.command),
  check('CPF07', 'portable command fails when preflight has hard failures', commandInvalid.status !== 0 && commandInvalidData?.execution?.status !== 0 && commandInvalidData?.execution?.stdout?.includes('"status": "failed"'), commandInvalid.command),
  check('CPF08', 'GSE self continue preserves local readiness while keeping external acceptance pending', gseSelf.status === 0 && ['passed', 'warning'].includes(gseSelfData?.status) && (gseSelfData?.failures?.length ?? 0) === 0 && gseSelfData?.ownerExternalGateSummary?.publicAccepted === 'not-accepted' && gseSelfData?.ownerExternalGateSummary?.pendingGates === 2, gseSelf.command),
  check('CPF09', 'SKILL.md routes compact continuation through the hard preflight command', skillSource.includes('scripts/run-gse-command.mjs') && skillSource.includes('--command "/gse continue"') && skillSource.includes('--json --compact'), 'SKILL.md'),
  check('CPF10', 'commands reference documents hard preflight semantics', commandsSource.includes('hard preflight') && commandsSource.includes('generate-continue-packet.mjs'), 'references/commands.md'),
  check('CPF11b', 'continue packet surfaces historical evidence review queue', validData?.preflight?.checks?.some((item) => item.id === 'CP13') && validData?.compactState?.evidenceReviewQueue && typeof validData.compactState.evidenceReviewQueue.needsReview === 'number', 'compactState.evidenceReviewQueue'),
  check('CPF11', 'continue packet surfaces legacy state migration readiness', validData?.preflight?.checks?.some((item) => item.id === 'CP15' && item.status === 'passed' && item.recommendation.includes('/gse repair')) && validData?.compactState?.stateRepair?.status === 'repair-advised' && validData?.compactState?.stateRepair?.repairActions?.some((item) => item.id === 'SR04' && item.severity === 'warning'), 'scripts/generate-continue-packet.mjs'),
  check('CPF12', 'continue packet surfaces latest maintenance snapshot freshness', validData?.preflight?.checks?.some((item) => item.id === 'CP20') && validData?.compactState?.maintenanceSnapshot?.status === 'passed' && validData?.compactState?.maintenanceSnapshot?.installedSync === 'package-only', 'scripts/generate-continue-packet.mjs'),
  check('CPF13', 'continue packet keeps owner/external records out of core workflow blockers', validData?.limits?.some((item) => item.includes('not GSE core workflow blockers')) && !validData?.limits?.some((item) => item.includes('block final acceptance')) && !fs.readFileSync(path.join(root, 'scripts', 'generate-continue-packet.mjs'), 'utf8').includes('Blocked final-acceptance gates'), 'scripts/generate-continue-packet.mjs'),
  check('CPF14', 'continue packet exposes exact completion plan and close commands', Array.isArray(validData?.compactState?.completionPlan?.requiredCloseCommands) && validData.compactState.completionPlan.requiredCloseCommands.some((item) => item.includes('run-validation-profile.mjs')) && validData.compactState.completionPlan.requiredCloseCommands.some((item) => item.includes('/gse close')) && validData.compactState.completionPlan.requiredSteps.some((item) => item.includes('evidence/index.jsonl')), 'compactState.completionPlan'),
  check('CPF15', 'continue packet activates conditional close commands from detected changed capability/docs/release files', validData?.compactState?.completionPlan?.conditionalCloseCommands?.some((item) => item.id === 'encoding' && item.active && item.command.includes('npm run check:encoding')) && validData?.compactState?.completionPlan?.conditionalCloseCommands?.some((item) => item.id === 'installed-sync' && item.active && item.command.includes('audit-installed-sync.mjs')) && validData?.compactState?.completionPlan?.conditionalCloseCommands?.some((item) => item.id === 'release-bundle' && item.active && item.command.includes('generate-release-bundle.mjs')) && validData?.compactState?.completionPlan?.conditionalCloseCommands?.some((item) => item.id === 'session-sync' && item.active && item.command.includes('audit-session-sync.mjs')), 'compactState.completionPlan.conditionalCloseCommands'),
  check('CPF16', 'continue packet exposes core/release/host-adapter gate taxonomy', validData?.compactState?.gateTaxonomy?.core?.blocking === true && validData?.compactState?.gateTaxonomy?.release?.scope?.includes('public release') && validData?.compactState?.gateTaxonomy?.hostAdapter?.scope?.includes('native slash-command') && validData?.compactState?.gateTaxonomy?.rule?.includes('block only the specific public, release, or host claim'), 'compactState.gateTaxonomy'),
  check('CPF17', 'continue packet prompt is short-entry actionable instead of long-goal prose', promptLines.length <= 6 && validData?.prompt?.includes('GSE continue:') && validData?.prompt?.includes('Root:') && validData?.prompt?.includes('Slice:') && validData?.prompt?.includes('Next:') && validData?.prompt?.includes('Mode: continue-current-slice') && validData?.prompt?.includes('Do: one verifiable slice') && validData?.prompt?.includes('risks=4 active/1 archived') && !validData?.prompt?.includes('Run one verifiable slice, record evidence'), 'compact prompt line count and required action fields'),
  check('CPF18', 'verified current slice switches short entry into open-next-slice mode', directVerified.status === 0 && verifiedData?.compactState?.nextSliceMode?.action === 'open-next-slice' && verifiedData?.compactState?.nextSliceMode?.currentSliceVerified === true && verifiedData?.prompt?.includes('Mode: open-next-slice'), directVerified.command),
  check('CPF19', 'verified current slice exposes machine-readable next-slice candidates', directVerified.status === 0 && Array.isArray(verifiedData?.compactState?.nextSliceCandidates) && verifiedData.compactState.nextSliceCandidates.length >= 1 && verifiedData.compactState.nextSliceCandidates.every((item) => item.id && item.title && item.source && item.reason && item.fullReason && item.acceptanceHint && item.suggestedProfile), 'compactState.nextSliceCandidates'),
  check('CPF20', 'unverified slice does not force next-slice candidates', directValid.status === 0 && validData?.compactState?.nextSliceMode?.action === 'continue-current-slice' && Array.isArray(validData?.compactState?.nextSliceCandidates) && validData.compactState.nextSliceCandidates.length === 0, 'compactState.nextSliceCandidates'),
  check('CPF21', 'next-slice candidates do not claim native slash-command support', directVerified.status === 0 && !JSON.stringify(verifiedData?.compactState?.nextSliceCandidates ?? []).toLowerCase().includes('native slash-command'), 'compactState.nextSliceCandidates claim boundary'),
  check('CPF22', 'next-slice candidates keep full machine reasons separate from short display reasons', directVerified.status === 0 && verifiedData?.compactState?.nextSliceCandidates?.every((item) => item.fullReason.length >= item.reason.length) && verifiedData?.compactState?.nextSliceCandidates?.some((item) => item.fullReason.length > item.reason.length), 'compactState.nextSliceCandidates.fullReason'),
  check('CPF23', 'next-slice candidates prefer concrete gaps over meta open-next-slice reminders', directVerified.status === 0 && verifiedData?.compactState?.nextSliceCandidates?.[0]?.source === '.gse/state.json residualRisks' && !verifiedData.compactState.nextSliceCandidates[0].fullReason.toLowerCase().includes('open the next fixture slice'), 'compactState.nextSliceCandidates ranking'),
  check('CPF24', 'next-slice candidates include structured action packets for short-entry takeover', directVerified.status === 0 && verifiedData?.compactState?.nextSliceCandidates?.every((item) => item.actionPacket?.candidateType && item.actionPacket?.outcomeHint && item.actionPacket?.scopeHint && item.actionPacket?.acceptanceHint && item.actionPacket?.evidenceHint && item.actionPacket?.riskHint && item.actionPacket?.nextActionHint && Array.isArray(item.actionPacket?.focusedChecks) && item.actionPacket.focusedChecks.length >= 1), 'compactState.nextSliceCandidates.actionPacket'),
  check('CPF24a', 'action packets carry a bounded functional Slice contract', directVerified.status === 0 && verifiedData?.compactState?.nextSliceCandidates?.every((item) => {
    const contract = item.actionPacket?.functionalSlice
    return contract?.outcome && contract?.scope && Array.isArray(contract.nonGoals) && contract.nonGoals.length >= 1 && contract?.acceptance && contract?.proofBoundary && Array.isArray(contract.evidenceMatrix) && contract.evidenceMatrix.length >= 1 && contract?.risks && contract?.nextAction
  }), 'compactState.nextSliceCandidates.actionPacket.functionalSlice'),
  check('CPF24b', 'no-goal-mode packet turns continue output into a direct execution packet', directVerified.status === 0 && verifiedData?.compactState?.noGoalMode?.mode === 'no-goal-mode' && verifiedData.compactState.noGoalMode.recommendedAction === 'open-next-slice' && verifiedData.compactState.noGoalMode.selectedCandidate?.actionPacket?.outcomeHint && verifiedData.compactState.noGoalMode.firstSteps?.some((item) => item.includes('current-slice')) && verifiedData.compactState.noGoalMode.closeCommands?.some((item) => item.includes('run-validation-profile.mjs')) && verifiedData.compactState.noGoalMode.claimBoundary?.includes('Portable continuation only') && verifiedData?.prompt?.includes('no-goal=open-next-slice'), 'compactState.noGoalMode'),
  check('CPF24c', 'no-goal-mode packet routes unverified slices to current-slice continuation', directValid.status === 0 && validData?.compactState?.noGoalMode?.recommendedAction === 'continue-current-slice' && validData.compactState.noGoalMode.selectedCandidate === null && validData.compactState.noGoalMode.firstSteps?.some((item) => item.includes('Continue the current slice')) && validData.compactState.noGoalMode.claimBoundary?.includes('does not prove host-native slash-command'), 'compactState.noGoalMode continue-current-slice'),
  check('CPF25', 'continue packet separates session sync evidence from target-session adoption', validData?.preflight?.checks?.some((item) => item.id === 'CP21') && validData?.compactState?.sessionSyncBoundary?.boundary === 'sync-records-do-not-prove-adoption' && validData?.compactState?.sessionSyncBoundary?.adoptionProven === false && validData?.compactState?.sessionSyncBoundary?.limits?.some((item) => item.includes('not target-session adoption')), 'compactState.sessionSyncBoundary'),
  check('CPF26', 'continue packet detects repeated internal/component slices and prefers product-visible recovery', directProductDrift.status === 0 && productDriftData?.compactState?.productProgressDrift?.status === 'warning' && productDriftData?.preflight?.checks?.some((item) => item.id === 'CP22' && item.status === 'warning') && productDriftData?.compactState?.nextSliceCandidates?.[0]?.actionPacket?.candidateType === 'product-visible-recovery' && productDriftData?.compactState?.nextSliceCandidates?.[0]?.acceptanceHint?.includes('user-visible behavior'), 'compactState.productProgressDrift'),
  check('CPF27', 'product outcome gate warns on repeated support slices in product projects', directProductDrift.status === 0 && productDriftData?.compactState?.productOutcomeGate?.status === 'warning' && productDriftData?.compactState?.productOutcomeGate?.projectType === 'product' && productDriftData?.compactState?.productOutcomeGate?.sliceType === 'support' && productDriftData?.preflight?.checks?.some((item) => item.id === 'CP23' && item.status === 'warning') && productDriftData?.compactState?.nextSliceCandidates?.[0]?.source === 'compactState.productOutcomeGate', 'compactState.productOutcomeGate warning'),
  check('CPF28', 'product outcome gate passes when product slice names a visible delta', directProductVisible.status === 0 && productVisibleData?.compactState?.productOutcomeGate?.status === 'passed' && productVisibleData?.compactState?.productOutcomeGate?.userVisibleDelta?.includes('Users can run') && productVisibleData?.compactState?.nextSliceCandidates?.every((item) => item.source !== 'compactState.productOutcomeGate'), 'compactState.productOutcomeGate passed'),
  check('CPF29', 'GSE self is not forced through product outcome gate', gseSelf.status === 0 && gseSelfData?.productOutcomeGate?.status === 'not-applicable' && gseSelfData?.productOutcomeGate?.projectType === 'skill', 'productOutcomeGate not-applicable'),
  check('CPF30', 'bounded product support slices surface their boundary without CP23 warning', directBoundedSupport.status === 0 && boundedSupportData?.compactState?.productOutcomeGate?.status === 'passed' && boundedSupportData?.compactState?.productOutcomeGate?.sliceType === 'support' && boundedSupportData?.compactState?.productOutcomeGate?.supportSliceBoundary?.includes('malformed evidence index') && !boundedSupportData?.preflight?.checks?.some((item) => item.id === 'CP23' && item.status === 'warning'), 'compactState.productOutcomeGate.supportSliceBoundary'),
  check('CPF31', 'bloated canonical product goal source is surfaced as a soft hygiene warning', directBloatedCanonical.status === 0 && bloatedCanonicalData?.summary?.status === 'warning' && bloatedCanonicalData?.compactState?.canonicalGoalSourceHygiene?.status === 'warning' && bloatedCanonicalData?.preflight?.checks?.some((item) => item.id === 'CP24' && item.status === 'warning') && bloatedCanonicalData?.compactState?.canonicalGoalSourceHygiene?.recommendation?.includes('Move execution ledgers'), 'compactState.canonicalGoalSourceHygiene'),
  check('CPF32', 'app-style product docs outweigh generic package/library wording', directAppStyleProduct.status === 0 && appStyleProductData?.compactState?.productOutcomeGate?.projectType === 'product' && appStyleProductData?.compactState?.productOutcomeGate?.status === 'warning', 'compactState.productOutcomeGate project classification'),
  check('CPF33', 'library/CLI fixtures remain non-product for product outcome gate', directLibraryCli.status === 0 && libraryCliData?.compactState?.productOutcomeGate?.projectType === 'library' && libraryCliData?.compactState?.productOutcomeGate?.status === 'not-applicable', 'compactState.productOutcomeGate library classification'),
  check('CPF34', 'continue packet exposes delivery-pack recommendation with review and acceptance hints', gseSelf.status === 0 && gseSelfData?.deliveryPackRecommendation?.primaryPack && Array.isArray(gseSelfData?.deliveryPackRecommendation?.reviewAxes) && gseSelfData.deliveryPackRecommendation.reviewAxes.length >= 1 && Array.isArray(gseSelfData?.deliveryPackRecommendation?.acceptanceScenarios) && gseSelfData.deliveryPackRecommendation.acceptanceScenarios.length >= 1, 'deliveryPackRecommendation'),
  check('CPF34b', 'continue markdown supports brief output profile', directBrief.status === 0 && directBrief.stdout.includes('GSE continue:') && directBrief.stdout.split(/\r?\n/).filter(Boolean).length <= 8 && !directBrief.stdout.includes('## Preflight'), directBrief.command),
  check('CPF35', 'continue markdown supports doctor/full output profile', directDoctor.status === 0 && directDoctor.stdout.includes('# GSE Continue Doctor') && directDoctor.stdout.includes('"compactState"'), directDoctor.command),
  check('CPF36', 'document hygiene audit covers bloated canonical source', documentHygiene.status === 0 && documentHygieneData?.summary?.status === 'warning' && documentHygieneData?.issues?.some((item) => item.id === 'DH-canonical-boundary'), documentHygiene.command),
  check('CPF37', 'canonical goal source compaction dry-run classifies keep and move/summarize lines', compactionPlan.status === 0 && compactionPlanData?.mode === 'dry-run' && compactionPlanData?.summary?.status === 'plan-ready' && compactionPlanData.summary.keep > 0 && (compactionPlanData.summary.move + compactionPlanData.summary.summarize) > 0, compactionPlan.command),
]

fs.rmSync(validFixture, { recursive: true, force: true })
fs.rmSync(externalRiskHistory, { recursive: true, force: true })
fs.rmSync(invalidFixture, { recursive: true, force: true })
fs.rmSync(verifiedFixture, { recursive: true, force: true })
fs.rmSync(driftFixture, { recursive: true, force: true })
fs.rmSync(visibleFixture, { recursive: true, force: true })
fs.rmSync(boundedSupport, { recursive: true, force: true })
fs.rmSync(bloatedCanonical, { recursive: true, force: true })
fs.rmSync(appStyleProduct, { recursive: true, force: true })
fs.rmSync(libraryCli, { recursive: true, force: true })

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    continueHardPreflight: failed === 0 ? 'verified' : 'failed',
    stateCompaction: failed === 0 ? 'verified' : 'failed',
    ownerExternalGateBoundary: failed === 0 ? 'verified' : 'failed',
    completionPlan: failed === 0 ? 'verified' : 'failed',
    gateTaxonomy: failed === 0 ? 'verified' : 'failed',
    shortEntryPrompt: failed === 0 ? 'verified' : 'failed',
    nextSliceMode: failed === 0 ? 'verified' : 'failed',
    nextSliceCandidates: failed === 0 ? 'verified' : 'failed',
    nextSliceActionPackets: failed === 0 ? 'verified' : 'failed',
    noGoalModePacket: failed === 0 ? 'verified' : 'failed',
    sessionSyncAdoptionBoundary: failed === 0 ? 'verified' : 'failed',
    productProgressDriftGuard: failed === 0 ? 'verified' : 'failed',
    productOutcomeGate: failed === 0 ? 'verified' : 'failed',
    canonicalGoalSourceHygiene: failed === 0 ? 'verified' : 'failed',
    documentHygieneAudit: failed === 0 ? 'verified' : 'failed',
    canonicalCompactionDryRun: failed === 0 ? 'verified' : 'failed',
    continueOutputProfiles: failed === 0 ? 'verified' : 'failed',
  },
  commands: [directValid.command, directExternalRiskHistory.command, directInvalid.command, directVerified.command, directProductDrift.command, directProductVisible.command, directBoundedSupport.command, directBloatedCanonical.command, directAppStyleProduct.command, directLibraryCli.command, directBrief.command, directDoctor.command, documentHygiene.command, compactionPlan.command, commandValid.command, commandCompact.command, commandInvalid.command, gseSelf.command],
  checks,
  limits: [
    'This audit verifies portable /gse continue semantics and compact packet output.',
    'It does not prove native host slash-command execution.',
    'Owner/external records are surfaced as public/release/host-specific claim evidence, not GSE core workflow blockers.',
  ],
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))

if (failed > 0) process.exit(1)
