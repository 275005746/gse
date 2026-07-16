#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { findCanonicalGoalSources, hasGoalMapProjectionBoundary } from './canonical-goal-source.mjs'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const jsonOnly = args.includes('--json')
const selfTest = args.includes('--self-test') || !args.includes('--target')
const targetArg = readArg('--target')
const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))

function slash(value) {
  return value.replace(/\\/g, '/')
}

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

function listFiles(dir) {
  const files = []
  function visit(itemPath) {
    if (!fs.existsSync(itemPath)) return
    const stat = fs.statSync(itemPath)
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(itemPath)) visit(path.join(itemPath, child))
      return
    }
    if (stat.isFile()) files.push(itemPath)
  }
  visit(dir)
  return files
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

function statusFrom(ok, warn = false) {
  if (ok) return 'passed'
  if (warn) return 'warning'
  return 'failed'
}

function check(id, label, status, evidence, recommendation = '') {
  return { id, label, status, evidence, recommendation }
}

const requiredFiles = [
  '.gse/README.md',
  '.gse/project-profile.md',
  '.gse/goal-map.md',
  '.gse/goals/README.md',
  '.gse/quality-gates.md',
  '.gse/tooling.md',
  '.gse/templates/change-brief.md',
  '.gse/templates/evidence.md',
  '.gse/state.json',
  '.gse/evidence/index.jsonl',
]

const enterpriseFiles = [
  '.gse/agent-workspace.md',
  '.gse/agents/roles.md',
  '.gse/agents/dispatch.md',
  '.gse/skills/README.md',
  '.gse/lsp/README.md',
  '.gse/hooks/README.md',
  '.gse/mcp/README.md',
  '.gse/plugins/README.md',
  '.gse/release.md',
  '.gse/incident-review.md',
  '.gse/audit.md',
]

