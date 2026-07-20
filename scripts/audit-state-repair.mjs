#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  executeGseV1Migration,
  inspectGseV1Project,
} from './core/migration-v1.mjs'
import {
  evaluatePositiveSliceClaim,
} from './core/evidence.mjs'
import { resolveProjectAuthority } from './core/project-authority.mjs'
import {
  readCompatibleRiskSummary,
} from './core/project-state-v1.mjs'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const targetArg = readArg('--target')
const jsonOnly = args.includes('--json')
const execute = args.includes('--execute')
const selfTest = args.includes('--self-test') || !targetArg
const maxRiskLength = Number(readArg('--max-risk-length', '260'))

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, ok: false, data: null, error: 'missing' }
  try {
    return { exists: true, ok: true, data: JSON.parse(readText(filePath)), error: '' }
  } catch (error) {
    return { exists: true, ok: false, data: null, error: error.message }
  }
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, ok: false, records: [], error: 'missing', lines: [] }
  const lines = readText(filePath)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const records = []
  for (const [index, line] of lines.entries()) {
    try {
      records.push(JSON.parse(line))
    } catch (error) {
      return { exists: true, ok: false, records, error: `line ${index + 1}: ${error.message}`, lines }
    }
  }
  return { exists: true, ok: true, records, error: '', lines }
}

function readRiskHistory(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, ok: true, records: [], error: '' }
  }

  const text = readText(filePath)
  if (text && !text.endsWith('\n')) {
    return {
      exists: true,
      ok: false,
      records: [],
      error: 'file does not end with a complete JSONL line',
    }
  }

  return readJsonl(filePath)
}

function repairAction(id, severity, targetPath, problem, command, options = {}) {
  return {
    id,
    severity,
    targetPath,
    problem,
    command,
    writeSupported: Boolean(options.writeSupported),
    safeToAutoRepair: Boolean(options.safeToAutoRepair),
  }
}

function latestEvidenceFileExists(target, latest) {
  return latest?.evidenceFile ? fs.existsSync(path.join(target, latest.evidenceFile)) : false
}

function positiveSliceClaimAction(state, evidenceRecords) {
  const evaluation = evaluatePositiveSliceClaim(state, evidenceRecords)
  if (evaluation.valid || !evaluation.applicable) return null
  const claimedStatus = state.currentSlice.status
  if (evaluation.reasonCode === 'POSITIVE_CLAIM_BLOCKED_GATES') {
    return repairAction(
      'SR10',
      'hard',
      '.gse/state.json',
      `${claimedStatus} current Slice still has unresolved blockedGates.`,
      'Resolve or remove every blocking gate before restoring the positive Slice status.',
    )
  }
  return repairAction(
    'SR10',
    'hard',
    '.gse/state.json, .gse/evidence/index.jsonl',
    `${claimedStatus} current Slice lacks current-revision evidence in the same Slice or Change scope.`,
    'Record sufficient scoped evidence or downgrade the current Slice status; repair does not promote evidence automatically.',
  )
}

