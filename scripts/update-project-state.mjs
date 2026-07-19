#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { executeTransaction } from './core/persistence/transaction.mjs'
import { ALLOWED_FIELDS_BY_RECORD_TYPE } from './core/persistence/record-allowlists.mjs'
import { executeGseV1Migration, inspectGseV1Project } from './core/migration-v1.mjs'

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

function findCanonicalPlan(target) {
  const texts = [
    readText(path.join(target, '.gse', 'README.md')),
    readText(path.join(target, '.gse', 'project-profile.md')),
    readText(path.join(target, '.gse', 'goal-map.md')),
  ].join('\n')
  const match = texts.match(/docs\/[A-Za-z0-9._/-]*?(?:architecture|productization)[A-Za-z0-9._/-]*?\.md/)
  if (match && exists(target, match[0])) return match[0]
  for (const fallback of [
    'docs/aion-productization-architecture.md',
    'docs/museflow-ai-film-productization-architecture.md',
  ]) {
    if (exists(target, fallback)) return fallback
  }
  return ''
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

function buildState(target) {
  const profile = readText(path.join(target, '.gse', 'project-profile.md'))
  const goalMap = readText(path.join(target, '.gse', 'goal-map.md'))
  const projectName = firstMatch(profile, /Product\/system name:\s*([^\n]+)/i) || firstMatch(profile, /Product\/system name\s*:\s*([^\n]+)/i) || path.basename(target)
  const canonicalPlan = findCanonicalPlan(target)
  const activeSlice = firstMatch(goalMap, /Active slice:\s*([^\n]+)/i) || 'Continue from the project goal map.'
  const nextAction = firstMatch(goalMap, /Next action:\s*([^\n]+)/i) || 'Pick the next verifiable slice.'
  return {
    schemaVersion: 1,
    projectName,
    mode: detectMode(target),
    canonicalPlan,
    phase: 'execute',
    currentSlice: {
      id: '',
      outcome: activeSlice,
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
    residualRisks: [
      'State/index was generated by GSE update; project-specific tool statuses remain unknown until verified.',
    ],
  }
}

async function updateProject(target) {
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
  const nextState = {
    ...buildState(resolvedTarget),
    stateRevision: stateData.stateRevision,
    activeChangeId: stateData.activeChangeId,
  }
  if (!state.exists && !dryRun) {
    fs.writeFileSync(path.join(resolvedTarget, '.gse', 'state.json'), JSON.stringify(stateData) + '\n', 'utf8')
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
    })
    if (transaction.status !== 'complete') throw new Error(transaction.message)
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
    recommendation: warnings.length ? 'Review warnings before staging project-local .gse changes.' : 'Run target doctor and close gate before claiming the project update is verified.',
  }
}

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-state-update-'))
  fs.mkdirSync(path.join(dir, '.gse', 'evidence'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.gse', 'README.md'), '# GSE\n\nCanonical plan: `docs/productization-architecture.md`.\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'project-profile.md'), '# Project Profile\n\n- Product/system name: Fixture Product.\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'goal-map.md'), '# Goal Map\n\n## Current Focus\n\n- Active slice: Fixture migration.\n- Next action: Verify fixture migration.\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'quality-gates.md'), '# Quality Gates\n\n## Universal\n', 'utf8')
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs', 'productization-architecture.md'), '# Plan\n', 'utf8')
  return dir
}

const target = selfTest ? createFixture() : targetArg
const report = await updateProject(target)

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else {
  console.log('# GSE Project State Update')
  console.log('')
  console.log('Target: ' + report.target)
  console.log('Status: ' + report.summary.status)
  for (const item of report.results) console.log('- ' + item.relativePath + ': ' + item.status + (item.reason ? ' (' + item.reason + ')' : ''))
  for (const warning of report.warnings) console.log('- warning: ' + warning)
}

if (report.summary.status === 'failed') process.exit(1)
