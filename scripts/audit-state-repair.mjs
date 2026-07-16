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
const write = args.includes('--write') || args.includes('--execute')
const selfTest = args.includes('--self-test') || !targetArg
const maxActiveRisks = Number(readArg('--max-active-risks', '6'))
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

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return null
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = path.join(path.dirname(filePath), 'backups')
  fs.mkdirSync(backupDir, { recursive: true })
  const backupPath = path.join(backupDir, `${stamp}-${path.basename(filePath)}.bak`)
  fs.copyFileSync(filePath, backupPath)
  return backupPath
}

function relative(target, fullPath) {
  return path.relative(target, fullPath).replace(/\\/g, '/')
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

function compactRisks(state, limit) {
  const residualRisks = Array.isArray(state.residualRisks) ? state.residualRisks : []
  const keep = residualRisks.slice(0, limit)
  const overflow = residualRisks.slice(limit)
  const archive = Array.isArray(state.riskArchive) ? state.riskArchive : []
  return {
    ...state,
    residualRisks: keep,
    riskArchive: [
      ...archive,
      ...overflow.map((risk) => ({
        archivedAt: new Date().toISOString().slice(0, 10),
        risk,
        resolution: 'Archived by GSE state repair to keep active residual risks compact.',
      })),
    ],
  }
}

function latestEvidenceFileExists(target, latest) {
  return latest?.evidenceFile ? fs.existsSync(path.join(target, latest.evidenceFile)) : false
}

export function auditStateRepair(target, options = {}) {
  const resolvedTarget = path.resolve(target)
  const writeChanges = Boolean(options.write)
  const riskLimit = Number(options.maxActiveRisks ?? maxActiveRisks)
  const riskLengthLimit = Number(options.maxRiskLength ?? maxRiskLength)
  const gseDir = path.join(resolvedTarget, '.gse')
  const statePath = path.join(gseDir, 'state.json')
  const evidenceIndexPath = path.join(gseDir, 'evidence', 'index.jsonl')
  const stateResult = readJson(statePath)
  const evidenceIndex = readJsonl(evidenceIndexPath)
  const state = stateResult.ok ? stateResult.data : null
  const latestEvidence = evidenceIndex.records.at(-1) ?? null
  const actions = []
  const writes = []

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
        ? 'Back up .gse/state.json, inspect the JSON error, then run node <gse-skill>/scripts/update-project-state.mjs --target <project-root> --force --json only if rebuilding from project docs is acceptable.'
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
        ? 'Back up .gse/evidence/index.jsonl, fix the reported line, and rerun /gse continue before implementation.'
        : 'node <gse-skill>/scripts/update-project-state.mjs --target <project-root> --json',
    ))
  }

  if (state) {
    const residualRisks = Array.isArray(state.residualRisks) ? state.residualRisks : []
    const longRisks = residualRisks.filter((risk) => String(risk).length > riskLengthLimit)
    if (!Array.isArray(state.residualRisks)) {
      actions.push(repairAction(
        'SR04',
        'warning',
        '.gse/state.json',
        'residualRisks is missing or is not an array.',
        'Set residualRisks to an explicit array; use [] only when there are no known residual risks.',
      ))
    } else if (residualRisks.length > riskLimit) {
      actions.push(repairAction(
        'SR05',
        'warning',
        '.gse/state.json',
        `${residualRisks.length} active residual risks exceed compact limit ${riskLimit}.`,
        'node <gse-skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse repair" --execute --json',
        { writeSupported: true, safeToAutoRepair: true },
      ))
      if (writeChanges) {
        const backupPath = backupFile(statePath)
        const repairedState = compactRisks(state, riskLimit)
        fs.writeFileSync(statePath, JSON.stringify(repairedState, null, 2) + '\n', 'utf8')
        writes.push({
          action: 'compact-residual-risks',
          targetPath: '.gse/state.json',
          backupPath: backupPath ? relative(resolvedTarget, backupPath) : null,
          kept: repairedState.residualRisks.length,
          archived: residualRisks.length - repairedState.residualRisks.length,
        })
      }
    }
    if (longRisks.length) {
      actions.push(repairAction(
        'SR06',
        'warning',
        '.gse/state.json',
        `${longRisks.length} residual risk(s) exceed ${riskLengthLimit} characters.`,
        'Shorten active risks to current decision-useful summaries and move detail into riskArchive or the evidence log.',
      ))
    }
  }

  if (state && evidenceIndex.ok && evidenceIndex.records.length > 0) {
    if (state.lastEvidence && latestEvidence?.evidenceFile && state.lastEvidence !== latestEvidence.evidenceFile) {
      actions.push(repairAction(
        'SR07',
        'warning',
        '.gse/state.json',
        `lastEvidence points to ${state.lastEvidence}, but latest evidence index record points to ${latestEvidence.evidenceFile}.`,
        'Update lastEvidence to the latest evidence file after confirming the newest record belongs to the current project state.',
      ))
    }
    if (latestEvidence?.evidenceFile && !latestEvidenceFileExists(resolvedTarget, latestEvidence)) {
      actions.push(repairAction(
        'SR08',
        'hard',
        '.gse/evidence/index.jsonl',
        `Latest evidence file is missing: ${latestEvidence.evidenceFile}.`,
        'Restore the referenced evidence file or append a new evidence record that points to an existing file.',
      ))
    }
    if (
      state.currentSlice?.nextAction &&
      latestEvidence?.nextAction &&
      state.currentSlice.nextAction !== latestEvidence.nextAction
    ) {
      actions.push(repairAction(
        'SR09',
        'warning',
        '.gse/state.json',
        'currentSlice.nextAction differs from the latest evidence nextAction.',
        'Confirm whether state or evidence is newer; update only the stale side before selecting an implementation slice.',
      ))
    }
  }

  const hardActions = actions.filter((item) => item.severity === 'hard')
  const warningActions = actions.filter((item) => item.severity === 'warning')
  return {
    root,
    target: resolvedTarget,
    generatedAt: new Date().toISOString(),
    write: writeChanges,
    summary: {
      status: hardActions.length ? 'repair-required' : warningActions.length ? 'repair-advised' : 'clean',
      hard: hardActions.length,
      warnings: warningActions.length,
      actions: actions.length,
      writes: writes.length,
    },
    state: {
      exists: stateResult.exists,
      valid: stateResult.ok,
      currentSliceId: state?.currentSlice?.id ?? null,
      nextAction: state?.currentSlice?.nextAction ?? null,
      residualRisks: Array.isArray(state?.residualRisks) ? state.residualRisks.length : null,
      riskArchive: Array.isArray(state?.riskArchive) ? state.riskArchive.length : null,
    },
    evidenceIndex: {
      exists: evidenceIndex.exists,
      valid: evidenceIndex.ok,
      records: evidenceIndex.records.length,
      latestEvidenceFile: latestEvidence?.evidenceFile ?? null,
      latestNextAction: latestEvidence?.nextAction ?? null,
    },
    repairActions: actions,
    writes,
    limits: [
      'Default mode is diagnostic; it does not modify project files.',
      'Automatic writes are limited to reversible residual-risk compaction with a backup.',
      'Invalid JSON/JSONL is not guessed or overwritten; repair the reported file or rebuild state from project docs deliberately.',
    ],
  }
}