export async function auditStateRepair(target, options = {}) {
  const resolvedTarget = path.resolve(target)
  const executeChanges = Boolean(options.execute)
  const riskLengthLimit = Number(options.maxRiskLength ?? maxRiskLength)
  const gseDir = path.join(resolvedTarget, '.gse')
  const statePath = path.join(gseDir, 'state.json')
  const evidenceIndexPath = path.join(gseDir, 'evidence', 'index.jsonl')
  const riskHistoryPath = path.join(gseDir, 'risk-history.jsonl')
  const inspection = inspectGseV1Project(resolvedTarget)
  const migration = executeChanges
    ? await executeGseV1Migration(resolvedTarget, {
        sourceDigests: inspection.sourceDigests,
      })
    : inspection
  const authority = resolveProjectAuthority(resolvedTarget)
  const stateResult = readJson(statePath)
  const evidenceIndex = readJsonl(evidenceIndexPath)
  const riskHistory = readRiskHistory(riskHistoryPath)
  const state = stateResult.ok ? stateResult.data : null
  const latestEvidence = evidenceIndex.records.at(-1) ?? null
  const riskSummary = readCompatibleRiskSummary(
    state,
    riskHistory.ok && riskHistory.exists ? riskHistory.records.length : null,
  )
  const actions = []

  if (!fs.existsSync(gseDir)) {
    actions.push(repairAction(
      'SR01',
      'hard',
      '.gse',
      'Missing .gse directory.',
      'node <gse-skill>/scripts/init-project.mjs --target <project-root> --mode auto --json',
    ))
  }

  if (!stateResult.ok) {
    actions.push(repairAction(
      'SR02',
      'hard',
      '.gse/state.json',
      stateResult.exists ? `Invalid JSON: ${stateResult.error}` : 'Missing state.json.',
      stateResult.exists
        ? 'Repair the reported JSON deliberately; --force does not bypass malformed project state.'
        : 'node <gse-skill>/scripts/update-project-state.mjs --target <project-root> --json',
    ))
  }

  if (!evidenceIndex.ok) {
    actions.push(repairAction(
      'SR03',
      'hard',
      '.gse/evidence/index.jsonl',
      evidenceIndex.exists ? `Invalid JSONL: ${evidenceIndex.error}` : 'Missing evidence index.',
      evidenceIndex.exists
        ? 'Fix the reported JSONL line before relying on continuation or evidence ordering.'
        : 'node <gse-skill>/scripts/update-project-state.mjs --target <project-root> --json',
    ))
  }

  if (
    migration.reasonCode !== 'PROJECT_STATE_V1_CANONICAL'
    && !(executeChanges && migration.status === 'complete')
  ) {
    actions.push(repairAction(
      'SR04',
      migration.status === 'proceed' ? 'warning' : 'hard',
      '.gse/state.json',
      migration.reasonCode === 'MIGRATION_INSPECTION_READY'
        ? 'Project state is safely migratable to the Core v1 contract.'
        : migration.message,
      migration.status === 'proceed'
        ? 'node <gse-skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse repair" --execute --json'
        : 'Inspect the migration diagnostics and repair the reported ambiguity or malformed artifact deliberately.',
      {
        writeSupported: migration.status === 'proceed',
        safeToAutoRepair: migration.status === 'proceed',
      },
    ))
  }

  for (const item of authority.conflicts) {
    actions.push(repairAction(
      `SR-AUTH-${item.code}`,
      item.severity === 'blocked' ? 'hard' : 'warning',
      item.sources.map((source) => authority.sources[source]?.path).filter(Boolean).join(', ') || '.gse',
      `Current-state authority conflict: ${item.code}.`,
      item.severity === 'blocked'
        ? 'Inspect the conflicting authority sources and choose the correct source deliberately; repair does not guess precedence.'
        : 'Review the reported projection drift or fallback warning; repair does not rewrite projections automatically.',
    ))
  }

  if (!riskHistory.ok) {
    actions.push(repairAction(
      'SR05',
      'hard',
      '.gse/risk-history.jsonl',
      `Invalid risk-history JSONL: ${riskHistory.error}`,
      'Repair the malformed or incomplete risk-history ledger before executing migration.',
    ))
  }

  const longRisks = riskSummary.residualRisks.filter((risk) => risk.length > riskLengthLimit)
  if (longRisks.length > 0) {
    actions.push(repairAction(
      'SR06',
      'warning',
      '.gse/state.json',
      `${longRisks.length} active residual risk(s) exceed ${riskLengthLimit} characters.`,
      'Shorten active risks to current decision-useful summaries; keep historical detail in evidence or .gse/risk-history.jsonl.',
    ))
  }

  if (state && evidenceIndex.ok) {
    const claimAction = positiveSliceClaimAction(state, evidenceIndex.records)
    if (claimAction) actions.push(claimAction)
  }

  if (state && evidenceIndex.ok && evidenceIndex.records.length > 0) {
    if (state.lastEvidence && latestEvidence?.evidenceFile && state.lastEvidence !== latestEvidence.evidenceFile) {
      actions.push(repairAction(
        'SR07',
        'warning',
        '.gse/state.json',
        `lastEvidence points to ${state.lastEvidence}, but latest evidence index record points to ${latestEvidence.evidenceFile}.`,
        'Confirm which artifact is newer and update only the stale side; repair does not guess evidence precedence.',
      ))
    }
    if (latestEvidence?.evidenceFile && !latestEvidenceFileExists(resolvedTarget, latestEvidence)) {
      actions.push(repairAction(
        'SR08',
        'hard',
        '.gse/evidence/index.jsonl',
        `Latest evidence file is missing: ${latestEvidence.evidenceFile}.`,
        'Restore the referenced evidence file or append a valid replacement evidence record.',
      ))
    }
    if (
      state.currentSlice?.nextAction
      && latestEvidence?.nextAction
      && state.currentSlice.nextAction !== latestEvidence.nextAction
    ) {
      actions.push(repairAction(
        'SR09',
        'warning',
        '.gse/state.json',
        'currentSlice.nextAction differs from the latest evidence nextAction.',
        'Confirm whether state or evidence is newer; repair does not reconcile next-action drift automatically.',
      ))
    }
  }

  const hardActions = actions.filter((item) => item.severity === 'hard')
  const warningActions = actions.filter((item) => item.severity === 'warning')
  const proposedWritePaths = Array.isArray(inspection.proposedWrites)
    ? [...new Set(inspection.proposedWrites.map((write) => write.path))]
    : []
  const artifactRefs = executeChanges && migration.status === 'complete'
    ? proposedWritePaths
    : []

  return {
    root,
    target: resolvedTarget,
    generatedAt: new Date().toISOString(),
    execute: executeChanges,
    summary: {
      status: hardActions.length ? 'repair-required' : warningActions.length ? 'repair-advised' : 'clean',
      hard: hardActions.length,
      warnings: warningActions.length,
      actions: actions.length,
      writes: artifactRefs.length,
    },
    compatibility: {
      status: migration.status,
      reasonCode: migration.reasonCode,
      stateRevision: migration.stateRevision,
      proposedWrites: Array.isArray(migration.proposedWrites) ? migration.proposedWrites : [],
      sourceDigests: migration.sourceDigests ?? {},
      migrationSummary: migration.migrationSummary ?? null,
      diagnostics: migration.diagnostics ?? [],
    },
    currentStateAuthority: {
      status: authority.status,
      stateRevision: authority.stateRevision,
      safeToContinue: authority.safeToContinue,
      sources: authority.sources,
      sourceDigests: authority.sourceDigests,
      conflicts: authority.conflicts,
      freshness: authority.freshness,
    },
    state: {
      exists: stateResult.exists,
      valid: stateResult.ok,
      stateRevision: state?.stateRevision ?? null,
      activeChangeId: state?.activeChangeId ?? null,
      currentSliceId: state?.currentSlice?.id ?? null,
      nextAction: state?.currentSlice?.nextAction ?? null,
      residualRisks: riskSummary.residualRisks.length,
      archivedRiskCount: riskSummary.archivedRiskCount,
      riskHistoryPath: riskSummary.riskHistoryPath,
      embeddedRiskArchive: Array.isArray(state?.riskArchive) ? state.riskArchive.length : 0,
    },
    evidenceIndex: {
      exists: evidenceIndex.exists,
      valid: evidenceIndex.ok,
      records: evidenceIndex.records.length,
      latestEvidenceFile: latestEvidence?.evidenceFile ?? null,
      latestNextAction: latestEvidence?.nextAction ?? null,
    },
    riskHistory: {
      exists: riskHistory.exists,
      valid: riskHistory.ok,
      records: riskHistory.records.length,
      path: riskSummary.riskHistoryPath,
    },
    migration,
    repairActions: actions,
    writes: artifactRefs.map((targetPath) => ({
      action: 'core-v1-migration',
      targetPath,
    })),
    limits: [
      'Default mode is diagnostic and does not modify project files.',
      'Explicit --execute uses the shared Core v1 migration transaction; it does not create a separate backup directory.',
      'Historical risks are externalized to .gse/risk-history.jsonl and are not loaded into compact continuation output.',
      'Evidence and next-action drift remain warnings and are never reconciled automatically.',
    ],
  }
}

