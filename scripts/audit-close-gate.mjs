#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { analyzeEvidenceLevels } from './audit-evidence-levels.mjs'
import { readRoleDispatchFallback } from './audit-role-dispatch-fallback.mjs'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const jsonOnly = args.includes('--json')
const selfTest = args.includes('--self-test') || !args.includes('--target')
const targetArg = readArg('--target')

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
  if (!fs.existsSync(filePath)) return { exists: false, ok: false, records: [], error: 'missing' }
  const lines = readText(filePath)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const records = []
  for (const [index, line] of lines.entries()) {
    try {
      records.push(JSON.parse(line))
    } catch (error) {
      return { exists: true, ok: false, records, error: `line ${index + 1}: ${error.message}` }
    }
  }
  return { exists: true, ok: true, records, error: '' }
}

function exists(target, relativePath) {
  return fs.existsSync(path.join(target, relativePath))
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

function normalizeGitPath(rawPath) {
  const normalized = rawPath.replace(/\\/g, '/')
  const renameMarker = ' -> '
  if (normalized.includes(renameMarker)) return normalized.split(renameMarker).pop()
  return normalized
}

function parseGitPorcelain(text) {
  const entries = []
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    const x = line[0] ?? ' '
    const y = line[1] ?? ' '
    const rawPath = line.slice(3).trim()
    const filePath = normalizeGitPath(rawPath)
    const untracked = x === '?' && y === '?'
    const staged = !untracked && x !== ' '
    const unstaged = !untracked && y !== ' '
    const conflict = x === 'U' || y === 'U' || ['AA', 'DD', 'AU', 'UA', 'DU', 'UD', 'UU'].includes(x + y)
    entries.push({ code: x + y, path: filePath, staged, unstaged, untracked, conflict })
  }
  return entries
}

const generatedArtifactPatterns = [
  /^output\//,
  /^playwright-report\//,
  /^test-results\//,
  /^coverage\//,
  /^\.nyc_output\//,
  /^node_modules\//,
  /^\.turbo\//,
  /^\.next\//,
  /^dist\//,
]

function isGeneratedArtifact(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/')
  return generatedArtifactPatterns.some((pattern) => pattern.test(normalized))
}

function summarizeGitEntries(entries) {
  const staged = entries.filter((entry) => entry.staged)
  const unstaged = entries.filter((entry) => entry.unstaged)
  const untracked = entries.filter((entry) => entry.untracked)
  const conflicts = entries.filter((entry) => entry.conflict)
  const mixed = entries.filter((entry) => entry.staged && entry.unstaged)
  const stagedGenerated = staged.filter((entry) => isGeneratedArtifact(entry.path))
  const dirtyGenerated = entries.filter((entry) => !entry.staged && isGeneratedArtifact(entry.path))
  return { staged, unstaged, untracked, conflicts, mixed, stagedGenerated, dirtyGenerated }
}

function statusFrom(ok, warn = false) {
  if (ok) return 'passed'
  if (warn) return 'warning'
  return 'failed'
}