function createFixture(kind) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gse-state-repair-${kind}-`))
  fs.mkdirSync(path.join(dir, '.gse', 'evidence'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.gse', 'README.md'), '# GSE\n', 'utf8')
  const state = {
    schemaVersion: 1,
    projectName: 'repair-fixture',
    mode: 'standard',
    canonicalPlan: '',
    phase: 'execute',
    currentSlice: {
      id: 'repair-fixture',
      outcome: 'Repair fixture.',
      status: 'verified',
      nextAction: kind === 'stale' ? 'Stale state action.' : 'Run next repair fixture.',
    },
    lastEvidence: '.gse/evidence/2026-07-08.md',
    residualRisks: kind === 'overlong'
      ? Array.from({ length: 9 }, (_, index) => `Fixture risk ${index + 1}.`)
      : ['Fixture risk.'],
    riskArchive: [],
  }
  if (kind === 'bad-state') fs.writeFileSync(path.join(dir, '.gse', 'state.json'), '{ bad json\n', 'utf8')
  else fs.writeFileSync(path.join(dir, '.gse', 'state.json'), JSON.stringify(state, null, 2) + '\n', 'utf8')
  const record = {
    date: '2026-07-08',
    recordType: 'slice',
    status: 'verified',
    evidenceLevel: 'verified-unit',
    requiredEvidenceLevel: 'verified-unit',
    summary: 'Repair fixture evidence.',
    evidenceFile: '.gse/evidence/2026-07-08.md',
    commands: ['fixture'],
    nextAction: 'Run next repair fixture.',
  }
  fs.writeFileSync(path.join(dir, '.gse', 'evidence', '2026-07-08.md'), '# Evidence\n', 'utf8')
  fs.writeFileSync(
    path.join(dir, '.gse', 'evidence', 'index.jsonl'),
    kind === 'bad-jsonl' ? '{"date":"2026-07-08"\n' : JSON.stringify(record) + '\n',
    'utf8',
  )
  return dir
}

function runSelfTest() {
  const clean = createFixture('clean')
  const badState = createFixture('bad-state')
  const badJsonl = createFixture('bad-jsonl')
  const overlong = createFixture('overlong')
  const stale = createFixture('stale')
  const writeFixture = createFixture('overlong')
  const reports = {
    clean: auditStateRepair(clean),
    badState: auditStateRepair(badState),
    badJsonl: auditStateRepair(badJsonl),
    overlong: auditStateRepair(overlong),
    stale: auditStateRepair(stale),
    write: auditStateRepair(writeFixture, { write: true }),
  }
  const checks = [
    { id: 'SR-T01', status: reports.clean.summary.status === 'clean' ? 'passed' : 'failed', evidence: reports.clean.summary.status },
    { id: 'SR-T02', status: reports.badState.repairActions.some((item) => item.id === 'SR02' && item.severity === 'hard') ? 'passed' : 'failed', evidence: 'bad state fixture' },
    { id: 'SR-T03', status: reports.badJsonl.repairActions.some((item) => item.id === 'SR03' && item.severity === 'hard') ? 'passed' : 'failed', evidence: 'bad JSONL fixture' },
    { id: 'SR-T04', status: reports.overlong.repairActions.some((item) => item.id === 'SR05' && item.safeToAutoRepair) ? 'passed' : 'failed', evidence: 'overlong risk fixture' },
    { id: 'SR-T05', status: reports.stale.repairActions.some((item) => item.id === 'SR09') ? 'passed' : 'failed', evidence: 'stale nextAction fixture' },
    {
      id: 'SR-T06',
      status: reports.write.writes.some((item) => item.action === 'compact-residual-risks' && String(item.backupPath).startsWith('.gse/backups/')) && reports.write.state.residualRisks === 9 ? 'passed' : 'failed',
      evidence: 'write report keeps pre-write count and records .gse backup',
    },
  ]
  const passed = checks.filter((item) => item.status === 'passed').length
  const failed = checks.length - passed
  for (const dir of [clean, badState, badJsonl, overlong, stale, writeFixture]) fs.rmSync(dir, { recursive: true, force: true })
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
  const report = selfTest ? runSelfTest() : auditStateRepair(targetArg, { write })

  if (jsonOnly) console.log(JSON.stringify(report, null, 2))
  else console.log(JSON.stringify(report, null, 2))

  if (report.summary.status === 'failed' || report.summary.status === 'repair-required') process.exit(1)
}