function fixtureState(kind) {
  const state = {
    schemaVersion: 1,
    projectName: 'repair-fixture',
    mode: 'standard',
    phase: 'execute',
    currentSlice: {
      id: 'repair-fixture',
      outcome: 'Repair fixture.',
      status: kind === 'accepted-verified-only' ? 'accepted' : 'verified',
      nextAction: kind === 'stale' ? 'Stale state action.' : 'Run next repair fixture.',
    },
    toolStatuses: { browser: 'unknown' },
    lastEvidence: '.gse/evidence/2026-07-08.md',
    blockedGates: kind === 'blocked-gate' ? ['owner-approval'] : [],
    residualRisks: ['Fixture risk.'],
  }

  if (['canonical', 'stale', 'bad-jsonl', 'authority-conflict', 'missing-proof', 'accepted-verified-only', 'stale-proof', 'blocked-gate', 'partial-criterion'].includes(kind)) {
    return { ...state, stateRevision: 0, activeChangeId: null }
  }

  const { toolStatuses, ...legacyState } = state
  return {
    ...legacyState,
    toolStatus: toolStatuses,
    residualRisks: Array.from({ length: 8 }, (_, index) => `Fixture risk ${index + 1}.`),
    riskArchive: [{
      archivedAt: '2026-07-01T00:00:00.000Z',
      risk: 'Previously archived fixture risk.',
      resolution: 'Fixture archive.',
    }],
  }
}

