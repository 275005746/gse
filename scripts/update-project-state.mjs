#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { executeTransaction } from './core/persistence/transaction.mjs'
import { ALLOWED_FIELDS_BY_RECORD_TYPE } from './core/persistence/record-allowlists.mjs'
import { executeGseV1Migration, inspectGseV1Project } from './core/migration-v1.mjs'
import {
  resolveProjectAuthority,
  validateProjectAuthorityDigests,
} from './core/project-authority.mjs'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const jsonOnly = args.includes('--json')
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')
const executeMigration = args.includes('--execute')
const selfTest = args.includes('--self-test') || !args.includes('--target')
const targetArg = readArg('--target')
const date = new Date().toISOString().slice(0, 10)

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function exists(target, relativePath) {
  return fs.existsSync(path.join(target, relativePath))
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, ok: false, data: null, error: 'missing' }
  try {
    return { exists: true, ok: true, data: JSON.parse(readText(filePath)), error: '' }
  } catch (error) {
    return { exists: true, ok: false, data: null, error: error.message }
  }
}

function runGit(target, commandArgs) {
  const result = spawnSync('git', commandArgs, {
    cwd: target,
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

function cleanInlineValue(value) {
  return String(value || '').trim().replace(/[.。:：]+$/, '').trim()
}

function firstMatch(text, regex) {
  const match = text.match(regex)
  return match ? cleanInlineValue(match[1]) : ''
}

function detectMode(target) {
  if (exists(target, '.gse/hooks/README.md') || exists(target, '.gse/mcp/README.md') || exists(target, '.gse/plugins/README.md')) return 'enterprise'
  if (exists(target, '.gse/agents/roles.md') || exists(target, '.gse/agent-workspace.md')) return 'standard'
  return 'lite'
}

function detectSparseWarning(target) {
  const sparse = runGit(target, ['sparse-checkout', 'list'])
  const sparseLines = sparse.status === 0 && sparse.stdout ? sparse.stdout.split(/\r?\n/).map((line) => line.trim().replace(/\\/g, '/')).filter(Boolean) : []
  const sparseEnabled = sparse.status === 0 && sparseLines.length > 0
  const sparseIncludesGse = sparseLines.some((line) => line === '.gse' || line === '.gse/' || line.startsWith('.gse/') || line === '/*' || line === '*')
  if (sparseEnabled && !sparseIncludesGse) {
    return `sparse-checkout excludes .gse; use git add --sparse for project-local GSE updates or add .gse to sparse rules.`
  }
  return ''
}

function writeFile(target, relativePath, content, results) {
  const fullPath = path.join(target, relativePath)
  const alreadyExists = fs.existsSync(fullPath)
  if (alreadyExists && !force) {
    results.push({ relativePath, status: 'skipped', reason: 'exists' })
    return
  }
  if (!dryRun) {
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content.replace(/\n/g, '\r\n'), 'utf8')
  }
  results.push({ relativePath, status: dryRun ? (alreadyExists ? 'would-skip' : 'would-write') : alreadyExists ? 'overwritten' : 'written' })
}

function buildState(target, authority) {
  const profile = readText(path.join(target, '.gse', 'project-profile.md'))
  const projectName = firstMatch(profile, /Product\/system name:\s*([^\n]+)/i) || firstMatch(profile, /Product\/system name\s*:\s*([^\n]+)/i) || path.basename(target)
  const existingState = authority.authoritativeState
  const currentSlice = existingState?.currentSlice
    ?? authority.sources.currentSlice.value
  const canonicalGoalSource = authority.sources.canonicalGoal.path ?? ''
  return {
    schemaVersion: 1,
    projectName: existingState?.projectName ?? projectName,
    mode: existingState?.mode ?? detectMode(target),
    canonicalGoalSource,
    canonicalPlan: canonicalGoalSource,
    phase: existingState?.phase ?? 'execute',
    currentSlice: currentSlice
      ? {
          id: currentSlice.id ?? '',
          outcome: currentSlice.outcome ?? '',
          status: currentSlice.status ?? 'planned',
          nextAction: currentSlice.nextAction ?? 'Pick the next verifiable slice.',
        }
      : {
          id: '',
          outcome: 'Continue from the current Slice contract.',
          status: 'planned',
          nextAction: 'Pick the next verifiable slice.',
        },
    toolStatuses: existingState?.toolStatuses ?? {
      browser: 'unknown',
      lsp: 'unknown',
      mcp: 'unknown',
      subagents: 'unknown',
      ci: 'unknown',
    },
    lastEvidence: existingState?.lastEvidence ?? '.gse/evidence/index.jsonl',
    residualRisks: Array.isArray(existingState?.residualRisks)
      ? existingState.residualRisks
      : ['State/index was generated by GSE update; project-specific tool statuses remain unknown until verified.'],
  }
}

async function updateProject(target, options = {}) {
  const resolvedTarget = path.resolve(target)
  const results = []
  const warnings = []
  if (!exists(resolvedTarget, '.gse')) {
    return {
      target: resolvedTarget,
      generatedAt: new Date().toISOString(),
      dryRun,
      force,
      summary: { status: 'failed', written: 0, skipped: 0, warnings: 0, total: 0 },
      results,
      warnings: ['missing .gse directory'],
      recommendation: 'Run init-project.mjs first or adopt GSE before updating state/index.',
    }
  }

  const state = readJson(path.join(resolvedTarget, '.gse', 'state.json'))
  if (state.exists && !state.ok) {
    return {
      target: resolvedTarget,
      generatedAt: new Date().toISOString(),
      dryRun,
      force,
      summary: { status: 'failed', written: 0, skipped: 0, warnings: 0, total: 0 },
      results,
      warnings: ['existing .gse/state.json is invalid and cannot be rebuilt automatically'],
      recommendation: 'Repair the reported JSON deliberately; --force does not bypass malformed project state.',
    }
  }
  if (state.ok) {
    const migration = executeMigration
      ? await executeGseV1Migration(resolvedTarget)
      : inspectGseV1Project(resolvedTarget)
    if (migration.reasonCode !== 'PROJECT_STATE_V1_CANONICAL') {
      const proposedWrites = Array.isArray(migration.proposedWrites) ? migration.proposedWrites : []
      const artifactRefs = Array.isArray(migration.artifactRefs) ? [...new Set(migration.artifactRefs)] : []
      const diagnostics = Array.isArray(migration.diagnostics) ? migration.diagnostics : []
      return {
        target: resolvedTarget,
        generatedAt: new Date().toISOString(),
        dryRun: !executeMigration,
        force,
        summary: {
          status: migration.status === 'complete' ? 'passed' : migration.status === 'proceed' ? 'migration-available' : 'failed',
          written: migration.status === 'complete' ? artifactRefs.length : 0,
          skipped: 0,
          warnings: diagnostics.length,
          total: migration.status === 'complete' ? artifactRefs.length : proposedWrites.length,
        },
        results: (migration.status === 'complete' ? artifactRefs : proposedWrites.map((write) => write.path))
          .map((relativePath) => ({
            relativePath,
            status: migration.status === 'complete' ? 'written' : 'would-write',
          })),
        warnings: diagnostics.map((item) => item.code),
        migration,
        recommendation: executeMigration
          ? `${migration.message} Rerun the update after migration to refresh adoption state.`
          : 'Review the Core v1 migration proposal, then rerun with --execute to migrate before updating project state.',
      }
    }
  }
  const authorityBeforeBootstrap = resolveProjectAuthority(resolvedTarget)
  if (state.ok && !authorityBeforeBootstrap.safeToContinue) {
    return {
      target: resolvedTarget,
      generatedAt: new Date().toISOString(),
      dryRun,
      force,
      summary: { status: 'blocked', written: 0, skipped: 0, warnings: 0, total: 0 },
      results,
      warnings: authorityBeforeBootstrap.conflicts
        .filter((item) => item.severity === 'blocked')
        .map((item) => item.code),
      currentStateAuthority: authorityBeforeBootstrap,
      recommendation: 'Resolve conflicting current-state authority sources deliberately before publishing an update.',
    }
  }

  const sparseWarning = detectSparseWarning(resolvedTarget)
  if (sparseWarning) warnings.push(sparseWarning)

  const evidenceIndexRecord = {
    eventId: `adoption-update-${date}`,
    date,
    timestamp: new Date().toISOString(),
    recordType: 'adoption',
    status: 'result',
    evidenceLevel: 'result',
    requiredEvidenceLevel: 'result',
    summary: 'Added GSE machine-readable state and evidence index for an existing project.',
    evidenceFile: `.gse/evidence/${date}.md`,
    commands: ['node <gse-skill>/scripts/update-project-state.mjs --target <project-root>'],
    nextAction: 'Run target doctor, generate-session-prompt, and close gate to verify project-local readiness.',
  }

  const stateData = state.ok ? state.data : { schemaVersion: 1, stateRevision: 0, activeChangeId: null }
  if (!state.exists && !dryRun) {
    fs.writeFileSync(path.join(resolvedTarget, '.gse', 'state.json'), JSON.stringify(stateData) + '\n', 'utf8')
  }
  const authority = resolveProjectAuthority(resolvedTarget)
  const nextState = {
    ...buildState(resolvedTarget, authority),
    stateRevision: stateData.stateRevision,
    activeChangeId: stateData.activeChangeId,
  }
  if (dryRun) {
    writeFile(resolvedTarget, '.gse/state.json', JSON.stringify(nextState, null, 2) + '\n', results)
    writeFile(resolvedTarget, '.gse/evidence/index.jsonl', JSON.stringify(evidenceIndexRecord) + '\n', results)
  } else {
    const transaction = await executeTransaction({
      target: resolvedTarget,
      operationId: `update-project-state-${date}`,
      expectedRevision: stateData.stateRevision,
      writes: [{ kind: 'json-replace', path: '.gse/state.json', value: nextState }],
      events: [{ path: '.gse/evidence/index.jsonl', event: evidenceIndexRecord }],
      allowedFieldsByRecordType: ALLOWED_FIELDS_BY_RECORD_TYPE,
      validatePreconditions: () => {
        if (typeof options.beforeValidatePreconditions === 'function') {
          options.beforeValidatePreconditions(resolvedTarget)
        }
        return validateProjectAuthorityDigests(
          resolvedTarget,
          authority.sourceDigests,
        )
      },
    })
    if (transaction.status !== 'complete') {
      return {
        target: resolvedTarget,
        generatedAt: new Date().toISOString(),
        dryRun,
        force,
        summary: { status: 'blocked', written: 0, skipped: 0, warnings: 0, total: 0 },
        results,
        warnings: [transaction.reasonCode],
        transaction,
        currentStateAuthority: authority,
        recommendation: transaction.safeToRetry
          ? 'Re-read current-state authority sources and retry the update.'
          : 'Inspect the failed transaction before retrying.',
      }
    }
    results.push({ relativePath: '.gse/state.json', status: 'written' })
    results.push({ relativePath: '.gse/evidence/index.jsonl', status: 'written' })
  }

  const written = results.filter((item) => ['written', 'overwritten', 'would-write'].includes(item.status)).length
  const skipped = results.filter((item) => ['skipped', 'would-skip'].includes(item.status)).length
  return {
    target: resolvedTarget,
    generatedAt: new Date().toISOString(),
    dryRun,
    force,
    summary: {
      status: warnings.length ? 'warning' : 'passed',
      written,
      skipped,
      warnings: warnings.length,
      total: results.length,
    },
    results,
    warnings,
    currentStateAuthority: {
      status: authority.status,
      stateRevision: authority.stateRevision,
      safeToContinue: authority.safeToContinue,
      sources: authority.sources,
      sourceDigests: authority.sourceDigests,
      conflicts: authority.conflicts,
      freshness: authority.freshness,
    },
    recommendation: warnings.length ? 'Review warnings before staging project-local .gse changes.' : 'Run target doctor and close gate before claiming the project update is verified.',
  }
}

function writeCanonicalFixtureState(dir, nextAction = 'Verify fixture migration.') {
  const state = {
    schemaVersion: 1,
    stateRevision: 0,
    activeChangeId: null,
    projectName: 'Fixture Product',
    mode: 'lite',
    canonicalGoalSource: 'docs/productization-architecture.md',
    canonicalPlan: 'docs/productization-architecture.md',
    phase: 'execute',
    currentSlice: {
      id: 'fixture-migration',
      outcome: 'Fixture migration.',
      status: 'planned',
      nextAction,
    },
    toolStatuses: {
      browser: 'unknown',
      lsp: 'unknown',
      mcp: 'unknown',
      subagents: 'unknown',
      ci: 'unknown',
    },
    lastEvidence: '.gse/evidence/index.jsonl',
    residualRisks: ['Fixture risk.'],
  }
  fs.writeFileSync(
    path.join(dir, '.gse', 'state.json'),
    JSON.stringify(state, null, 2) + '\n',
    'utf8',
  )
  fs.writeFileSync(
    path.join(dir, '.gse', 'current-slice.md'),
    [
      '# Current Slice',
      '',
      '- Slice ID: fixture-migration',
      '',
      '## Outcome',
      '',
      'Fixture migration.',
      '',
      '## Status',
      '',
      'planned',
      '',
      '## Next Action',
      '',
      nextAction,
      '',
    ].join('\n'),
    'utf8',
  )
  fs.writeFileSync(
    path.join(dir, '.gse', 'evidence', 'index.jsonl'),
    '',
    'utf8',
  )
}

function createFixture(kind = 'adoption') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gse-state-update-${kind}-`))
  fs.mkdirSync(path.join(dir, '.gse', 'evidence'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.gse', 'README.md'), '# GSE\n\nCanonical plan: `docs/productization-architecture.md`.\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'project-profile.md'), '# Project Profile\n\n- Product/system name: Fixture Product.\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'goal-map.md'), '# Goal Map\n\n## Current Focus\n\n- Active slice: Fixture migration.\n- Next action: Verify fixture migration.\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'quality-gates.md'), '# Quality Gates\n\n## Universal\n', 'utf8')
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs', 'productization-architecture.md'), '# Plan\n', 'utf8')
  if (kind !== 'adoption') writeCanonicalFixtureState(dir)
  if (kind === 'authority-conflict') {
    fs.writeFileSync(
      path.join(dir, '.gse', 'current-slice.md'),
      readText(path.join(dir, '.gse', 'current-slice.md'))
        .replace('Verify fixture migration.', 'Publish conflicting projection.'),
      'utf8',
    )
  }
  return dir
}

async function runSelfTest() {
  const adoption = createFixture()
  const authorityConflict = createFixture('authority-conflict')
  const sourceChange = createFixture('source-change')
  try {
    const report = await updateProject(adoption)
    const conflictStateBefore = fs.readFileSync(path.join(authorityConflict, '.gse', 'state.json'))
    const conflictEvidenceBefore = fs.readFileSync(path.join(authorityConflict, '.gse', 'evidence', 'index.jsonl'))
    const conflictReport = await updateProject(authorityConflict)
    const sourceStateBefore = fs.readFileSync(path.join(sourceChange, '.gse', 'state.json'))
    const sourceEvidenceBefore = fs.readFileSync(path.join(sourceChange, '.gse', 'evidence', 'index.jsonl'))
    const sourceChangeReport = await updateProject(sourceChange, {
      beforeValidatePreconditions: (target) => {
        fs.appendFileSync(
          path.join(target, '.gse', 'goal-map.md'),
          '\n<!-- concurrent authority source change -->\n',
          'utf8',
        )
      },
    })
    const checks = [
      {
        id: 'UPS-T01',
        status: report.summary.status === 'passed'
          && report.summary.written === 2
          ? 'passed' : 'failed',
        evidence: 'initial adoption publishes state and evidence through one transaction',
      },
      {
        id: 'UPS-T02',
        status: conflictReport.summary.status === 'blocked'
          && conflictReport.warnings.includes('CURRENT_SLICE_NEXT_ACTION_CONFLICT')
          && fs.readFileSync(path.join(authorityConflict, '.gse', 'state.json')).equals(conflictStateBefore)
          && fs.readFileSync(path.join(authorityConflict, '.gse', 'evidence', 'index.jsonl')).equals(conflictEvidenceBefore)
          ? 'passed' : 'failed',
        evidence: 'material authority conflict blocks publication without choosing precedence',
      },
      {
        id: 'UPS-T03',
        status: sourceChangeReport.summary.status === 'blocked'
          && sourceChangeReport.transaction?.reasonCode === 'CURRENT_STATE_SOURCE_CHANGED'
          && sourceChangeReport.transaction?.safeToRetry === true
          && fs.readFileSync(path.join(sourceChange, '.gse', 'state.json')).equals(sourceStateBefore)
          && fs.readFileSync(path.join(sourceChange, '.gse', 'evidence', 'index.jsonl')).equals(sourceEvidenceBefore)
          ? 'passed' : 'failed',
        evidence: 'authority digest drift publishes neither state nor evidence and is retryable',
      },
    ]
    const passed = checks.filter((item) => item.status === 'passed').length
    return {
      ...report,
      selfTest: {
        status: passed === checks.length ? 'passed' : 'failed',
        passed,
        failed: checks.length - passed,
        total: checks.length,
        checks,
      },
    }
  } finally {
    for (const dir of [adoption, authorityConflict, sourceChange]) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
}

const report = selfTest
  ? await runSelfTest()
  : await updateProject(targetArg)

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else {
  console.log('# GSE Project State Update')
  console.log('')
  console.log('Target: ' + report.target)
  console.log('Status: ' + report.summary.status)
  for (const item of report.results) console.log('- ' + item.relativePath + ': ' + item.status + (item.reason ? ' (' + item.reason + ')' : ''))
  for (const warning of report.warnings) console.log('- warning: ' + warning)
}

if (report.summary.status === 'failed' || report.selfTest?.status === 'failed') process.exit(1)