function check(id, label, status, evidence, recommendation = '') {
  return { id, label, status, evidence, recommendation }
}

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-close-gate-'))
  fs.mkdirSync(path.join(dir, '.gse', 'evidence'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.gse', 'agents'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.gse', 'README.md'), '# GSE\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'project-profile.md'), '# Project Profile\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'goal-map.md'), '# Goal Map\n\nNext action: archive slice.\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'quality-gates.md'), '# Quality Gates\n\n## Universal\n\n- Evidence required.\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'evidence', '2026-07-06.md'), '# Evidence\n\nEvidence status: verified.\n', 'utf8')
  fs.writeFileSync(
    path.join(dir, '.gse', 'state.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        projectName: 'fixture-product',
        mode: 'standard',
        canonicalPlan: '',
        phase: 'verify',
        currentSlice: {
          id: 'fixture-close',
          outcome: 'Fixture close gate.',
          status: 'verified',
          nextAction: 'Archive slice.',
        },
        toolStatuses: {
          browser: 'unknown',
          lsp: 'unknown',
          mcp: 'unknown',
          subagents: 'unknown',
          ci: 'unknown',
        },
        lastEvidence: '.gse/evidence/2026-07-06.md',
        residualRisks: ['Fixture residual risk.'],
      },
      null,
      2,
    ) + '\n',
    'utf8',
  )
  fs.writeFileSync(
    path.join(dir, '.gse', 'evidence', 'index.jsonl'),
    JSON.stringify({
      date: '2026-07-06',
      recordType: 'slice',
      status: 'verified',
      evidenceLevel: 'verified-unit',
      requiredEvidenceLevel: 'verified-unit',
      summary: 'Fixture close gate evidence.',
      evidenceFile: '.gse/evidence/2026-07-06.md',
      commands: ['node scripts/audit-close-gate.mjs --self-test'],
      nextAction: 'Archive slice.',
    }) + '\n',
    'utf8',
  )
  fs.writeFileSync(
    path.join(dir, '.gse', 'agents', 'role-fallback-packets.md'),
    [
      '# Role Fallback Packets',
      '',
      '| Role | Mode | Real delegation used | Tool status | Fallback output | Evidence | Stop condition | Write access |',
      '|---|---|---|---|---|---|---|---|',
      '| Planner | sequential-role | no | unknown | Plan | fixture plan | Plan accepted | read-only |',
      '| Locator | sequential-role | no | unknown | File map | fixture map | Files identified | read-only |',
      '| Implementer | sequential-role | no | unknown | Patch | fixture patch | Patch complete | assigned files |',
      '| Verifier | sequential-role | no | unknown | Test results | fixture tests | Focused checks pass | evidence only |',
      '| Reviewer | sequential-role | no | unknown | Review notes | fixture review | No blocking findings | read-only |',
      '| Docs/Evidence | sequential-role | no | unknown | Evidence log | fixture evidence | Evidence recorded | docs/evidence only |',
      '| Release | sequential-role | no | unknown | Claim boundary | fixture release | External gates visible | read-only |',
      '',
    ].join('\n'),
    'utf8',
  )
  runGit(dir, ['init'])
  runGit(dir, ['config', 'user.email', 'gse-fixture@example.local'])
  runGit(dir, ['config', 'user.name', 'GSE Fixture'])
  runGit(dir, ['add', '.'])
  runGit(dir, ['commit', '-m', 'fixture'])
  return dir
}