function createFixture(kind) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gse-state-repair-${kind}-`))
  fs.mkdirSync(path.join(dir, '.gse', 'evidence'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.gse', 'README.md'), '# GSE\n', 'utf8')

  fs.writeFileSync(
    path.join(dir, '.gse', 'state.json'),
    kind === 'bad-state'
      ? '{ bad json\n'
      : JSON.stringify(fixtureState(kind), null, 2) + '\n',
    'utf8',
  )

  if (kind !== 'bad-state') {
    const slice = fixtureState(kind).currentSlice
    fs.writeFileSync(
      path.join(dir, '.gse', 'current-slice.md'),
      [
        '# Current Slice',
        '',
        `- Slice ID: ${slice.id}`,
        '',
        '## Outcome',
        '',
        slice.outcome,
        '',
        '## Status',
        '',
        slice.status,
        '',
        '## Next Action',
        '',
        kind === 'authority-conflict' ? 'Conflicting repair action.' : slice.nextAction,
        '',
      ].join('\n'),
      'utf8',
    )
    fs.writeFileSync(
      path.join(dir, '.gse', 'goal-map.md'),
      [
        '# Goal Map',
        '',
        `Active slice: ${slice.outcome}`,
        `Next action: ${slice.nextAction}`,
        '',
      ].join('\n'),
      'utf8',
    )
  }

  const record = {
    date: '2026-07-08',
    recordType: 'slice',
    changeId: 'repair-fixture',
    taskId: null,
    stateRevision: kind === 'stale-proof' ? -1 : 0,
    status: 'verified',
    evidenceLevel: 'verified-unit',
    requiredEvidenceLevel: 'verified-unit',
    claim: 'Repair fixture is verified.',
    summary: 'Repair fixture evidence.',
    evidenceFile: '.gse/evidence/2026-07-08.md',
    ...(kind === 'partial-criterion' ? { criterionId: 'AC-1' } : {}),
    commands: ['fixture'],
    nextAction: 'Run next repair fixture.',
  }
  fs.writeFileSync(path.join(dir, '.gse', 'evidence', '2026-07-08.md'), '# Evidence\n', 'utf8')
  fs.writeFileSync(
    path.join(dir, '.gse', 'evidence', 'index.jsonl'),
    kind === 'bad-jsonl'
      ? '{"date":"2026-07-08"\n'
      : kind === 'missing-proof'
        ? ''
        : JSON.stringify(record) + '\n',
    'utf8',
  )
  return dir
}

async function runSelfTest() {
  const canonical = createFixture('canonical')
  const legacy = createFixture('legacy')
  const executeFixture = createFixture('legacy')
  const badState = createFixture('bad-state')
  const badJsonl = createFixture('bad-jsonl')
  const stale = createFixture('stale')
  const authorityConflict = createFixture('authority-conflict')
  const missingProof = createFixture('missing-proof')
  const acceptedVerifiedOnly = createFixture('accepted-verified-only')
  const staleProof = createFixture('stale-proof')
  const blockedGate = createFixture('blocked-gate')
  const partialCriterion = createFixture('partial-criterion')
  const reports = {
    canonical: await auditStateRepair(canonical),
    legacy: await auditStateRepair(legacy),
    execute: await auditStateRepair(executeFixture, { execute: true }),
    badState: await auditStateRepair(badState),
    badJsonl: await auditStateRepair(badJsonl),
    stale: await auditStateRepair(stale),
    authorityConflict: await auditStateRepair(authorityConflict),
    missingProof: await auditStateRepair(missingProof),
    acceptedVerifiedOnly: await auditStateRepair(acceptedVerifiedOnly),
    staleProof: await auditStateRepair(staleProof),
    blockedGate: await auditStateRepair(blockedGate),
    partialCriterion: await auditStateRepair(partialCriterion),
  }
  reports.rerun = await auditStateRepair(executeFixture)

  const migratedState = readJson(path.join(executeFixture, '.gse', 'state.json')).data
  const migratedHistory = readRiskHistory(path.join(executeFixture, '.gse', 'risk-history.jsonl'))
  const checks = [
    {
      id: 'SR-T01',
      status: reports.canonical.summary.status === 'clean'
        && reports.canonical.compatibility.reasonCode === 'PROJECT_STATE_V1_CANONICAL'
        ? 'passed' : 'failed',
      evidence: reports.canonical.compatibility.reasonCode,
    },
    {
      id: 'SR-T02',
      status: reports.legacy.compatibility.reasonCode === 'MIGRATION_INSPECTION_READY'
        && reports.legacy.summary.writes === 0
        && !fs.existsSync(path.join(legacy, '.gse', 'risk-history.jsonl'))
        ? 'passed' : 'failed',
      evidence: 'legacy inspection is read-only',
    },
    {
      id: 'SR-T03',
      status: reports.execute.migration.status === 'complete'
        && migratedState?.stateRevision === 1
        && migratedState?.activeChangeId === null
        && !Object.hasOwn(migratedState ?? {}, 'riskArchive')
        && migratedHistory.ok
        && migratedHistory.records.length === 3
        ? 'passed' : 'failed',
      evidence: 'execution externalizes three historical risks',
    },
    {
      id: 'SR-T04',
      status: reports.rerun.compatibility.reasonCode === 'PROJECT_STATE_V1_CANONICAL'
        && reports.rerun.summary.writes === 0
        && migratedHistory.records.length === 3
        ? 'passed' : 'failed',
      evidence: 'canonical rerun is idempotent',
    },
    {
      id: 'SR-T05',
      status: reports.badState.repairActions.some((item) => item.id === 'SR02' && item.severity === 'hard')
        ? 'passed' : 'failed',
      evidence: 'malformed state fails closed',
    },
    {
      id: 'SR-T06',
      status: reports.badJsonl.repairActions.some((item) => item.id === 'SR03' && item.severity === 'hard')
        ? 'passed' : 'failed',
      evidence: 'malformed evidence index is diagnosed',
    },
    {
      id: 'SR-T07',
      status: reports.stale.repairActions.some((item) => item.id === 'SR09' && item.severity === 'warning')
        ? 'passed' : 'failed',
      evidence: 'next-action drift remains warning-only',
    },
    {
      id: 'SR-T08',
      status: !fs.existsSync(path.join(executeFixture, '.gse', 'backups')) ? 'passed' : 'failed',
      evidence: 'migration creates no independent backup directory',
    },
    {
      id: 'SR-T09',
      status: reports.authorityConflict.summary.status === 'repair-required'
        && reports.authorityConflict.currentStateAuthority.status === 'blocked'
        && reports.authorityConflict.repairActions.some(
          (item) => item.id === 'SR-AUTH-CURRENT_SLICE_NEXT_ACTION_CONFLICT'
            && item.severity === 'hard'
            && item.safeToAutoRepair === false,
        )
        ? 'passed' : 'failed',
      evidence: 'material authority conflict blocks repair without guessing precedence',
    },
    {
      id: 'SR-T10',
      status: [
        reports.missingProof,
        reports.acceptedVerifiedOnly,
        reports.staleProof,
        reports.partialCriterion,
      ].every((report) => report.repairActions.some((item) => item.id === 'SR10' && item.severity === 'hard'))
        ? 'passed' : 'failed',
      evidence: 'positive Slice claims require sufficient current-revision proof in the same scope',
    },
    {
      id: 'SR-T11',
      status: reports.blockedGate.repairActions.some((item) => item.id === 'SR10' && item.severity === 'hard')
        ? 'passed' : 'failed',
      evidence: 'positive Slice claims reject unresolved blockedGates',
    },
  ]
  const passed = checks.filter((item) => item.status === 'passed').length
  const failed = checks.length - passed

  for (const dir of [
    canonical, legacy, executeFixture, badState, badJsonl, stale, authorityConflict,
    missingProof, acceptedVerifiedOnly, staleProof, blockedGate, partialCriterion,
  ]) {
    fs.rmSync(dir, { recursive: true, force: true })
  }

  return {
    root,
    generatedAt: new Date().toISOString(),
    summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
    workflows: { stateRepairPath: failed === 0 ? 'verified' : 'failed' },
    checks,
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isCli) {
  const report = selfTest ? await runSelfTest() : await auditStateRepair(targetArg, { execute })

  if (jsonOnly) console.log(JSON.stringify(report, null, 2))
  else console.log(JSON.stringify(report, null, 2))

  if (report.summary.status === 'failed' || report.summary.status === 'repair-required') process.exit(1)
}