function auditTarget(target) {
  const resolvedTarget = path.resolve(target)
  const gseDir = path.join(resolvedTarget, '.gse')
  const checks = []

  const hasGse = fs.existsSync(gseDir)
  checks.push(
    check(
      'TPD01',
      '.gse directory exists',
      statusFrom(hasGse),
      hasGse ? '.gse exists' : '.gse missing',
      hasGse ? '' : 'Run GSE init/adopt before relying on project-local workflow files.',
    ),
  )

  const missingRequired = requiredFiles.filter((relativePath) => !exists(resolvedTarget, relativePath))
  checks.push(
    check(
      'TPD02',
      'required GSE files exist',
      statusFrom(missingRequired.length === 0),
      missingRequired.length === 0 ? `${requiredFiles.length}/${requiredFiles.length} required files present` : 'missing: ' + missingRequired.join(', '),
      missingRequired.length === 0 ? '' : 'Regenerate missing scaffold files or document why this project intentionally uses a smaller mode.',
    ),
  )

  const presentEnterprise = enterpriseFiles.filter((relativePath) => exists(resolvedTarget, relativePath))
  checks.push(
    check(
      'TPD03',
      'enterprise workspace files are visible when present',
      presentEnterprise.length === 0 ? 'warning' : 'passed',
      presentEnterprise.length === 0 ? 'no enterprise workspace files found' : `${presentEnterprise.length}/${enterpriseFiles.length} enterprise files present`,
      presentEnterprise.length === 0 ? 'Large or long-running projects should use standard/enterprise scaffold files.' : '',
    ),
  )

  const canonicalPlans = findCanonicalGoalSources(resolvedTarget)
  const existingCanonicalPlans = canonicalPlans.filter((item) => item.exists)
  const goalMapText = readText(path.join(resolvedTarget, '.gse', 'goal-map.md'))
  const goalMapProjectionBoundary = hasGoalMapProjectionBoundary(goalMapText, canonicalPlans)
  const statePath = path.join(resolvedTarget, '.gse', 'state.json')
  const evidenceIndexPath = path.join(resolvedTarget, '.gse', 'evidence', 'index.jsonl')
  const state = readJson(statePath)
  const evidenceIndex = readJsonl(evidenceIndexPath)
  checks.push(
    check(
      'TPD04',
      'canonical product goal source is discoverable',
      statusFrom(existingCanonicalPlans.length > 0),
      canonicalPlans.length === 0 ? 'no canonical product goal source found' : canonicalPlans.map((item) => `${item.relativePath}:${item.exists ? 'exists' : 'missing'}`).join(', '),
      existingCanonicalPlans.length > 0 ? '' : 'Record the project canonical product goal source in .gse/project-profile.md, .gse/README.md, or .gse/goal-map.md.',
    ),
  )
  checks.push(
    check(
      'TPD04b',
      '.gse goal map is an execution projection when a canonical product source exists',
      statusFrom(goalMapProjectionBoundary),
      existingCanonicalPlans.length === 0 ? 'no external canonical source discovered' : existingCanonicalPlans.map((item) => item.relativePath).join(', '),
      goalMapProjectionBoundary ? '' : 'Add a GSE execution projection notice to .gse/goal-map.md and resolve product-goal conflicts in favor of the canonical product source.',
    ),
  )
  checks.push(
    check(
      'TPD04c',
      'project state and evidence index are machine-readable continuation state',
      statusFrom(
        state.ok &&
          evidenceIndex.ok &&
          typeof state.data?.mode === 'string' &&
          typeof state.data?.phase === 'string' &&
          typeof state.data?.currentSlice?.nextAction === 'string' &&
          Array.isArray(evidenceIndex.records) &&
          evidenceIndex.records.length > 0,
        !state.exists || !evidenceIndex.exists,
      ),
      `state.json:${state.exists ? state.ok ? 'valid' : 'invalid ' + state.error : 'missing'}; evidence/index.jsonl:${evidenceIndex.exists ? evidenceIndex.ok ? `${evidenceIndex.records.length} record(s)` : 'invalid ' + evidenceIndex.error : 'missing'}`,
      state.ok && evidenceIndex.ok ? '' : 'Add or repair .gse/state.json and .gse/evidence/index.jsonl so future sessions can continue without parsing long Markdown.',
    ),
  )

  const qualityText = readText(path.join(resolvedTarget, '.gse', 'quality-gates.md'))
  const hasUniversalGate = qualityText.includes('Universal') || qualityText.includes('Universal Slice Gate')
  const hasDomainGate = /Identity|Chat|Canvas|UI|Browser|Media|Package|Encoding|Release|Recovery/i.test(qualityText)
  checks.push(
    check(
      'TPD05',
      'quality gates include universal and project/domain gates',
      statusFrom(hasUniversalGate && hasDomainGate, hasUniversalGate || hasDomainGate),
      `universal:${hasUniversalGate}, domain:${hasDomainGate}`,
      hasUniversalGate && hasDomainGate ? '' : 'Add project-specific quality gates instead of relying only on generic GSE wording.',
    ),
  )

  const evidenceDir = path.join(gseDir, 'evidence')
  const evidenceFiles = fs.existsSync(evidenceDir)
    ? listFiles(evidenceDir).filter((filePath) => /\.(md|json|jsonl)$/i.test(filePath))
    : []
  checks.push(
    check(
      'TPD06',
      'project-local GSE evidence exists',
      statusFrom(evidenceFiles.length > 0),
      evidenceFiles.length > 0 ? `${evidenceFiles.length} evidence file(s)` : 'no evidence files',
      evidenceFiles.length > 0 ? '' : 'Record adoption or slice evidence under .gse/evidence/.',
    ),
  )

  const gitRoot = runGit(resolvedTarget, ['rev-parse', '--show-toplevel'])
  const isGitRepo = gitRoot.status === 0
  checks.push(
    check(
      'TPD07',
      'target is inside a git repository',
      isGitRepo ? 'passed' : 'warning',
      isGitRepo ? slash(gitRoot.stdout) : gitRoot.stderr || 'not a git repository',
      isGitRepo ? '' : 'Git tracking checks are unavailable outside a git repository.',
    ),
  )

  let trackedGse = []
  if (isGitRepo) {
    const tracked = runGit(resolvedTarget, ['ls-files', '.gse'])
    trackedGse = tracked.status === 0 && tracked.stdout ? tracked.stdout.split(/\r?\n/).filter(Boolean) : []
    checks.push(
      check(
        'TPD08',
        '.gse files are tracked by git',
        statusFrom(trackedGse.length > 0),
        trackedGse.length > 0 ? `${trackedGse.length} tracked .gse file(s)` : 'no tracked .gse files',
        trackedGse.length > 0 ? '' : 'Project-level .gse files should normally be committed; caches and host-local folders should not.',
      ),
    )

    const status = runGit(resolvedTarget, ['status', '--short', '.gse'])
    checks.push(
      check(
        'TPD09',
        '.gse worktree is clean',
        status.status === 0 && status.stdout.length === 0 ? 'passed' : 'warning',
        status.stdout || 'clean',
        status.stdout ? 'Review and intentionally stage/commit or discard project-local GSE changes.' : '',
      ),
    )

    const sparse = runGit(resolvedTarget, ['sparse-checkout', 'list'])
    const sparseLines = sparse.status === 0 && sparse.stdout ? sparse.stdout.split(/\r?\n/).map((line) => slash(line.trim())).filter(Boolean) : []
    const sparseEnabled = sparse.status === 0 && sparseLines.length > 0
    const sparseIncludesGse = sparseLines.some((line) => line === '.gse' || line === '.gse/' || line.startsWith('.gse/') || line === '/*' || line === '*')
    checks.push(
      check(
        'TPD10',
        'sparse-checkout visibility for .gse is known',
        sparseEnabled && !sparseIncludesGse ? 'warning' : 'passed',
        sparseEnabled ? `sparse entries: ${sparseLines.join(', ') || '<empty>'}; includes .gse: ${sparseIncludesGse}` : 'sparse-checkout not enabled or no sparse list',
        sparseEnabled && !sparseIncludesGse ? 'Use git add --sparse for .gse updates or add .gse to sparse-checkout rules.' : '',
      ),
    )
  }

  const hostAdapterFindings = []
  for (const [hostDir, adapterPaths] of [
    ['.codex', ['.codex/gse-command.md', '.codex/gse-adapter.md']],
    ['.claude', ['.claude/commands/gse.md', '.claude/gse-adapter.md']],
  ]) {
    if (exists(resolvedTarget, hostDir)) {
      const candidates = adapterPaths.map((adapterPath) => {
        const text = readText(path.join(resolvedTarget, adapterPath))
        return {
          adapterPath,
          exists: exists(resolvedTarget, adapterPath),
          pointsToGse: text.includes('.gse/'),
        }
      })
      const matching = candidates.find((item) => item.exists && item.pointsToGse)
      hostAdapterFindings.push({
        hostDir,
        adapterPath: matching?.adapterPath ?? candidates[0].adapterPath,
        exists: Boolean(matching),
        pointsToGse: Boolean(matching),
        candidates,
      })
    }
  }
  const badAdapters = hostAdapterFindings.filter((item) => !item.exists || !item.pointsToGse)
  checks.push(
    check(
      'TPD11',
      'host adapters point back to .gse when host folders exist',
      hostAdapterFindings.length === 0 ? 'passed' : statusFrom(badAdapters.length === 0),
      hostAdapterFindings.length === 0 ? 'no Codex/Claude host folders detected' : hostAdapterFindings.map((item) => `${item.adapterPath}:exists=${item.exists},pointsToGse=${item.pointsToGse}`).join('; '),
      badAdapters.length === 0 ? '' : 'Generate or repair thin host adapters; do not duplicate policy outside .gse/.',
    ),
  )

  const stateHasCoreFields =
    state.ok &&
    state.data?.schemaVersion === 1 &&
    typeof state.data?.mode === 'string' &&
    typeof state.data?.phase === 'string' &&
    typeof state.data?.currentSlice?.status === 'string' &&
    state.data?.toolStatuses &&
    typeof state.data.toolStatuses === 'object'
  const evidenceIndexHasCoreFields =
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
  const stateIndexOk = stateHasCoreFields && evidenceIndexHasCoreFields
  const stateIndexWarn = !state.exists || !evidenceIndex.exists
  checks.push(
    check(
      'TPD12',
      'machine-readable state and evidence index are present',
      statusFrom(stateIndexOk, stateIndexWarn),
      `state.json:${state.exists ? state.ok ? 'valid' : 'invalid ' + state.error : 'missing'}; evidence/index.jsonl:${evidenceIndex.exists ? evidenceIndex.ok ? `${evidenceIndex.records.length} record(s)` : 'invalid ' + evidenceIndex.error : 'missing'}`,
      stateIndexOk ? '' : 'Add or repair .gse/state.json and .gse/evidence/index.jsonl so future sessions can continue without parsing long Markdown.',
    ),
  )

  const failed = checks.filter((item) => item.status === 'failed').length
  const warnings = checks.filter((item) => item.status === 'warning').length
  const passed = checks.filter((item) => item.status === 'passed').length
  return {
    target: resolvedTarget,
    generatedAt: new Date().toISOString(),
    summary: {
      status: failed > 0 ? 'failed' : warnings > 0 ? 'warning' : 'passed',
      passed,
      warnings,
      failed,
      total: checks.length,
    },
    workflows: {
      targetProjectDoctor: failed > 0 ? 'not-ready' : warnings > 0 ? 'verified-with-warnings' : 'verified',
    },
    state: {
      exists: state.exists,
      valid: stateHasCoreFields,
      phase: state.data?.phase ?? null,
      currentSliceStatus: state.data?.currentSlice?.status ?? null,
      lastEvidence: state.data?.lastEvidence ?? null,
    },
    evidenceIndex: {
      exists: evidenceIndex.exists,
      valid: evidenceIndexHasCoreFields,
      records: evidenceIndex.records.length,
    },
    canonicalPlans,
    goalMapProjectionBoundary,
    git: {
      isGitRepo,
      root: isGitRepo ? gitRoot.stdout : null,
      trackedGseCount: trackedGse.length,
    },
    checks,
    limits: [
      'Target project doctor is read-only.',
      'It checks project-local GSE adoption, git/sparse visibility, canonical product goal source discoverability, goal-map projection boundary, quality gates, evidence, and thin host adapter drift.',
      'It does not run project tests, browser smokes, CI, MCP, LSP, subagents, or release gates.',
    ],
  }
}

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-target-doctor-'))
  fs.mkdirSync(path.join(dir, '.gse', 'goals'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.gse', 'templates'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.gse', 'evidence'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.gse', 'agents'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.gse', 'skills'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.gse', 'lsp'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.gse', 'hooks'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.gse', 'mcp'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.gse', 'plugins'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })

  const files = {
    '.gse/README.md': '# GSE\n\nCanonical plan: `docs/productization-architecture.md`.\n',
    '.gse/state.json': JSON.stringify({
      schemaVersion: 1,
      projectName: 'fixture',
      mode: 'enterprise',
      canonicalGoalSource: 'docs/productization-architecture.md',
      canonicalPlan: 'docs/productization-architecture.md',
      phase: 'execute',
      currentSlice: {
        id: 'fixture-slice',
        outcome: 'fixture outcome',
        status: 'verified',
        nextAction: 'continue',
      },
      toolStatuses: {
        browser: 'unknown',
        lsp: 'unknown',
        mcp: 'unknown',
        subagents: 'unknown',
        ci: 'unknown',
      },
      lastEvidence: '.gse/evidence/index.jsonl',
      residualRisks: [],
    }, null, 2) + '\n',
    '.gse/project-profile.md': '# Project Profile\n\nProduct/system name: fixture.\n',
    '.gse/goal-map.md': '# Goal Map\n\nCanonical product goal source: `docs/productization-architecture.md`.\n\nThis file is a GSE execution projection. Canonical product goal source wins if this projection conflicts with product roadmap, architecture, PRD, or vision docs.\n\nNext action: continue.\n',
    '.gse/goals/README.md': '# Goal Details\n',
    '.gse/quality-gates.md': '# Quality Gates\n\n## Universal\n\n## UI Gate\n',
    '.gse/tooling.md': '# Tooling\n',
    '.gse/templates/change-brief.md': '# Change Brief\n',
    '.gse/templates/evidence.md': '# Evidence\n',
    '.gse/evidence/2026-07-06.md': '# Evidence\n',
    '.gse/evidence/index.jsonl': JSON.stringify({
      date: '2026-07-06',
      recordType: 'audit',
      status: 'verified',
      summary: 'Fixture target doctor evidence.',
      evidenceFile: '.gse/evidence/2026-07-06.md',
      commands: ['node scripts/audit-target-project.mjs --self-test'],
      nextAction: 'continue',
    }) + '\n',
    '.gse/agent-workspace.md': '# Agent Workspace\n',
    '.gse/agents/roles.md': '# Roles\n',
    '.gse/agents/dispatch.md': '# Dispatch\n',
    '.gse/skills/README.md': '# Skills\n',
    '.gse/lsp/README.md': '# LSP\n',
    '.gse/hooks/README.md': '# Hooks\n',
    '.gse/mcp/README.md': '# MCP\n',
    '.gse/plugins/README.md': '# Plugins\n',
    '.gse/release.md': '# Release\n',
    '.gse/incident-review.md': '# Incident\n',
    '.gse/audit.md': '# Audit\n',
    'docs/productization-architecture.md': '# Productization Architecture\n',
  }
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relativePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf8')
  }

  runGit(dir, ['init'])
  runGit(dir, ['config', 'user.email', 'gse-fixture@example.local'])
  runGit(dir, ['config', 'user.name', 'GSE Fixture'])
  runGit(dir, ['add', '.'])
  runGit(dir, ['commit', '-m', 'fixture'])
  return dir
}

function renderMarkdown(report) {
  const lines = []
  lines.push('# GSE Target Project Doctor')
  lines.push('')
  lines.push('Generated: ' + report.generatedAt)
  lines.push('Target: ' + report.target)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + report.summary.status)
  lines.push('- Checks: ' + report.summary.passed + ' passed, ' + report.summary.warnings + ' warnings, ' + report.summary.failed + ' failed, ' + report.summary.total + ' total')
  lines.push('- Workflow: ' + report.workflows.targetProjectDoctor)
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

let report
let fixtureDir = null
if (selfTest) {
  fixtureDir = createFixture()
  report = auditTarget(fixtureDir)
  report.selfTest = { fixtureDir }
} else {
  report = auditTarget(targetArg)
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(renderMarkdown(report))

if (report.summary.failed > 0) process.exit(1)