function auditCloseGate(target) {
  const resolvedTarget = path.resolve(target)
  const gseDir = path.join(resolvedTarget, '.gse')
  const state = readJson(path.join(gseDir, 'state.json'))
  const evidenceIndex = readJsonl(path.join(gseDir, 'evidence', 'index.jsonl'))
  const evidenceLevelAnalysis = analyzeEvidenceLevels(evidenceIndex.records)
  const checks = []

  checks.push(
    check(
      'CG01',
      '.gse directory exists',
      statusFrom(exists(resolvedTarget, '.gse')),
      exists(resolvedTarget, '.gse') ? '.gse exists' : '.gse missing',
      exists(resolvedTarget, '.gse') ? '' : 'Initialize or adopt GSE before closing a slice.',
    ),
  )

  const stateValid =
    state.ok &&
    state.data?.schemaVersion === 1 &&
    typeof state.data?.phase === 'string' &&
    typeof state.data?.currentSlice?.status === 'string' &&
    typeof state.data?.currentSlice?.nextAction === 'string'
  checks.push(
    check(
      'CG02',
      'state.json is valid',
      statusFrom(stateValid),
      state.exists ? state.ok ? `phase:${state.data.phase}, status:${state.data.currentSlice?.status}` : 'invalid ' + state.error : 'missing',
      stateValid ? '' : 'Repair .gse/state.json before closing the slice.',
    ),
  )

  const indexValid =
    evidenceIndex.ok &&
    evidenceIndex.records.length > 0 &&
    evidenceIndex.records.every(
      (record) =>
        typeof record.date === 'string' &&
        typeof record.recordType === 'string' &&
        typeof record.status === 'string' &&
        typeof record.summary === 'string' &&
        typeof record.evidenceFile === 'string' &&
        Array.isArray(record.commands) &&
        typeof record.nextAction === 'string',
    )
  checks.push(
    check(
      'CG03',
      'evidence index is valid',
      statusFrom(indexValid),
      evidenceIndex.exists ? evidenceIndex.ok ? `${evidenceIndex.records.length} record(s)` : 'invalid ' + evidenceIndex.error : 'missing',
      indexValid ? '' : 'Record at least one evidence index entry before closing.',
    ),
  )

  const closeableState = ['verified', 'accepted'].includes(state.data?.currentSlice?.status)
  checks.push(
    check(
      'CG04',
      'current slice status is closeable',
      statusFrom(closeableState),
      `currentSlice.status:${state.data?.currentSlice?.status ?? 'unknown'}`,
      closeableState ? '' : 'Set currentSlice.status to verified or accepted only after focused evidence exists.',
    ),
  )

  const closeableEvidenceRecords = evidenceIndex.records.filter((record) => ['verified', 'accepted'].includes(record.status))
  const evidenceFilesExist =
    closeableEvidenceRecords.length > 0 &&
    closeableEvidenceRecords.every((record) => exists(resolvedTarget, record.evidenceFile))
  checks.push(
    check(
      'CG05',
      'verified or accepted evidence record exists',
      statusFrom(evidenceFilesExist),
      closeableEvidenceRecords.length
        ? closeableEvidenceRecords.map((record) => `${record.status}:${record.evidenceFile}:${exists(resolvedTarget, record.evidenceFile) ? 'exists' : 'missing'}`).join('; ')
        : 'no verified/accepted evidence index record',
      evidenceFilesExist ? '' : 'Add verified evidence and ensure the referenced evidence file exists.',
    ),
  )

  const requiredDocs = ['.gse/README.md', '.gse/project-profile.md', '.gse/goal-map.md', '.gse/quality-gates.md']
  const missingDocs = requiredDocs.filter((relativePath) => !exists(resolvedTarget, relativePath))
  checks.push(
    check(
      'CG06',
      'required workflow docs exist',
      statusFrom(missingDocs.length === 0),
      missingDocs.length ? 'missing: ' + missingDocs.join(', ') : `${requiredDocs.length}/${requiredDocs.length} present`,
      missingDocs.length ? 'Restore required workflow docs before closing.' : '',
    ),
  )

  const residualRisksOk = Array.isArray(state.data?.residualRisks)
  checks.push(
    check(
      'CG07',
      'residual risks are explicit',
      statusFrom(residualRisksOk),
      residualRisksOk ? `${state.data.residualRisks.length} residual risk(s)` : 'missing residualRisks array',
      residualRisksOk ? '' : 'Use an empty array if there is no known residual risk.',
    ),
  )

  const gitRoot = runGit(resolvedTarget, ['rev-parse', '--show-toplevel'])
  const isGitRepo = gitRoot.status === 0
  const gseStatus = isGitRepo ? runGit(resolvedTarget, ['status', '--short', '.gse']) : { status: 1, stdout: '', stderr: 'not a git repository' }
  checks.push(
    check(
      'CG08',
      '.gse git state is known',
      isGitRepo ? (gseStatus.stdout ? 'warning' : 'passed') : 'warning',
      isGitRepo ? gseStatus.stdout || 'clean' : 'not a git repository',
      isGitRepo && gseStatus.stdout ? 'Review and intentionally stage/commit or document project-local GSE changes.' : '',
    ),
  )

  const evidenceLevelStatus = evidenceLevelAnalysis.invalidLevel.length > 0
    ? 'failed'
    : evidenceLevelAnalysis.downgraded.length > 0 || evidenceLevelAnalysis.missingLevel.length > 0
      ? 'warning'
      : 'passed'
  checks.push(
    check(
      'CG09',
      'evidence level validity and downgrade labels are visible',
      evidenceLevelStatus,
      evidenceLevelAnalysis.invalidLevel.length
        ? `invalid evidence level(s): ${evidenceLevelAnalysis.invalidLevel.map((item) => `${item.summary}:${item.evidenceLevel}`).join('; ')}`
        : `${evidenceLevelAnalysis.recordsWithLevel}/${evidenceLevelAnalysis.records} record(s) with evidenceLevel; ${evidenceLevelAnalysis.downgraded.length} downgrade(s); ${evidenceLevelAnalysis.missingLevel.length} historical missing`,
      evidenceLevelAnalysis.invalidLevel.length
        ? 'Use one of the evidence levels from references/evidence-taxonomy.md.'
        : evidenceLevelAnalysis.downgraded.length
          ? 'Record whether the downgrade is acceptable for this slice before claiming browser, CI, owner, or release proof.'
          : '',
    ),
  )

  const roleFallback = readRoleDispatchFallback(resolvedTarget)
  const roleFallbackStatus = roleFallback.status === 'failed' ? 'failed' : roleFallback.status === 'warning' ? 'warning' : 'passed'
  checks.push(
    check(
      'CG10',
      'role dispatch and subagent claims are honest',
      roleFallbackStatus,
      roleFallback.exists
        ? roleFallback.summary.fakeDelegationRisk.length
          ? `fake delegation risk: ${roleFallback.summary.fakeDelegationRisk.join(', ')}`
          : `${roleFallback.summary.total} role packet(s); ${roleFallback.summary.sequentialFallbackRoles.length} sequential fallback role(s)`
        : 'role fallback packet missing',
      roleFallbackStatus === 'failed'
        ? 'Do not claim real subagent dispatch unless the current host/tool status is verified.'
        : roleFallbackStatus === 'warning'
          ? 'Adopt role fallback packets or record why role dispatch evidence is unavailable.'
          : '',
    ),
  )

  const fullGitStatus = isGitRepo ? runGit(resolvedTarget, ['status', '--porcelain=v1']) : { status: 1, stdout: '', stderr: 'not a git repository' }
  const gitEntries = isGitRepo && fullGitStatus.status === 0 ? parseGitPorcelain(fullGitStatus.stdout) : []
  const gitSummary = summarizeGitEntries(gitEntries)
  const ownershipStatus = !isGitRepo
    ? 'warning'
    : gitSummary.conflicts.length > 0 || gitSummary.mixed.length > 0
      ? 'failed'
      : gitEntries.length > 0
        ? 'warning'
        : 'passed'
  checks.push(
    check(
      'CG11',
      'worktree change ownership is bounded before close',
      ownershipStatus,
      isGitRepo
        ? gitEntries.length
          ? `${gitSummary.staged.length} staged, ${gitSummary.unstaged.length} unstaged, ${gitSummary.untracked.length} untracked, ${gitSummary.mixed.length} mixed, ${gitSummary.conflicts.length} conflict(s)`
          : 'worktree clean'
        : 'not a git repository',
      ownershipStatus === 'failed'
        ? 'Resolve merge conflicts or mixed staged/unstaged edits before closing so ownership and evidence are unambiguous.'
        : ownershipStatus === 'warning'
          ? 'Review changed files, exclude unrelated or generated artifacts, and stage/commit only the current slice.'
          : '',
    ),
  )

  const artifactStatus = gitSummary.stagedGenerated.length > 0 ? 'failed' : gitSummary.dirtyGenerated.length > 0 ? 'warning' : 'passed'
  checks.push(
    check(
      'CG12',
      'generated test artifacts are not staged as slice evidence',
      artifactStatus,
      gitSummary.stagedGenerated.length
        ? `staged generated artifact(s): ${gitSummary.stagedGenerated.map((entry) => entry.path).join(', ')}`
        : gitSummary.dirtyGenerated.length
          ? `dirty generated artifact(s): ${gitSummary.dirtyGenerated.map((entry) => entry.path).join(', ')}`
          : 'no generated/test output artifacts staged',
      artifactStatus === 'failed'
        ? 'Unstage generated test/browser/build artifacts unless the project explicitly requires them as source.'
        : artifactStatus === 'warning'
          ? 'Keep generated artifacts out of the commit or explain why they are required.'
          : '',
    ),
  )

  const failed = checks.filter((item) => item.status === 'failed').length
  const warnings = checks.filter((item) => item.status === 'warning').length
  const passed = checks.filter((item) => item.status === 'passed').length

  return {
    target: resolvedTarget,
    generatedAt: new Date().toISOString(),
    summary: {
      status: failed > 0 ? 'not-ready' : warnings > 0 ? 'ready-with-warnings' : 'ready',
      passed,
      warnings,
      failed,
      total: checks.length,
    },
    workflows: {
      closeGate: failed > 0 ? 'not-ready' : warnings > 0 ? 'ready-with-warnings' : 'ready',
    },
    state: {
      exists: state.exists,
      valid: stateValid,
      phase: state.data?.phase ?? null,
      currentSliceStatus: state.data?.currentSlice?.status ?? null,
      nextAction: state.data?.currentSlice?.nextAction ?? null,
    },
    evidenceIndex: {
      exists: evidenceIndex.exists,
      valid: indexValid,
      records: evidenceIndex.records.length,
      closeableRecords: closeableEvidenceRecords.length,
      evidenceLevels: {
        recordsWithLevel: evidenceLevelAnalysis.recordsWithLevel,
        missingLevel: evidenceLevelAnalysis.missingLevel.length,
        invalidLevel: evidenceLevelAnalysis.invalidLevel,
        downgraded: evidenceLevelAnalysis.downgraded,
      },
    },
    roleFallback: {
      exists: roleFallback.exists,
      status: roleFallback.status,
      total: roleFallback.summary.total,
      fakeDelegationRisk: roleFallback.summary.fakeDelegationRisk,
    },
    git: {
      isGitRepo,
      changedFiles: gitEntries.length,
      staged: gitSummary.staged.length,
      unstaged: gitSummary.unstaged.length,
      untracked: gitSummary.untracked.length,
      mixed: gitSummary.mixed.length,
      conflicts: gitSummary.conflicts.length,
      stagedGenerated: gitSummary.stagedGenerated.map((entry) => entry.path),
      dirtyGenerated: gitSummary.dirtyGenerated.map((entry) => entry.path),
    },
    checks,
    limits: [
      'Close gate is diagnostic. It reports ready/not-ready and does not modify files.',
      'A ready close gate does not replace user, reviewer, release, or owner acceptance when the project requires it.',
      'Project tests, browser smokes, CI, MCP, LSP, subagents, and release checks must still be run according to project quality gates.',
    ],
  }
}

function renderMarkdown(report) {
  const lines = []
  lines.push('# GSE Close Gate')
  lines.push('')
  lines.push('Generated: ' + report.generatedAt)
  lines.push('Target: ' + report.target)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + report.summary.status)
  lines.push('- Checks: ' + report.summary.passed + ' passed, ' + report.summary.warnings + ' warnings, ' + report.summary.failed + ' failed, ' + report.summary.total + ' total')
  lines.push('')
  lines.push('## Checks')
  lines.push('')
  for (const item of report.checks) {
    const marker = item.status === 'passed' ? '[x]' : item.status === 'warning' ? '[!]' : '[ ]'
    lines.push('- ' + marker + ' ' + item.id + ' ' + item.label + ': ' + item.evidence)
    if (item.recommendation) lines.push('  - Recommendation: ' + item.recommendation)
  }
  lines.push('')
  lines.push('## Limits')
  lines.push('')
  for (const item of report.limits) lines.push('- ' + item)
  return lines.join('\n') + '\n'
}

const target = selfTest ? createFixture() : targetArg
const report = auditCloseGate(target)

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(renderMarkdown(report))
