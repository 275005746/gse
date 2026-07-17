#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { readProjectGuards } from './audit-project-guards.mjs'
import { analyzeEvidenceLevels } from './audit-evidence-levels.mjs'
import { analyzeEvidenceReviewQueue } from './audit-evidence-review-queue.mjs'
import { readRoleDispatchFallback } from './audit-role-dispatch-fallback.mjs'
import { auditStateRepair } from './audit-state-repair.mjs'
import { analyzeLearningPromotions } from './audit-learning-promotion.mjs'
import { auditLearningDrift } from './audit-learning-drift.mjs'
import { readHostCapabilities } from './audit-host-capabilities.mjs'
import { auditToolFallbackPolicy } from './audit-tool-fallback-policy.mjs'
import { findCanonicalGoalSource } from './canonical-goal-source.mjs'
import { analyzeCanonicalGoalSourceHygiene } from './document-hygiene.mjs'
import { internalTaskRouting } from './context-health.mjs'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const targetArg = readArg('--target')
const contextSessionPath = readArg('--session')
const contextSessionId = readArg('--session-id')
const jsonOnly = args.includes('--json')
const selfTest = args.includes('--self-test') || !targetArg
const outputProfile = args.includes('--brief')
  ? 'brief'
  : args.includes('--doctor') || args.includes('--full')
    ? 'doctor'
    : readArg('--profile', readArg('--output-profile', 'default'))

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

function readMaintenanceSnapshot(target) {
  const snapshotPath = path.join(target, '.gse', 'maintenance', 'latest-maintenance-snapshot.json')
  const snapshot = readJson(snapshotPath)
  if (!snapshot.ok) {
    return {
      exists: snapshot.exists,
      status: snapshot.exists ? 'invalid' : 'missing',
      generatedAt: null,
      summary: null,
      installedSync: null,
      releaseBundleFreshness: null,
      installedSyncMode: 'unknown',
      path: snapshotPath,
      error: snapshot.error,
    }
  }
  const data = snapshot.data
  return {
    exists: true,
    status: data?.summary?.status ?? 'unknown',
    generatedAt: data?.generatedAt ?? null,
    summary: data?.summary ?? null,
    installedSync: data?.workflows?.installedSync ?? 'unknown',
    releaseBundleFreshness: data?.workflows?.releaseBundleFreshness ?? 'unknown',
    installedSyncMode: data?.summary?.installedSyncMode ?? 'unknown',
    path: snapshotPath,
    error: '',
  }
}

function readSessionSyncBoundary(target) {
  const recordPath = path.join(target, '.gse', 'session-sync.jsonl')
  const parsed = readJsonl(recordPath)
  if (!parsed.exists) {
    return {
      exists: false,
      valid: true,
      totalRecords: 0,
      statusCounts: {},
      installedSyncRecorded: false,
      latestInstalledSync: null,
      latestThreadOutcomes: [],
      adoptionProven: false,
      boundary: 'no-session-sync-records',
      latestRecords: [],
      error: '',
      limits: [
        'Missing session sync records mean no active-session notification evidence is being claimed.',
        'Installed-copy sync and cross-session adoption are separate claims.',
      ],
    }
  }
  if (!parsed.ok) {
    return {
      exists: true,
      valid: false,
      totalRecords: parsed.records.length,
      statusCounts: {},
      installedSyncRecorded: false,
      latestInstalledSync: null,
      latestThreadOutcomes: [],
      adoptionProven: false,
      boundary: 'invalid-session-sync-records',
      latestRecords: [],
      error: parsed.error,
      limits: [
        'Invalid session sync JSONL cannot support installed-copy or active-session sync claims.',
        'Repair .gse/session-sync.jsonl before relying on sync evidence.',
      ],
    }
  }

  const statusCounts = {}
  for (const record of parsed.records) {
    const status = record.status || 'unknown'
    statusCounts[status] = (statusCounts[status] || 0) + 1
  }
  const installedRecords = parsed.records.filter((record) => record.status === 'installed-sync')
  const threadMap = new Map()
  for (const record of parsed.records) {
    if (record.threadId) threadMap.set(record.threadId, record)
  }
  const latestThreadOutcomes = [...threadMap.entries()].map(([threadId, record]) => ({
    threadId,
    status: record.status,
    method: record.method,
    project: record.project ?? null,
    recordedAt: record.recordedAt ?? null,
  }))
  const adoptionProven = parsed.records.some((record) => record.adoptionProven === true || record.adoptionStatus === 'verified')

  return {
    exists: true,
    valid: true,
    totalRecords: parsed.records.length,
    statusCounts,
    installedSyncRecorded: installedRecords.length > 0,
    latestInstalledSync: installedRecords.at(-1) ?? null,
    latestThreadOutcomes,
    adoptionProven,
    boundary: adoptionProven ? 'adoption-recorded' : 'sync-records-do-not-prove-adoption',
    latestRecords: parsed.records.slice(-5),
    error: '',
    limits: [
      'Session sync records prove notification attempts or installed-copy parity, not target-session adoption by default.',
      'A target session is adopted only when a future record explicitly carries adoptionProven=true or adoptionStatus=verified with matching evidence.',
      'Unavailable, skipped, failed, archived, and sent outcomes must stay honest transport outcomes rather than adoption claims.',
    ],
  }
}

function exists(target, relativePath) {
  return fs.existsSync(path.join(target, relativePath))
}

function detectProjectStage(target, intent) {
  const script = path.join(root, 'scripts', 'detect-project-stage.mjs')
  if (!fs.existsSync(script)) return { status: 'unavailable', error: 'detect-project-stage.mjs missing' }
  const result = spawnSync(process.execPath, [script, '--root', root, '--target', target, '--intent', intent, '--json'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  try {
    return JSON.parse((result.stdout ?? '').trim())
  } catch {
    return { status: 'unavailable', error: (result.stderr ?? '').trim() || 'stage detector returned invalid JSON' }
  }
}

function firstMatch(text, regex) {
  const match = text.match(regex)
  return match ? match[1].trim() : ''
}

function cleanInlineValue(value) {
  return String(value || '').trim().replace(/[.閵?閿涙瓥]+$/, '').trim()
}

function findCanonicalPlan(target, state) {
  return findCanonicalGoalSource(target, state)
}

function runNode(script, commandArgs, cwd = root) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...commandArgs], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  })
  const stdout = (result.stdout ?? '').trim()
  let data = null
  try {
    data = JSON.parse(stdout)
  } catch {
    data = null
  }
  return {
    command: [process.execPath, path.join(root, 'scripts', script), ...commandArgs].join(' '),
    status: result.status ?? 1,
    ok: (result.status ?? 1) === 0,
    data,
    stdout,
    stderr: (result.stderr ?? '').trim(),
  }
}

function listGitChanges(target) {
  const result = spawnSync('git', ['-C', target, 'status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: target,
    encoding: 'utf8',
    windowsHide: true,
  })
  if ((result.status ?? 1) !== 0) {
    return {
      status: 'unavailable',
      paths: [],
      error: (result.stderr ?? '').trim() || 'git status failed',
    }
  }
  const entries = (result.stdout ?? '')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const x = line[0] ?? ' '
      const y = line[1] ?? ' '
      const rawPath = line.slice(3).replace(/\\/g, '/')
      const normalizedPath = rawPath.includes(' -> ') ? rawPath.split(' -> ').pop() : rawPath
      return {
        code: x + y,
        path: normalizedPath,
        staged: x !== ' ' && x !== '?',
        unstaged: y !== ' ' && y !== '?',
        untracked: x === '?' && y === '?',
      }
    })
  return { status: 'available', entries, paths: entries.map((entry) => entry.path), error: '' }
}

function hasPackageScript(target, scriptName) {
  const packageJson = readJson(path.join(target, 'package.json'))
  return Boolean(packageJson.ok && packageJson.data?.scripts?.[scriptName])
}

const generatedArtifactPatterns = [
  /^node_modules\//,
  /^output\//,
  /^playwright-report\//,
  /^test-results\//,
  /^coverage\//,
  /^\.nyc_output\//,
  /^\.turbo\//,
  /^\.next\//,
  /^dist\//,
  /^build\//,
]

const transientLockfiles = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
])

function isGeneratedOrTransientChange(entry) {
  const normalized = entry.path.replace(/\\/g, '/')
  if (generatedArtifactPatterns.some((pattern) => pattern.test(normalized))) return true
  return entry.untracked && transientLockfiles.has(normalized)
}

const deliveryPackDefinitions = {
  frontend: {
    id: 'frontend-ui-browser',
    label: 'Frontend/UI/browser pack',
    reference: 'references/frontend-delivery-pack.md',
    minimumVerification: [
      'Run component/unit evidence for isolated UI logic.',
      'Run browser or screenshot evidence before claiming layout, routing, interaction, streaming, responsive, or browser behavior.',
      'Add accessibility evidence when forms, keyboard flow, semantics, contrast, or navigation changed.',
    ],
    acceptanceHint: 'Given the user is on the changed screen or route, when they trigger the changed state, then the expected visible result or actionable failure state is observable.',
    reviewAxes: ['spec compliance', 'code quality', 'UI/browser evidence', 'accessibility when relevant'],
    evidenceBoundary: 'Use verified-component for component-only proof and verified-browser only for real browser/screenshot/DOM runtime proof.',
  },
  backend: {
    id: 'backend-api-data',
    label: 'Backend/API/data pack',
    reference: 'references/backend-data-delivery-pack.md',
    minimumVerification: [
      'Run focused handler/service tests for internal logic.',
      'Run API smoke or contract evidence before claiming API behavior.',
      'Add migration/rollback or fixture data evidence for schema and data changes.',
    ],
    acceptanceHint: 'Given the required data/auth/session precondition, when the API/data/worker path runs, then the expected contract, state change, result, or error behavior is observed.',
    reviewAxes: ['spec compliance', 'code quality', 'API/state', 'data/migration when relevant', 'regression/missing-test'],
    evidenceBoundary: 'Use verified-api only for direct API/contract/runtime proof; service/unit evidence remains verified-component.',
  },
  worker: {
    id: 'worker-queue-runtime',
    label: 'Worker/queue runtime pack',
    reference: 'references/backend-data-delivery-pack.md',
    minimumVerification: [
      'Run a focused worker/job/queue fixture or replay for the changed event.',
      'Check retry, cancellation, timeout, idempotency, or duplicate prevention when relevant.',
    ],
    acceptanceHint: 'Given a queued event or scheduled job input, when the worker processes it, then the final state, emitted artifact, retry, or failure behavior is observable.',
    reviewAxes: ['spec compliance', 'resilience/recovery', 'API/state', 'performance/cost when relevant'],
    evidenceBoundary: 'Worker fixture evidence proves only the event path exercised; production queue behavior is external until run.',
  },
  data: {
    id: 'data-migration',
    label: 'Data/migration pack',
    reference: 'references/backend-data-delivery-pack.md',
    minimumVerification: [
      'Inspect schema compatibility and migration direction.',
      'Run migration or fixture data smoke when available.',
      'Record rollback/downgrade notes for irreversible or production-sensitive changes.',
    ],
    acceptanceHint: 'Given representative existing data, when the schema/import/export/migration runs, then compatibility, transformed state, and rollback expectation are clear.',
    reviewAxes: ['spec compliance', 'data/migration', 'recovery/rollback', 'evidence'],
    evidenceBoundary: 'Local fixture migration proof does not prove production migration acceptance.',
  },
  cicd: {
    id: 'ci-cd-deploy',
    label: 'CI/CD/deploy gate pack',
    reference: 'references/ci-cd-deployment-gates.md',
    minimumVerification: [
      'Run local build/package/config checks for local claims.',
      'Use real CI evidence before claiming verified-ci.',
      'Use deployment or release records before claiming deployment, registry, or public release acceptance.',
    ],
    acceptanceHint: 'Given the build/release/deploy precondition, when the pipeline step runs, then the artifact, status, URL, or rollback signal proves the specific claim.',
    reviewAxes: ['spec compliance', 'release/operations', 'rollback/evidence'],
    evidenceBoundary: 'Local build does not prove CI, deployment, marketplace, public release, or host-native support.',
  },
  docs: {
    id: 'docs-state',
    label: 'Docs/state pack',
    reference: 'references/project-onboarding-doctor-v2.md',
    minimumVerification: [
      'Inspect source-of-truth boundaries and links.',
      'Run encoding/markdown/structural checks when docs, JSON, JSONL, or YAML changed.',
    ],
    acceptanceHint: 'Given the canonical source and GSE execution projection, when the docs/state are read, then product intent and execution evidence stay separated.',
    reviewAxes: ['spec compliance', 'evidence'],
    evidenceBoundary: 'Docs/state checks do not prove product runtime behavior.',
  },
  library: {
    id: 'library-cli',
    label: 'Library/CLI pack',
    reference: 'references/project-onboarding-doctor-v2.md',
    minimumVerification: [
      'Run focused CLI/library unit or smoke evidence for the changed command/API.',
      'Run package/build checks when exports, bin wiring, or package metadata changed.',
    ],
    acceptanceHint: 'Given a developer calls the changed library API or CLI command, when it runs with representative input, then output, exit code, and error behavior match the contract.',
    reviewAxes: ['spec compliance', 'code quality', 'regression/missing-test', 'release/operations when package metadata changed'],
    evidenceBoundary: 'Local CLI/library smoke does not prove registry publication or downstream adoption.',
  },
}

function scoreDeliverySurfaces(paths, projectText = '') {
  const scores = {
    frontend: 0,
    backend: 0,
    worker: 0,
    data: 0,
    cicd: 0,
    docs: 0,
    library: 0,
  }
  const add = (key, amount = 1) => {
    scores[key] = (scores[key] || 0) + amount
  }

  for (const rawPath of paths) {
    const item = String(rawPath || '').replace(/\\/g, '/').toLowerCase()
    if (!item) continue
    if (/^(src\/app|app|pages|components|ui|styles|public|client|web)\//.test(item) || /\.(css|scss|sass|tsx|jsx|vue|svelte)$/.test(item)) add('frontend', 3)
    if (/(api|server|route|routes|controller|service|middleware|graphql|trpc|rpc)\//.test(item) || /(^|\/)(api|server)\./.test(item)) add('backend', 3)
    if (/(worker|workers|queue|queues|job|jobs|cron|scheduler)\//.test(item) || /(worker|queue|job|cron)/.test(item)) add('worker', 3)
    if (/(db|database|schema|schemas|migration|migrations|prisma|drizzle|supabase)\//.test(item) || /(schema|migration|seed|sql)/.test(item)) add('data', 3)
    if (/^(\.github\/workflows|dockerfile|docker-compose|deploy|deployment|vercel|netlify|render|cloudflare|k8s|helm)\b/.test(item) || /(release|publish|package-gse|install-gse|ci|workflow)/.test(item)) add('cicd', 3)
    if (/^(docs|references|\.gse|assets\/templates)\//.test(item) || /\.(md|mdx|json|jsonl|ya?ml)$/.test(item)) add('docs', 1)
    if (/^(bin|cli|lib|packages|src\/cli|scripts)\//.test(item) || item === 'package.json') add('library', 2)
  }

  const text = String(projectText || '').toLowerCase()
  if (/(react|next\.js|vue|svelte|vite|tailwind|browser|playwright|cypress|storybook|frontend|ui)/.test(text)) add('frontend')
  if (/(api|backend|server|rest|graphql|trpc|webhook|express|fastify|nestjs)/.test(text)) add('backend')
  if (/(worker|queue|job|cron|scheduler|redis|bullmq)/.test(text)) add('worker')
  if (/(database|postgres|supabase|prisma|drizzle|migration|schema)/.test(text)) add('data')
  if (/(ci|deploy|release|docker|vercel|netlify|render|cloudflare|github actions)/.test(text)) add('cicd')
  if (/(library|sdk|cli|package|developer tool)/.test(text)) add('library')

  return scores
}

function buildDeliveryPackRecommendation(target, state, profileText, goalMapText, gitChanges = null) {
  const gitStatus = gitChanges ?? listGitChanges(target)
  const entries = gitStatus.entries ?? []
  const paths = entries
    .filter((entry) => !isGeneratedOrTransientChange(entry))
    .map((entry) => entry.path)
  const projectText = [
    profileText,
    goalMapText,
    state?.currentSlice?.id,
    state?.currentSlice?.outcome,
    state?.currentSlice?.nextAction,
    state?.currentSummary?.currentPlan,
  ].filter(Boolean).join('\n')
  const scores = scoreDeliverySurfaces(paths, projectText)
  const selectedKeys = Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key)

  const uniqueKeys = selectedKeys.length ? selectedKeys : ['docs']
  const primaryKey = uniqueKeys[0]
  const primary = deliveryPackDefinitions[primaryKey] ?? deliveryPackDefinitions.docs
  const packs = uniqueKeys.map((key) => deliveryPackDefinitions[key]).filter(Boolean)
  const changedSurface = uniqueKeys.length > 1 ? 'mixed' : primaryKey

  return {
    status: 'available',
    changedSurface,
    primaryPack: primary.id,
    primaryLabel: primary.label,
    packs: packs.map((pack) => ({
      id: pack.id,
      label: pack.label,
      reference: pack.reference,
    })),
    changedPaths: paths.slice(0, 20),
    scores,
    minimumVerification: [...new Set(packs.flatMap((pack) => pack.minimumVerification))].slice(0, 8),
    reviewAxes: [...new Set(packs.flatMap((pack) => pack.reviewAxes))],
    acceptanceScenarios: packs.slice(0, 3).map((pack) => ({
      pack: pack.id,
      scenario: pack.acceptanceHint,
    })),
    evidenceBoundaries: packs.map((pack) => ({
      pack: pack.id,
      boundary: pack.evidenceBoundary,
    })),
    references: [
      ...new Set([
        ...packs.map((pack) => pack.reference),
        'references/review-router.md',
        'references/acceptance-scenarios.md',
      ]),
    ],
    limits: [
      'Delivery pack recommendation selects gates; it does not prove the implementation.',
      'Do not run or claim browser, CI, deploy, release, MCP, LSP, or subagent evidence unless that tool actually ran or has accepted external evidence.',
      'Project rules, project profile, and canonical product docs override generic GSE routing.',
    ],
  }
}

function buildCompletionPlan(target, state, maintenanceSnapshot) {
  const gitChanges = listGitChanges(target)
  const changedEntries = gitChanges.entries ?? gitChanges.paths.map((item) => ({ path: item, untracked: false, staged: false, unstaged: true }))
  const ignoredGeneratedPaths = changedEntries.filter(isGeneratedOrTransientChange).map((entry) => entry.path)
  const actionableEntries = changedEntries.filter((entry) => !isGeneratedOrTransientChange(entry))
  const changedPaths = actionableEntries.map((entry) => entry.path)
  const hasGseScripts = fs.existsSync(path.join(target, 'scripts', 'run-gse-command.mjs'))
  const hasEncodingCheck = hasPackageScript(target, 'check:encoding')
  const validationProfile = state?.mode === 'enterprise' ? 'lite' : 'lite'
  const docsOrLearningChanged = changedPaths.some((item) =>
    item === 'SKILL.md' ||
    item === 'README.md' ||
    item === 'README.zh-CN.md' ||
    item === 'CHANGELOG.md' ||
    item.startsWith('docs/') ||
    item.startsWith('references/') ||
    item.startsWith('.gse/') ||
    /\.(md|mdx|json|jsonl|ya?ml)$/i.test(item),
  )
  const capabilityChanged = changedPaths.some((item) =>
    item === 'SKILL.md' ||
    item === 'package.json' ||
    item.startsWith('scripts/') ||
    item.startsWith('references/') ||
    item.startsWith('assets/') ||
    item.startsWith('agents/') ||
    item.startsWith('.github/') ||
    item === 'README.md' ||
    item === 'README.zh-CN.md',
  )
  const releaseSensitiveChanged = changedPaths.some((item) =>
    item.startsWith('.gse/acceptance/') ||
    item.startsWith('.gse/release-bundles/') ||
    item === 'references/' ||
    item.startsWith('references/') ||
    item.startsWith('assets/marketplace/') ||
    item.startsWith('scripts/generate-release') ||
    item.startsWith('scripts/audit-release') ||
    item.startsWith('scripts/package-gse') ||
    item.startsWith('scripts/install-gse') ||
    item.includes('public-release') ||
    item.includes('final-readiness') ||
    item.includes('packaging'),
  )
  const installedSyncStale =
    capabilityChanged &&
    hasGseScripts &&
    maintenanceSnapshot.installedSyncMode !== 'verified'

  const requiredCloseCommands = [
    `node scripts/run-validation-profile.mjs --target . --profile ${validationProfile} --json`,
    'node scripts/run-gse-command.mjs --root . --target . --command "/gse close" --json',
  ]
  const encodingCloseCommand = process.platform === 'win32'
    ? 'cmd /c npm run check:encoding'
    : 'npm run check:encoding'
  const conditionalCloseCommands = [
    {
      id: 'encoding',
      active: docsOrLearningChanged && hasEncodingCheck,
      when: 'docs, markdown, JSON/JSONL, YAML, evidence, or learning files changed and package.json exposes check:encoding',
      command: encodingCloseCommand,
    },
    {
      id: 'installed-sync',
      active: capabilityChanged && hasGseScripts,
      when: 'GSE capability files changed and an installed skill copy must stay fresh',
      command: 'node scripts/audit-installed-sync.mjs --root . --installed-root C:\\Users\\Admin\\.codex\\skills\\gse --json',
    },
    {
      id: 'maintenance-snapshot',
      active: (capabilityChanged || releaseSensitiveChanged) && hasGseScripts,
      when: 'capability, release, package, or maintenance-sensitive files changed',
      command: releaseSensitiveChanged
        ? 'node scripts/generate-maintenance-snapshot.mjs --root . --target . --installed-root C:\\Users\\Admin\\.codex\\skills\\gse --execute --json'
        : 'node scripts/generate-maintenance-snapshot.mjs --root . --target . --installed-root C:\\Users\\Admin\\.codex\\skills\\gse --skip-release-bundle --execute --json',
    },
    {
      id: 'release-bundle',
      active: releaseSensitiveChanged && hasGseScripts,
      when: 'release, packaging, public acceptance, marketplace, or final-readiness files changed',
      command: 'node scripts/generate-release-bundle.mjs --root . --label gse-release-bundle-v1.0.0 --out .gse\\release-bundles\\gse-release-bundle-v1.0.0 --force --json',
    },
    {
      id: 'session-sync',
      active: capabilityChanged && hasGseScripts && fs.existsSync(path.join(target, '.gse', 'session-sync.jsonl')),
      when: 'installed GSE capability changed and active GSE-using session sync records are maintained',
      command: 'node scripts/audit-session-sync.mjs --root . --json',
    },
  ]

  return {
    status: gitChanges.status,
    profile: validationProfile,
    changedPathCount: changedPaths.length,
    changedPaths: changedPaths.slice(0, 20),
    ignoredGeneratedPathCount: ignoredGeneratedPaths.length,
    ignoredGeneratedPaths: ignoredGeneratedPaths.slice(0, 20),
    requiredSteps: [
      'Record outcome, scope, acceptance, evidence, risk, and next action for the current slice.',
      'Append evidence to .gse/evidence/YYYY-MM-DD.md and .gse/evidence/index.jsonl.',
      'Update .gse/state.json, .gse/current-slice.md, and .gse/goal-map.md before close.',
      'Commit only the current slice files after focused checks pass.',
    ],
    requiredCloseCommands,
    conditionalCloseCommands,
    activeCloseCommands: conditionalCloseCommands.filter((item) => item.active).map((item) => item.command),
    staleSignals: {
      installedSyncStale,
      maintenanceSnapshotStatus: maintenanceSnapshot.status,
      maintenanceSnapshotMode: maintenanceSnapshot.installedSyncMode,
    },
    limits: [
      'These commands are a close checklist, not proof that the slice is complete until their outputs are recorded as evidence.',
      'Host-native slash-command evidence stays optional per host adapter and is not part of the default close checklist.',
    ],
  }
}

function buildGateTaxonomy(blockedGates) {
  return {
    core: {
      scope: 'default project continuation and slice close',
      blocking: true,
      examples: [
        'invalid .gse/state.json',
        'invalid .gse/evidence/index.jsonl',
        'missing project profile, canonical product goal source, goal map, or quality gates',
        'missing current-slice evidence for the claim being closed',
      ],
      source: 'continue preflight, quality gates, close gate, project guards',
    },
    release: {
      scope: 'public release, package, registry, CI, repository, security, or marketplace claims',
      blocking: blockedGates.some((gate) => gate.gateType === 'owner-external'),
      pendingCount: blockedGates.filter((gate) => gate.gateType === 'owner-external').length,
      examples: [
        'public CI run',
        'public repository settings',
        'public security contact',
        'registry or package publication',
        'marketplace or catalog publication',
      ],
      source: 'final readiness matrix and accepted owner/external records',
    },
    hostAdapter: {
      scope: 'native slash-command, host UI, MCP, LSP, browser, subagent, or other runtime adapter claims',
      blocking: blockedGates.some((gate) => gate.blockingScope === 'public-or-host-claim'),
      examples: [
        'native /gse command in a specific host',
        'host UI command-palette invocation',
        'verified browser or Playwright runtime',
        'verified subagent dispatch',
      ],
      source: 'host capability records and host runtime invocation records',
    },
    rule: 'Core gates block default continuation; release and host-adapter gates block only the specific public, release, or host claim unless the project owner explicitly promotes them to project policy.',
  }
}

function buildShortPrompt({ projectName, resolvedTarget, preflightStatus, compactState, blockedGates, failedHardChecks }) {
  const nextMode = compactState.nextSliceMode?.action === 'open-next-slice'
    ? 'open-next-slice'
    : 'continue-current-slice'
  const lines = [
    `GSE continue: ${projectName} | ${compactState.phase} | preflight=${preflightStatus}`,
    `Root: ${resolvedTarget} | canonical=${compactState.canonicalGoalSource || 'not discovered'} | goal-map=${compactState.goalMapRole}`,
    `Slice: ${compactState.currentSlice.outcome} (${compactState.currentSlice.status})`,
    `Next: ${compactState.currentSlice.nextAction}`,
    `Mode: ${nextMode} | close=${compactState.completionPlan.requiredCloseCommands.length} required/${compactState.completionPlan.activeCloseCommands.length} active | risks=${compactState.activeRiskCount} active/${compactState.archivedRiskCount} archived | gates core=${compactState.gateTaxonomy.core.blocking ? 'blocking' : 'open'}, release=${compactState.gateTaxonomy.release.pendingCount}, host=${compactState.gateTaxonomy.hostAdapter.blocking ? 'claim-gated' : 'optional'}`,
  ]
  if (blockedGates.length) lines.push(`Claim evidence: ${blockedGates.map((gate) => gate.area).join(', ')}`)
  if (failedHardChecks.length) lines.push(`Fix first: ${failedHardChecks.map((item) => item.label).join('; ')}`)
  if (compactState.productOutcomeGate?.status === 'warning') lines.push(`Product outcome: ${compactState.productOutcomeGate.recommendation}`)
  if (compactState.productProgressDrift?.status === 'warning') lines.push(`Product drift: ${compactState.productProgressDrift.recommendation}`)
  const noGoalAction = compactState.noGoalMode?.recommendedAction || 'follow-completion-plan'
  const pack = compactState.deliveryPackRecommendation?.primaryPack || 'none'
  const stage = compactState.projectStage?.current_stage || 'unknown'
  lines.push(`Do: one verifiable slice; stage=${stage}; pack=${pack}; no-goal=${noGoalAction} -> evidence -> checks -> commit.`)
  return lines.join('\n')
}

function buildNextSliceMode(state) {
  const status = String(state?.currentSlice?.status ?? '').trim().toLowerCase()
  const verifiedStatuses = new Set(['verified', 'accepted', 'archived', 'closed', 'complete', 'completed'])
  const currentSliceVerified = verifiedStatuses.has(status)
  return {
    action: currentSliceVerified ? 'open-next-slice' : 'continue-current-slice',
    currentSliceVerified,
    reason: currentSliceVerified
      ? 'Current slice is already verified; use nextAction and roadmap priority to open a new verifiable slice before implementation.'
      : 'Current slice is not verified; continue or close the active slice before opening another one.',
  }
}

function planUnitTaskRouting() {
  return {
    workClass: 'plan-unit',
    scope: 'top-level',
    visibility: 'user-visible',
    persistence: 'global-task-eligible',
    globalTaskEligible: true,
    actionKind: null,
  }
}

const INTERNAL_ACTION_KINDS = Object.freeze([
  'read',
  'search',
  'probe',
  'test',
  'spec-review',
  'quality-review',
  'retry',
  'fix-attempt',
  'context-rollover',
  'continue-current-slice',
  'preflight-repair',
  'claim-evidence',
])

const EXECUTION_POLICY = Object.freeze({
  globalTaskRule: 'top-level-plan-units-only',
  operationalPersistence: 'internal-only',
  internalActionKinds: INTERNAL_ACTION_KINDS,
  reviewCycle: Object.freeze({
    normalSpecReviewPasses: 1,
    normalQualityReviewPasses: 1,
    rereviewTrigger: 'confirmed-finding-and-repair',
    reviewPersistence: 'internal-only',
    globalTaskEligible: false,
  }),
})

function shortText(value, maxLength = 180) {
  const normalized = String(value || '').replace(/`/g, '').replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return normalized.slice(0, maxLength - 1).trimEnd() + '…'
}

function fullCandidateReason(value) {
  return String(value || '').replace(/`/g, '').replace(/\s+/g, ' ').trim()
}

function extractBulletsFromSection(text, heading) {
  const lines = String(text || '').split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim().toLowerCase() === heading.toLowerCase())
  if (start === -1) return []
  const bullets = []
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s+/.test(line)) break
    const match = line.match(/^\s*-\s+(.+)/)
    if (match) bullets.push(match[1].trim())
  }
  return bullets
}

function isHostNativeOnlyCandidate(text) {
  const value = String(text || '').toLowerCase()
  return (
    value.includes('native slash-command') ||
    value.includes('host-native') ||
    value.includes('host native') ||
    value.includes('host ui') ||
    value.includes('browser') ||
    value.includes('mcp') ||
    value.includes('lsp') ||
    value.includes('subagent') ||
    value.includes('record native slash') ||
    value.includes('when a host exposes')
  )
}

const internalProgressTerms = [
  'provenance',
  'boundary',
  'handoff',
  'lineage',
  'normalizer',
  'normalize',
  'source key',
  'state repair',
  'component',
  'store',
  'evidence',
]

const visibleProgressTerms = [
  'browser',
  'user interface',
  'interface',
  'user-visible',
  'user visible',
  'visible',
  'canvas',
  'workflow',
  'execute',
  'execution',
  'provider',
  'api',
  'export',
  'import',
  'package',
  'result',
  'screenshot',
]

const productProjectTerms = [
  'productization',
  'user',
  'customer',
  'workflow',
  'interface',
  'canvas',
  'provider',
  'export',
  'browser',
]

const skillProjectTerms = [
  'skill',
  'agentic engineering skill',
  'operating model',
  'open-source skill',
  'portable command',
  'host adapter',
]

function hasAnyTerm(text, terms) {
  const value = String(text || '').toLowerCase()
  return terms.some((term) => value.includes(term))
}

function isInternalEvidenceRecord(record) {
  const evidenceLevel = String(record?.evidenceLevel || '').toLowerCase()
  const requiredEvidenceLevel = String(record?.requiredEvidenceLevel || '').toLowerCase()
  const text = [
    record?.summary,
    record?.nextAction,
    Array.isArray(record?.commands) ? record.commands.join(' ') : '',
  ].join(' ')
  const lowLevel = evidenceLevel === 'verified-unit' || evidenceLevel === 'verified-component'
  const notVisibleProof = requiredEvidenceLevel !== 'verified-browser' && !hasAnyTerm(text, ['browser smoke', 'screenshot', 'playwright'])
  return lowLevel && notVisibleProof && hasAnyTerm(text, internalProgressTerms)
}

function analyzeProductProgressDrift(records, state) {
  const recent = Array.isArray(records) ? records.slice(-6) : []
  const internalRecent = recent.filter(isInternalEvidenceRecord)
  const currentText = [
    state?.currentSlice?.outcome,
    state?.currentSlice?.nextAction,
    state?.currentSummary?.currentPlan,
  ].join(' ')
  const currentInternal = hasAnyTerm(currentText, internalProgressTerms)
  const currentVisible = hasAnyTerm(currentText, visibleProgressTerms)
  const triggered = recent.length >= 3 && internalRecent.length >= 3 && currentInternal && !currentVisible
  return {
    status: triggered ? 'warning' : 'clear',
    recentRecords: recent.length,
    internalRecords: internalRecent.length,
    trigger: triggered ? 'repeated-internal-component-slices' : 'not-detected',
    recommendation: triggered
      ? 'Open a product-visible recovery slice before another internal evidence/provenance slice.'
      : 'Keep checking product-visible progress against the project north star.',
    limits: [
      'This is a soft steering guard, not a hard failure.',
      'It detects repeated internal/component-level evidence patterns; project owners can still choose a risk-reduction slice deliberately.',
    ],
  }
}

function classifyProjectType(target, state, canonicalPlan, profileText, goalMapText) {
  const packageJson = readJson(path.join(target, 'package.json'))
  const packageName = String(packageJson.data?.name || '').toLowerCase()
  const projectName = String(state?.projectName || '').toLowerCase()
  const canonicalPlanText = canonicalPlan ? readText(path.join(target, canonicalPlan)) : ''
  const text = [
    projectName,
    packageName,
    canonicalPlan,
    canonicalPlanText.slice(0, 4000),
    profileText,
    goalMapText,
  ].join(' ').toLowerCase()

  if (
    projectName === 'gse' ||
    packageName.includes('/gse') ||
    packageName === 'gse' ||
    String(canonicalPlan || '').includes('.gse/gse-design-master-plan.md')
  ) {
    return 'skill'
  }

  const strongProductSignals = [
    'productization',
    'user-facing',
    'user visible',
    'user-visible',
    'customer',
    'workflow',
    'canvas',
    'browser',
    'provider',
    'export',
    'generation result',
    'desktop app',
    'web app',
    'mini app',
  ]
  const strongLibrarySignals = ['library', 'sdk', 'cli tool', 'command line tool', 'developer library']
  const canonicalPathProduct = /(?:productization|product|roadmap|vision|prd|architecture|goal)/i.test(String(canonicalPlan || ''))
  const productScore = productProjectTerms.filter((term) => text.includes(term)).length + strongProductSignals.filter((term) => text.includes(term)).length + (canonicalPathProduct ? 2 : 0)
  const libraryScore = strongLibrarySignals.filter((term) => text.includes(term)).length + (/\b(?:sdk|cli|library)\b/i.test(packageJson.data?.description || '') ? 1 : 0)

  if (hasAnyTerm(text, skillProjectTerms) && productScore < 3) return 'skill'
  if (productScore >= 3) return 'product'
  if (libraryScore > 0 || hasAnyTerm(text, ['library', 'package', 'sdk', 'cli'])) return 'library'
  return 'unknown'
}

function classifySliceType(text) {
  const value = String(text || '')
  const visible = hasAnyTerm(value, visibleProgressTerms)
  const support = hasAnyTerm(value, internalProgressTerms) || hasAnyTerm(value, [
    'guard',
    'audit',
    'index',
    'repair',
    'validator',
    'validation',
    'preflight',
    'sync',
    'maintenance',
  ])
  if (visible) return 'product-visible'
  if (support) return 'support'
  return 'unknown'
}

function analyzeProductOutcomeGate(target, records, state, canonicalPlan, profileText, goalMapText) {
  const projectType = classifyProjectType(target, state, canonicalPlan, profileText, goalMapText)
  const recent = Array.isArray(records) ? records.slice(-6) : []
  const currentText = [
    state?.currentSlice?.id,
    state?.currentSlice?.outcome,
    state?.currentSlice?.nextAction,
    state?.currentSummary?.currentPlan,
    goalMapText,
  ].join(' ')
  const sliceType = classifySliceType(currentText)
  const currentUserVisibleDelta = cleanInlineValue(
    state?.currentSlice?.userVisibleDelta ||
    state?.currentSummary?.userVisibleDelta ||
    '',
  )
  const supportSliceBoundary = cleanInlineValue(state?.currentSlice?.supportSliceBoundary || '')
  const recentSupportRecords = recent.filter((record) => {
    const text = [
      record?.summary,
      record?.nextAction,
      record?.userVisibleDelta,
      Array.isArray(record?.commands) ? record.commands.join(' ') : '',
    ].join(' ')
    return classifySliceType(text) === 'support'
  })
  const recentVisibleRecords = recent.filter((record) => {
    const text = [
      record?.summary,
      record?.nextAction,
      record?.userVisibleDelta,
      Array.isArray(record?.commands) ? record.commands.join(' ') : '',
    ].join(' ')
    return classifySliceType(text) === 'product-visible'
  })
  const latestVisibleDelta = currentUserVisibleDelta || cleanInlineValue([...recent].reverse().find((record) => record?.userVisibleDelta)?.userVisibleDelta || '')
  const applicable = projectType === 'product'
  const supportSliceStreak = recentSupportRecords.length
  const warning = applicable && sliceType === 'support' && supportSliceStreak >= 3 && !latestVisibleDelta && !supportSliceBoundary
  return {
    status: !applicable ? 'not-applicable' : warning ? 'warning' : 'passed',
    projectType,
    sliceType,
    userVisibleDelta: latestVisibleDelta || null,
    supportSliceBoundary: supportSliceBoundary || null,
    supportSliceStreak,
    recentVisibleRecords: recentVisibleRecords.length,
    recommendation: warning
      ? 'For product work, open the next slice around a user-visible behavior, workflow, API/provider result, export, screenshot, or failure state.'
      : applicable && sliceType === 'support' && supportSliceBoundary
        ? `Keep this support slice within its declared boundary: ${supportSliceBoundary}`
      : applicable
        ? 'Keep naming the user-visible delta when product work is the mainline.'
        : 'Product outcome gate is not applied to this project type.',
    limits: [
      'This is a soft steering gate, not a hard blocker.',
      'Support slices remain valid when they are deliberate and bounded.',
      'supportSliceBoundary is optional metadata for the current support slice; it must name a narrow scope or exit criterion.',
      'API or workflow smoke can satisfy product-visible progress when browser evidence is not the right proof.',
    ],
  }
}

function isMetaNextSliceCandidate(text) {
  const value = String(text || '').toLowerCase()
  return (
    value.includes('open the next') ||
    value.includes('next verifiable slice') ||
    value.includes('next-slice selector') ||
    value.includes('next slice selector') ||
    value.includes('use /gse continue candidates') ||
    value.includes('roadmap priority') ||
    value.includes('harden candidate ranking')
  )
}

function uniqueCandidateReasons(items) {
  const seen = new Set()
  const output = []
  for (const item of items) {
    const fullReason = fullCandidateReason(item.fullReason || item.reason)
    if (!fullReason) continue
    const key = fullReason.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push({ ...item, fullReason })
  }
  return output
}

function buildCandidateActionPacket(candidate) {
  const kind = candidate.kind || 'roadmap-gap'
  const base = {
    candidateType: kind,
    outcomeHint: candidate.outcomeHint || 'Open a focused GSE slice that makes the selected gap measurably more true.',
    scopeHint: candidate.scopeHint || 'Touch only the scripts, references, templates, and state files needed for this slice.',
    acceptanceHint: candidate.acceptanceHint,
    evidenceHint: candidate.evidenceHint || 'Add or update a focused audit, run /gse continue, record evidence, and keep the claim boundary explicit.',
    riskHint: candidate.riskHint || 'Do not turn optional host, release, or project-specific evidence into a default core blocker.',
    nextActionHint: candidate.nextActionHint || 'Update current-slice, state, goal-map, evidence, installed copy, and session sync records when the capability changes.',
    focusedChecks: candidate.focusedChecks || [
      'node scripts\\audit-continue-preflight.mjs --root . --json',
      'node scripts\\run-validation-profile.mjs --target . --profile lite --json',
    ],
  }
  return base
}

function buildNextSliceCandidates(target, state, nextSliceMode, productProgressDrift = null, productOutcomeGate = null) {
  if (nextSliceMode.action !== 'open-next-slice') return []

  const roadmapText = readText(path.join(target, 'references', 'final-form-roadmap.md'))
  const goalMapText = readText(path.join(target, '.gse', 'goal-map.md'))
  const currentNextAction = fullCandidateReason(state?.currentSlice?.nextAction || 'Open the next verifiable slice from the current roadmap priority.')
  const activeRisks = Array.isArray(state?.residualRisks) ? state.residualRisks.map((risk) => fullCandidateReason(risk)) : []
  const roadmapBullets = [
    ...extractBulletsFromSection(roadmapText, '## Current Final-Form Gap List'),
    ...extractBulletsFromSection(roadmapText, '## Final Form Priorities'),
  ].filter((item) => item && !/^Done:/i.test(item) && !isHostNativeOnlyCandidate(item))
  const goalMapNext = firstMatch(goalMapText, /Next action:\s*([^\n]+)/i)
  const goalMapRole = /execution projection/i.test(goalMapText) ? 'execution projection only' : 'projection required'

  const candidates = []
  const firstReason = goalMapNext ? fullCandidateReason(goalMapNext) : currentNextAction

  if (productOutcomeGate?.status === 'warning') {
    candidates.push({
      kind: 'product-visible-recovery',
      title: 'Recover product outcome',
      source: 'compactState.productOutcomeGate',
      fullReason: productOutcomeGate.recommendation,
      outcomeHint: 'Make the next product slice answer what the user can now do, see, run, export, or diagnose.',
      scopeHint: 'Pick one visible UI, workflow, API/provider, export/import, or result path and keep internal evidence work as support only.',
      acceptanceHint: 'Acceptance must name the user-visible behavior, result, failure state, or workflow step that changed.',
      evidenceHint: 'Use the lightest proof that exercises the product path, such as API smoke, workflow smoke, browser smoke, screenshot, or exported result.',
      riskHint: 'Do not let support work such as provenance, state, evidence, handoff, or audits replace the product mainline repeatedly.',
      nextActionHint: 'Rewrite the current slice so its outcome is product-visible before changing implementation files.',
      focusedChecks: [
        'node scripts\\run-gse-command.mjs --target . --command "/gse continue" --json --compact',
        'Run one focused product-visible smoke or workflow/API test for the selected path.',
      ],
      suggestedProfile: 'lite',
    })
  }

  if (productProgressDrift?.status === 'warning') {
    candidates.push({
      kind: 'product-visible-recovery',
      title: 'Recover product-visible progress',
      source: 'compactState.productProgressDrift',
      fullReason: productProgressDrift.recommendation,
      outcomeHint: 'Make the next slice prove one user-visible workflow step or production capability instead of another internal state handoff.',
      scopeHint: 'Choose a narrow UI/API/browser/provider/export path from the project north star and keep GSE as a light guardrail.',
      acceptanceHint: 'Acceptance must name the user-visible behavior, result, failure state, or workflow step that changed.',
      evidenceHint: 'Use the lightest focused proof that exercises the visible path, such as browser smoke, API smoke, screenshot, or product workflow test.',
      riskHint: 'Do not let provenance, evidence index, state repair, or close-gate work become the product slice itself unless the owner explicitly asks for process work.',
      nextActionHint: 'Rewrite current-slice around product-visible outcome before editing code.',
      focusedChecks: [
        'node scripts\\run-gse-command.mjs --target . --command "/gse continue" --json --compact',
        'Run one focused product-visible smoke or workflow/API test for the selected path.',
      ],
      suggestedProfile: 'lite',
    })
  }

  const roadmapCandidate = roadmapBullets.find((item) =>
    item.toLowerCase().includes('short entry') ||
    item.toLowerCase().includes('continue') ||
    item.toLowerCase().includes('state') ||
    item.toLowerCase().includes('evidence') ||
    item.toLowerCase().includes('learning') ||
    item.toLowerCase().includes('maintenance')
  ) || roadmapBullets[0]

  if (roadmapCandidate) {
    candidates.push({
      kind: 'roadmap-gap',
      title: 'Reduce the next short-entry handoff gap',
      source: 'references/final-form-roadmap.md',
      fullReason: fullCandidateReason(roadmapCandidate),
      outcomeHint: 'Make the next /gse continue candidate directly openable as a slice without a long prompt rewrite.',
      scopeHint: 'Add machine-readable action fields to next-slice candidates and audit their presence.',
      acceptanceHint: 'Add executable support or a focused audit for the selected roadmap gap, then surface it through /gse continue or /gse close when relevant.',
      evidenceHint: 'Focused continue-preflight audit proves candidates include action fields and real /gse continue output exposes them.',
      riskHint: 'Candidate packets can still be hints, not autonomous roadmap decisions.',
      nextActionHint: 'Use the structured candidate packet to create the next current-slice entry.',
      suggestedProfile: 'lite',
    })
  }

  const riskCandidate = activeRisks.find((risk) => !isHostNativeOnlyCandidate(risk))
  if (riskCandidate) {
    candidates.push({
      kind: 'active-risk',
      title: 'Turn an active risk into an executable guard',
      source: '.gse/state.json residualRisks',
      fullReason: riskCandidate,
      outcomeHint: 'Reduce one active recurring risk by converting it into an auditable guard, repair action, or claim boundary.',
      scopeHint: 'Change one guard/audit/continue-close surface and compact the active risk only after evidence passes.',
      acceptanceHint: 'Move one recurring active risk into a guard, audit, repair action, or explicit claim boundary, then reduce the active-risk summary.',
      evidenceHint: 'Focused audit shows the risk is enforced or surfaced before close; state shows the active risk no longer needs top-risk space.',
      riskHint: 'Avoid deleting risk text unless the new guard actually prevents or surfaces the failure.',
      nextActionHint: 'Pick the highest-value active risk and open a guard-hardening slice.',
      suggestedProfile: 'lite',
    })
  }

  if (firstReason && (!isMetaNextSliceCandidate(firstReason) || candidates.length === 0)) {
    candidates.push({
      kind: 'goal-map-next',
      title: 'Open the next roadmap-backed slice',
      source: goalMapNext ? '.gse/goal-map.md Current Focus' : '.gse/state.json currentSlice.nextAction',
      fullReason: firstReason,
      outcomeHint: 'Turn the recorded next action into a concrete current slice before implementation.',
      scopeHint: 'Create or update only the slice planning fields needed to start work.',
      acceptanceHint: 'Create a new current-slice entry with outcome, scope, acceptance, evidence, risk, and next action before implementation.',
      evidenceHint: 'Continue packet shows the new slice as active and close checks know which evidence is required.',
      riskHint: 'Do not start coding from a vague next action without a verifiable slice contract.',
      nextActionHint: 'Write the current-slice contract, then implement the smallest evidence-backed change.',
      goalMapRoleHint: 'Treat .gse/goal-map.md as execution projection only; keep durable product intent in the canonical product goal source.',
      suggestedProfile: 'lite',
    })
  }

  return uniqueCandidateReasons(candidates)
    .slice(0, 3)
    .map((candidate, index) => ({
      id: `NEXT-${String(index + 1).padStart(3, '0')}`,
      title: candidate.title,
      source: candidate.source,
      reason: shortText(candidate.fullReason),
      fullReason: candidate.fullReason,
      acceptanceHint: candidate.acceptanceHint,
      actionPacket: buildCandidateActionPacket(candidate),
      suggestedProfile: candidate.suggestedProfile,
      taskRouting: planUnitTaskRouting(),
    }))
}

function buildNoGoalModePacket({ compactState, preflightStatus, failedHardChecks, blockedGates }) {
  const firstCandidate = compactState.nextSliceCandidates?.[0] || null
  const hasHardFailure = failedHardChecks.length > 0
  const hasClaimGate = blockedGates.length > 0
  const contextRollover = ['orange', 'red'].includes(compactState.contextHealth?.health)
  const shouldOpenNextSlice = compactState.nextSliceMode?.action === 'open-next-slice' && firstCandidate
  const recommendedAction = contextRollover
    ? 'context-rollover'
    : hasHardFailure
    ? 'repair-preflight'
    : hasClaimGate
      ? 'collect-claim-evidence'
      : shouldOpenNextSlice
        ? 'open-next-slice'
        : 'continue-current-slice'

  const closeCommands = [
    ...(compactState.completionPlan?.requiredCloseCommands || []),
    ...(compactState.completionPlan?.activeCloseCommands || []),
  ]

  const firstStepsByAction = {
    'context-rollover': [
      'Stop expanding the current plan unit and finish only the current atomic operation.',
      'Generate a bounded context checkpoint and continue the recorded next action in a fresh execution context within the same top-level plan unit.',
    ],
    'repair-preflight': [
      'Stop implementation and repair the hard preflight failures first.',
      ...failedHardChecks.slice(0, 3).map((item) => item.recommendation || `Fix ${item.label}.`),
    ],
    'collect-claim-evidence': [
      'Do not close the public or host-specific claim yet.',
      'Collect the missing accepted/external evidence for the blocked claim, or downgrade the claim boundary.',
    ],
    'open-next-slice': [
      'Create or update .gse/current-slice.md from selectedCandidate.actionPacket before editing implementation files.',
      'Update .gse/state.json currentSlice to the new slice id, outcome, status, and nextAction.',
      'Implement only the smallest verifiable change for that slice.',
    ],
    'continue-current-slice': [
      'Continue the current slice instead of opening a new one.',
      'Use compactState.completionPlan.requiredSteps as the close checklist.',
      'Record evidence before changing the current slice status to verified.',
    ],
  }

  const routingActionKind = {
    'context-rollover': 'context-rollover',
    'repair-preflight': 'preflight-repair',
    'collect-claim-evidence': 'claim-evidence',
    'continue-current-slice': 'continue-current-slice',
  }[recommendedAction]
  const taskRouting = recommendedAction === 'open-next-slice'
    ? planUnitTaskRouting()
    : internalTaskRouting(routingActionKind)

  return {
    mode: 'no-goal-mode',
    intent: 'Use this packet when the user says continue in an ordinary chat session without Codex Goal Mode or another host scheduler.',
    preflightStatus,
    canProceed: !hasHardFailure,
    recommendedAction,
    taskRouting,
    selectedCandidate: shouldOpenNextSlice
      ? {
          id: firstCandidate.id,
          title: firstCandidate.title,
          source: firstCandidate.source,
          reason: firstCandidate.reason,
          actionPacket: firstCandidate.actionPacket,
          suggestedProfile: firstCandidate.suggestedProfile,
          taskRouting: firstCandidate.taskRouting,
        }
      : null,
    currentSlice: compactState.currentSlice,
    firstSteps: firstStepsByAction[recommendedAction],
    closeCommands,
    evidenceTarget: '.gse/evidence/YYYY-MM-DD.md and .gse/evidence/index.jsonl',
    stateTargets: ['.gse/current-slice.md', '.gse/state.json', '.gse/goal-map.md'],
    claimBoundary: 'Portable continuation only; does not prove host-native slash-command support, Codex Goal Mode scheduling, subagent dispatch, browser automation, MCP, or LSP availability.',
    stopConditions: [
      'Stop before implementation if hard preflight checks fail.',
      'Stop before claiming host/public/release support if required accepted or external evidence is missing.',
      'Stop before closing if focused checks or required close commands fail.',
    ],
  }
}

function makeCheck(id, label, ok, evidence, severity = 'hard', recommendation = '') {
  return {
    id,
    label,
    status: ok ? 'passed' : severity === 'soft' ? 'warning' : 'failed',
    severity,
    evidence,
    recommendation,
  }
}

function createFixture(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-continue-packet-'))
  fs.mkdirSync(path.join(dir, '.gse', 'evidence'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Rules\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'README.md'), '# GSE\n\nCanonical plan: `docs/productization-architecture.md`.\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'project-profile.md'), '# Project Profile\n\n- Product/system name: Fixture Product\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'goal-map.md'), '# Goal Map\n\nCanonical product goal source: `docs/productization-architecture.md`.\n\nThis file is a GSE execution projection. Canonical product goal source wins if this projection conflicts with product roadmap, architecture, PRD, or vision docs.\n\n## Current Focus\n\n- Active slice: Fixture continue.\n- Next action: Run fixture smoke.\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'quality-gates.md'), '# Quality Gates\n\n- Evidence required.\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'host-capabilities.md'), [
    '# Host Capabilities',
    '',
    '| Capability | Host/Tool | Status | Evidence | Claim Boundary | Last Checked |',
    '|---|---|---|---|---|---|',
    '| native-slash-command | current host | external-required | - | Native slash-command support requires real host runtime invocation evidence, not portable `/gse` runner output. | - |',
    '| browser | browser or Playwright | unknown | - | Browser proof requires a real browser/component/screenshot command for this project. | - |',
    '| mcp | MCP servers | unknown | - | MCP status is host and project specific. | - |',
    '| lsp | LSP or code index | unknown | - | LSP/index status is current-session specific unless project docs prove it. | - |',
    '| subagent | host dispatch | unknown | - | Real subagent dispatch requires verified host/tool evidence; sequential role fallback is not real dispatch. | - |',
    '| ci | project CI | unknown | - | CI is verified only after a workflow/config or run is checked for this project. | - |',
    '',
  ].join('\n'), 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'project-guards.md'), [
    '# Project Guards',
    '',
    '| ID | Guard | Severity | Trigger | Check | Status |',
    '|---|---|---|---|---|---|',
    '| WIN-SHELL | Use shell syntax that matches the active host. | high | shell command | Confirm shell syntax. | active |',
    '| SPARSE-GIT | Check sparse checkout before staging workflow folders. | high | git staging | Confirm sparse visibility. | active |',
    '| UTF8-DOC | Use UTF-8-safe readers before judging mojibake. | high | docs | Use UTF-8 reader. | active |',
    '| EVIDENCE-STALE | Treat stale evidence as preflight problem. | high | evidence | Validate latest evidence. | active |',
    '| UI-EVIDENCE | Label UI/browser downgrades explicitly. | medium | UI proof | Record evidence level. | active |',
    '| SUBAGENT-HONEST | Do not claim fake subagent dispatch. | high | subagent | Require real host evidence. | active |',
    '| SYNC-NO-INTERRUPT | Do not interrupt running project sessions with cross-thread sync. | high | sync or delegation | Confirm the target session is idle or use owner action record. | active |',
    '',
  ].join('\n'), 'utf8')
  fs.writeFileSync(path.join(dir, 'docs', 'productization-architecture.md'), '# Productization Architecture\n', 'utf8')
  fs.writeFileSync(
    path.join(dir, '.gse', 'state.json'),
    JSON.stringify({
      schemaVersion: 1,
      projectName: 'fixture-product',
      mode: 'standard',
      canonicalGoalSource: 'docs/productization-architecture.md',
      canonicalPlan: 'docs/productization-architecture.md',
      phase: 'execute',
      currentSlice: {
        id: 'fixture-continue',
        outcome: 'Fixture continue packet.',
        status: options.verifiedSlice ? 'verified' : 'planned',
        nextAction: options.verifiedSlice ? 'Open the next user-visible fixture slice.' : 'Run fixture smoke.',
      },
      toolStatuses: {
        browser: 'unknown',
        lsp: 'unknown',
        mcp: 'unknown',
        subagents: 'unknown',
        ci: 'unknown',
      },
      lastEvidence: '.gse/evidence/2026-07-08.md',
      residualRisks: [
        'Fixture top risk 1.',
        'Fixture top risk 2.',
        'Fixture top risk 3.',
        'Fixture archived risk 4.',
      ],
    }, null, 2) + '\n',
    'utf8',
  )
  fs.writeFileSync(
    path.join(dir, '.gse', 'evidence', 'index.jsonl'),
    options.invalidEvidence
      ? '{"date":"2026-07-08"\n'
      : JSON.stringify({
        date: '2026-07-08',
        recordType: 'slice',
        status: 'verified',
        evidenceLevel: 'verified-unit',
        requiredEvidenceLevel: 'verified-unit',
        summary: 'Fixture evidence.',
        evidenceFile: '.gse/evidence/2026-07-08.md',
        commands: ['fixture'],
        nextAction: 'Run fixture smoke.',
      }) + '\n',
    'utf8',
  )
  if (!options.invalidEvidence) {
    fs.writeFileSync(
      path.join(dir, '.gse', 'evidence', '2026-07-08.md'),
      '# Fixture Evidence\n\nVerified fixture continuation.\n',
      'utf8',
    )
  }
  return dir
}

async function buildContinuePacket(target) {
  const resolvedTarget = path.resolve(target)
  const gseDir = path.join(resolvedTarget, '.gse')
  const stateResult = readJson(path.join(gseDir, 'state.json'))
  const state = stateResult.ok ? stateResult.data : null
  const evidenceIndex = readJsonl(path.join(gseDir, 'evidence', 'index.jsonl'))
  const goalMapText = readText(path.join(gseDir, 'goal-map.md'))
  const profileText = readText(path.join(gseDir, 'project-profile.md'))
  const canonicalPlan = findCanonicalPlan(resolvedTarget, state)
  const projectGuards = readProjectGuards(resolvedTarget)
  const roleFallback = readRoleDispatchFallback(resolvedTarget)
  const stateRepair = await auditStateRepair(resolvedTarget)
  const learningPromotion = analyzeLearningPromotions(resolvedTarget)
  const learningDrift = auditLearningDrift(resolvedTarget)
  const hostCapabilities = readHostCapabilities(resolvedTarget)
  const toolFallbackPolicy = auditToolFallbackPolicy(resolvedTarget)
  const maintenanceSnapshot = readMaintenanceSnapshot(resolvedTarget)
  const sessionSyncBoundary = readSessionSyncBoundary(resolvedTarget)
  const evidenceLevelAnalysis = analyzeEvidenceLevels(evidenceIndex.records)
  const evidenceReviewQueue = analyzeEvidenceReviewQueue(evidenceIndex.records, resolvedTarget)
  const productProgressDrift = analyzeProductProgressDrift(evidenceIndex.records, state)
  const productOutcomeGate = analyzeProductOutcomeGate(resolvedTarget, evidenceIndex.records, state, canonicalPlan, profileText, goalMapText)
  const canonicalGoalSourceHygiene = analyzeCanonicalGoalSourceHygiene(resolvedTarget, canonicalPlan)
  const gitChanges = listGitChanges(resolvedTarget)
  const deliveryPackRecommendation = buildDeliveryPackRecommendation(resolvedTarget, state, profileText, goalMapText, gitChanges)
  const stageIntent = [state?.currentSlice?.outcome, state?.currentSlice?.nextAction].filter(Boolean).join(' ') || goalMapText.slice(0, 1000)
  const projectStage = detectProjectStage(resolvedTarget, stageIntent)
  const contextHealthArgs = ['--target', resolvedTarget, '--json']
  if (contextSessionPath) contextHealthArgs.push('--session', path.resolve(contextSessionPath))
  if (contextSessionId) contextHealthArgs.push('--session-id', contextSessionId)
  const contextHealthRun = runNode('audit-context-health.mjs', contextHealthArgs)
  const contextHealth = contextHealthRun.data || {
    status: 'unavailable',
    health: 'unavailable',
    action: 'continue-portable-policy',
    goalPayload: null,
    reason: contextHealthRun.stderr || 'context health unavailable',
  }
  const evidenceLevelIssueCount =
    evidenceLevelAnalysis.invalidLevel.length +
    evidenceLevelAnalysis.downgraded.length +
    evidenceLevelAnalysis.missingLevel.length
  const canonicalPlanExists = canonicalPlan ? exists(resolvedTarget, canonicalPlan) : false
  const evidenceRecordsAreSchemaComplete = evidenceIndex.ok && evidenceIndex.records.length > 0 && evidenceIndex.records.every((record) =>
    typeof record.date === 'string' &&
    typeof record.recordType === 'string' &&
    typeof record.status === 'string' &&
    typeof record.summary === 'string' &&
    typeof record.evidenceFile === 'string' &&
    Array.isArray(record.commands) &&
    typeof record.nextAction === 'string',
  )

  const checks = [
    makeCheck('CP01', '.gse directory exists', exists(resolvedTarget, '.gse'), exists(resolvedTarget, '.gse') ? '.gse present' : '.gse missing'),
    makeCheck('CP02', 'state.json exists and parses', stateResult.ok, stateResult.exists ? stateResult.ok ? 'valid JSON' : stateResult.error : 'missing'),
    makeCheck('CP03', 'evidence index exists and parses as JSONL', evidenceIndex.ok, evidenceIndex.exists ? evidenceIndex.ok ? `${evidenceIndex.records.length} record(s)` : evidenceIndex.error : 'missing'),
    makeCheck('CP04', 'evidence index records are schema-complete', evidenceRecordsAreSchemaComplete, evidenceRecordsAreSchemaComplete ? 'records include status, evidenceFile, commands, nextAction' : 'missing required fields or no records'),
    makeCheck('CP05', 'project profile exists', exists(resolvedTarget, '.gse/project-profile.md'), '.gse/project-profile.md'),
    makeCheck('CP06', 'goal map exists', exists(resolvedTarget, '.gse/goal-map.md'), '.gse/goal-map.md'),
    makeCheck('CP07', 'quality gates exist', exists(resolvedTarget, '.gse/quality-gates.md'), '.gse/quality-gates.md'),
    makeCheck('CP08', 'canonical product goal source is discoverable and present', Boolean(canonicalPlan && canonicalPlanExists), canonicalPlan ? `${canonicalPlan}:${canonicalPlanExists ? 'present' : 'missing'}` : 'not discovered'),
    makeCheck('CP09', 'current slice has next action', Boolean(state?.currentSlice?.nextAction || firstMatch(goalMapText, /Next action:\s*([^\n]+)/i)), state?.currentSlice?.nextAction || firstMatch(goalMapText, /Next action:\s*([^\n]+)/i) || 'missing'),
    makeCheck('CP10', 'residual risks are bounded in compact output', Array.isArray(state?.residualRisks), Array.isArray(state?.residualRisks) ? `${state.residualRisks.length} active risk(s); top 3 surfaced` : 'missing residualRisks array', 'soft'),
    makeCheck('CP11', 'project guards are loaded as soft preflight rules', projectGuards.status !== 'failed', projectGuards.exists ? `${projectGuards.active.length} active guard(s)` : 'missing .gse/project-guards.md', 'soft', projectGuards.exists ? '' : 'Add .gse/project-guards.md or run GSE scaffold update when recurring lessons need guard coverage.'),
    makeCheck(
      'CP12',
      'evidence levels are valid and surfaced',
      evidenceLevelIssueCount === 0,
      evidenceLevelAnalysis.invalidLevel.length
        ? `invalid evidence level(s): ${evidenceLevelAnalysis.invalidLevel.map((item) => `${item.summary}:${item.evidenceLevel}`).join('; ')}`
        : `${evidenceLevelAnalysis.recordsWithLevel}/${evidenceLevelAnalysis.records} record(s) with evidenceLevel; ${evidenceLevelAnalysis.downgraded.length} downgrade(s); ${evidenceLevelAnalysis.missingLevel.length} historical missing`,
      evidenceLevelAnalysis.invalidLevel.length ? 'hard' : 'soft',
      evidenceLevelAnalysis.invalidLevel.length
        ? 'Use one of the evidence levels from references/evidence-taxonomy.md.'
        : 'Add evidenceLevel to new records and label UI/browser/API/CI downgrades explicitly.',
    ),
    makeCheck(
      'CP13',
      'historical evidence review queue is visible',
      true,
      `${evidenceReviewQueue.counts.needsReview} needs-review; ${evidenceReviewQueue.counts.eligibleForStrongerReview} eligible-for-stronger-review; ${evidenceReviewQueue.counts.externalRequired} external-required`,
      'soft',
      evidenceReviewQueue.counts.needsReview
        ? 'Review conservative historical result records before using them as stronger proof.'
        : 'No conservative historical result records currently need review.',
    ),
    makeCheck(
      'CP14',
      'role dispatch fallback packets are auditable',
      roleFallback.status !== 'failed',
      roleFallback.exists ? `${roleFallback.summary.total} role packet(s); ${roleFallback.summary.sequentialFallbackRoles.length} sequential fallback role(s)` : 'missing .gse/agents/role-fallback-packets.md',
      'soft',
      roleFallback.exists
        ? ''
        : 'Run a Standard/Enterprise GSE scaffold update or add role fallback packets before claiming role-separated execution.',
    ),
    makeCheck(
      'CP15',
      'state and evidence repair actions are available',
      stateRepair.summary.status !== 'repair-required',
      stateRepair.summary.actions
        ? `${stateRepair.summary.status}; ${stateRepair.summary.actions} repair action(s)`
        : 'clean',
      stateRepair.summary.status === 'repair-required' ? 'hard' : 'soft',
      stateRepair.summary.status === 'clean'
        ? ''
        : 'Run /gse repair or inspect compactState.stateRepair.repairActions before implementation.',
    ),
    makeCheck(
      'CP16',
      'learning promotion candidates are classified',
      learningPromotion.summary.status !== 'failed',
      learningPromotion.exists
        ? `${learningPromotion.summary.promoted} promoted candidate(s); ${learningPromotion.summary.guardCandidates} guard candidate(s); ${learningPromotion.summary.scriptCandidates} script/skill candidate(s)`
        : 'missing .gse/learnings.md',
      'soft',
      learningPromotion.exists
        ? 'Run /gse learn --promote --execute after reviewing candidate-only output.'
        : 'Record reusable lessons with /gse learn before expecting promotion candidates.',
    ),
    makeCheck(
      'CP17',
      'learning promotion drift is audited',
      learningDrift.summary.status !== 'failed',
      `${learningDrift.summary.enforced}/${learningDrift.summary.candidates} promoted candidate(s) enforced; ${learningDrift.summary.highUnenforced} high-severity drift(s)`,
      'soft',
      learningDrift.summary.highUnenforced
        ? 'Promote unenforced learning candidates into guards, quality gates, continue/close checks, or focused audit scripts.'
        : 'Keep learning candidates mapped to executable controls as they are promoted.',
    ),
    makeCheck(
      'CP18',
      'host capability records are audited',
      hostCapabilities.status !== 'failed',
      hostCapabilities.exists
        ? `${hostCapabilities.summary.total} capability row(s); verified=${hostCapabilities.summary.verified.length}; unknown=${hostCapabilities.summary.unknown.length}; external-required=${hostCapabilities.summary.externalRequired.length}`
        : 'missing .gse/host-capabilities.md',
      'soft',
      hostCapabilities.exists
        ? 'Update .gse/host-capabilities.md when host/browser/MCP/LSP/subagent/CI evidence changes.'
        : 'Add .gse/host-capabilities.md or update the GSE scaffold before making host/tool capability claims.',
    ),
    makeCheck(
      'CP19',
      'optional tool fallback policy is auditable',
      toolFallbackPolicy.summary.status !== 'failed',
      `${toolFallbackPolicy.summary.passed}/${toolFallbackPolicy.summary.total} fallback policy check(s)`,
      'soft',
      toolFallbackPolicy.summary.status === 'failed'
        ? 'Restore markdown fallback and claim boundaries for optional tools before continuing.'
        : 'Keep optional tools non-blocking and evidence-gated in host and router docs.',
    ),
    makeCheck(
      'CP20',
      'latest maintenance snapshot is available',
      maintenanceSnapshot.exists && maintenanceSnapshot.status === 'passed',
      maintenanceSnapshot.exists
        ? `${maintenanceSnapshot.status}; installedSync=${maintenanceSnapshot.installedSync}; releaseBundle=${maintenanceSnapshot.releaseBundleFreshness}; mode=${maintenanceSnapshot.installedSyncMode}`
        : 'missing .gse/maintenance/latest-maintenance-snapshot.json',
      'soft',
      maintenanceSnapshot.exists
        ? 'Regenerate /gse maintenance after capability upgrades or before release-sensitive claims.'
        : 'Run /gse maintenance --installed-root <installed-skill-dir> --execute when recurring final-form freshness must be proven.',
    ),
    makeCheck(
      'CP21',
      'session sync adoption boundary is explicit',
      sessionSyncBoundary.valid,
      sessionSyncBoundary.exists
        ? `${sessionSyncBoundary.boundary}; installedSync=${sessionSyncBoundary.installedSyncRecorded}; adoptionProven=${sessionSyncBoundary.adoptionProven}`
        : 'no session sync records claimed',
      sessionSyncBoundary.valid ? 'soft' : 'hard',
      sessionSyncBoundary.valid
        ? 'Do not infer target-session adoption from installed-copy sync or notification records.'
        : 'Repair .gse/session-sync.jsonl before relying on sync records.',
    ),
    makeCheck(
      'CP22',
      'product-visible progress drift is surfaced',
      productProgressDrift.status !== 'warning',
      `${productProgressDrift.trigger}; ${productProgressDrift.internalRecords}/${productProgressDrift.recentRecords} recent internal record(s)`,
      'soft',
      productProgressDrift.recommendation,
    ),
    makeCheck(
      'CP23',
      'product outcome gate is surfaced',
      productOutcomeGate.status !== 'warning',
      `${productOutcomeGate.projectType}/${productOutcomeGate.sliceType}; supportStreak=${productOutcomeGate.supportSliceStreak}; userVisibleDelta=${productOutcomeGate.userVisibleDelta ? 'present' : 'missing'}`,
      'soft',
      productOutcomeGate.recommendation,
    ),
    makeCheck(
      'CP24',
      'canonical product goal source stays concise',
      canonicalGoalSourceHygiene.status !== 'warning',
      canonicalGoalSourceHygiene.exists
        ? `${canonicalGoalSourceHygiene.path}; ${canonicalGoalSourceHygiene.bytes} bytes; ${canonicalGoalSourceHygiene.lines} lines; ledgerSignals=${canonicalGoalSourceHygiene.ledgerSignals}`
        : canonicalGoalSourceHygiene.path || 'not discovered',
      'soft',
      canonicalGoalSourceHygiene.recommendation,
    ),
    makeCheck(
      'CP25',
      'current project stage and bounded context pack are detected',
      Boolean(projectStage.current_stage),
      projectStage.current_stage
        ? `${projectStage.current_stage} -> ${projectStage.next_stage}; decision=${projectStage.decision}; references=${projectStage.required_references.length}`
        : projectStage.error || 'stage advice unavailable',
      'soft',
      projectStage.current_stage
        ? 'Inspect stage_basis before acting; load only required_references until the gate passes.'
        : 'Run scripts/detect-project-stage.mjs directly and inspect repository evidence.',
    ),

    makeCheck(
      'CP26',
      'context pressure and active goal payload are bounded',
      !['orange', 'red'].includes(contextHealth.health) && contextHealth.goalPayload?.status !== 'goal-payload-risk',
      `health=${contextHealth.health}; usage=${contextHealth.usagePercent ?? 'unknown'}; compactions=${contextHealth.compactionCount ?? 'unknown'}; goal=${contextHealth.goalPayload?.status ?? 'unavailable'}`,
      'soft',
      ['orange', 'red'].includes(contextHealth.health)
        ? 'Finish the current atom, generate /gse context --checkpoint, and roll over before expanding scope.'
        : contextHealth.goalPayload?.status === 'goal-payload-risk'
          ? 'Keep active goal at 8-12 lines and compact goal-map to current execution index plus evidence pointers.'
          : 'Keep tool output and delegated context within the documented budgets.',
    ),
  ]
  const projectName = cleanInlineValue(
    state?.projectName ||
    firstMatch(profileText, /Product\/system name:\s*([^\n]+)/i) ||
    path.basename(resolvedTarget),
  )
  const residualRisks = Array.isArray(state?.residualRisks) ? state.residualRisks : []
  const archivedRisks = Array.isArray(state?.riskArchive) ? state.riskArchive : []
  const topRisks = residualRisks.slice(0, 3)
  const hiddenActiveRiskCount = Math.max(0, residualRisks.length - topRisks.length)
  const archivedRiskCount = archivedRisks.length
  const totalRiskCount = residualRisks.length + archivedRisks.length
  const blockedGates = []

  const targetHasPublicAcceptanceDoctor =
    fs.existsSync(path.join(resolvedTarget, 'scripts', 'audit-public-acceptance-readiness.mjs')) &&
    fs.existsSync(path.join(resolvedTarget, 'references', 'final-readiness.md')) &&
    fs.existsSync(path.join(root, 'scripts', 'audit-public-acceptance-readiness.mjs'))

  let ownerExternalGateSummary = null
  if (targetHasPublicAcceptanceDoctor) {
    const doctor = runNode('audit-public-acceptance-readiness.mjs', ['--root', resolvedTarget, '--json'])
    ownerExternalGateSummary = {
      status: doctor.data?.summary?.status ?? 'unknown',
      publicAccepted: doctor.data?.summary?.publicAccepted ?? 'unknown',
      pendingGates: doctor.data?.summary?.pendingGates ?? 0,
      command: doctor.command,
    }
    for (const gate of doctor.data?.pendingGates ?? []) {
      blockedGates.push({
        area: gate.area,
        status: gate.status,
        owner: gate.owner,
        requiredEvidence: gate.requiredEvidence,
        gateType: 'owner-external',
        blockingScope: 'public-or-host-claim',
      })
    }
  }

  const failedHardChecks = checks.filter((item) => item.status === 'failed' && item.severity === 'hard')
  const warningChecks = checks.filter((item) => item.status === 'warning')
  const preflightStatus = failedHardChecks.length > 0 ? 'failed' : blockedGates.length > 0 || warningChecks.length > 0 ? 'warning' : 'passed'
  const latestEvidence = evidenceIndex.records.at(-1) ?? null
  const latestEvidenceLevel = latestEvidence?.evidenceLevel ?? null
  const completionPlan = buildCompletionPlan(resolvedTarget, state, maintenanceSnapshot)
  const gateTaxonomy = buildGateTaxonomy(blockedGates)
  const nextSliceMode = buildNextSliceMode(state)
  const nextSliceCandidates = buildNextSliceCandidates(resolvedTarget, state, nextSliceMode, productProgressDrift, productOutcomeGate)
  const nextChecks = [
    'node scripts/run-gse-command.mjs --target <project-root> --command "/gse doctor" --json',
    ...completionPlan.requiredCloseCommands,
    ...completionPlan.activeCloseCommands,
  ]
  const goalMapRole = /execution projection/i.test(goalMapText) ? 'execution projection only' : 'projection required'

  const compactState = {
    projectName,
    mode: state?.mode ?? 'unknown',
    phase: state?.phase ?? 'unknown',
    canonicalPlan,
    canonicalGoalSource: canonicalPlan,
    goalMapRole,
    currentSlice: {
      id: state?.currentSlice?.id ?? null,
      outcome: state?.currentSlice?.outcome || firstMatch(goalMapText, /Active slice:\s*([^\n]+)/i) || 'Read goal map and select the next verifiable slice.',
      status: state?.currentSlice?.status ?? 'unknown',
      nextAction: state?.currentSlice?.nextAction || firstMatch(goalMapText, /Next action:\s*([^\n]+)/i) || 'Continue with the smallest verifiable GSE slice.',
    },
    topRisks,
    riskCount: residualRisks.length,
    activeRiskCount: residualRisks.length,
    hiddenActiveRiskCount,
    archivedRiskCount,
    totalRiskCount,
    blockedGates,
    gateTaxonomy,
    nextSliceMode,
    nextSliceCandidates,
    executionPolicy: EXECUTION_POLICY,
    nextChecks,
    productProgressDrift,
    productOutcomeGate,
    canonicalGoalSourceHygiene,
    deliveryPackRecommendation,
    projectStage,
    completionPlan,
    toolStatuses: state?.toolStatuses ?? {},
    latestEvidence,
    latestEvidenceLevel,
    contextHealth,
    evidenceLevels: {
      allowed: evidenceLevelAnalysis.allowed,
      recordsWithLevel: evidenceLevelAnalysis.recordsWithLevel,
      missingLevel: evidenceLevelAnalysis.missingLevel.length,
      invalidLevel: evidenceLevelAnalysis.invalidLevel,
      downgraded: evidenceLevelAnalysis.downgraded,
    },
    evidenceReviewQueue: {
      totalRecords: evidenceReviewQueue.counts.totalRecords,
      queued: evidenceReviewQueue.counts.queued,
      needsReview: evidenceReviewQueue.counts.needsReview,
      safeResult: evidenceReviewQueue.counts.safeResult,
      eligibleForStrongerReview: evidenceReviewQueue.counts.eligibleForStrongerReview,
      externalRequired: evidenceReviewQueue.counts.externalRequired,
      missingEvidenceFile: evidenceReviewQueue.counts.missingEvidenceFile,
      items: evidenceReviewQueue.queue.slice(0, 5),
    },
    projectGuards: {
      status: projectGuards.status,
      activeCount: projectGuards.active.length,
      guards: projectGuards.active.map((guard) => ({
        id: guard.id,
        severity: guard.severity,
        trigger: guard.trigger,
        check: guard.check,
      })),
      missingDefaultIds: projectGuards.summary.missingDefaultIds,
    },
    roleFallback: {
      status: roleFallback.status,
      exists: roleFallback.exists,
      total: roleFallback.summary.total,
      requiredRoles: roleFallback.summary.requiredRoles,
      missingRoles: roleFallback.summary.missingRoles,
      sequentialFallbackRoles: roleFallback.summary.sequentialFallbackRoles,
      fakeDelegationRisk: roleFallback.summary.fakeDelegationRisk,
    },
    stateRepair: {
      status: stateRepair.summary.status,
      hard: stateRepair.summary.hard,
      warnings: stateRepair.summary.warnings,
      repairActions: stateRepair.repairActions,
    },
    learningPromotion: {
      status: learningPromotion.summary.status,
      entries: learningPromotion.summary.entries,
      uniqueLessons: learningPromotion.summary.uniqueLessons,
      promoted: learningPromotion.summary.promoted,
      guardCandidates: learningPromotion.summary.guardCandidates,
      scriptCandidates: learningPromotion.summary.scriptCandidates,
      topCandidates: learningPromotion.promotions.slice(0, 5).map((item) => ({
        id: item.id,
        category: item.category,
        severity: item.severity,
        count: item.count,
        promotionLevel: item.promotionLevel,
        promotionTarget: item.promotionTarget,
      })),
    },
    learningDrift: {
      status: learningDrift.summary.status,
      candidates: learningDrift.summary.candidates,
      enforced: learningDrift.summary.enforced,
      unenforced: learningDrift.summary.unenforced,
      highUnenforced: learningDrift.summary.highUnenforced,
      unenforcedCandidates: learningDrift.unenforced.slice(0, 5).map((item) => ({
        id: item.candidateId,
        category: item.category,
        severity: item.severity,
        promotionLevel: item.promotionLevel,
        recommendation: item.recommendation,
      })),
    },
    hostCapabilities: {
      status: hostCapabilities.status,
      exists: hostCapabilities.exists,
      total: hostCapabilities.summary.total,
      verified: hostCapabilities.summary.verified,
      documented: hostCapabilities.summary.documented,
      unknown: hostCapabilities.summary.unknown,
      unavailable: hostCapabilities.summary.unavailable,
      externalRequired: hostCapabilities.summary.externalRequired,
      missingRequired: hostCapabilities.summary.missingRequired,
      nativeSlashOverclaim: hostCapabilities.summary.nativeSlashOverclaim,
    },
    toolFallbackPolicy: {
      status: toolFallbackPolicy.summary.status,
      checks: toolFallbackPolicy.summary.passed + '/' + toolFallbackPolicy.summary.total,
      optionalToolFallbackPolicy: toolFallbackPolicy.workflows.optionalToolFallbackPolicy,
    },
    maintenanceSnapshot: {
      exists: maintenanceSnapshot.exists,
      status: maintenanceSnapshot.status,
      generatedAt: maintenanceSnapshot.generatedAt,
      summary: maintenanceSnapshot.summary,
      installedSync: maintenanceSnapshot.installedSync,
      releaseBundleFreshness: maintenanceSnapshot.releaseBundleFreshness,
      installedSyncMode: maintenanceSnapshot.installedSyncMode,
    },
    sessionSyncBoundary: {
      exists: sessionSyncBoundary.exists,
      valid: sessionSyncBoundary.valid,
      boundary: sessionSyncBoundary.boundary,
      totalRecords: sessionSyncBoundary.totalRecords,
      statusCounts: sessionSyncBoundary.statusCounts,
      installedSyncRecorded: sessionSyncBoundary.installedSyncRecorded,
      adoptionProven: sessionSyncBoundary.adoptionProven,
      latestInstalledSync: sessionSyncBoundary.latestInstalledSync,
      latestThreadOutcomes: sessionSyncBoundary.latestThreadOutcomes,
      latestRecords: sessionSyncBoundary.latestRecords,
      limits: sessionSyncBoundary.limits,
    },
  }

  compactState.noGoalMode = buildNoGoalModePacket({
    compactState,
    preflightStatus,
    failedHardChecks,
    blockedGates,
  })

  const prompt = buildShortPrompt({ projectName, resolvedTarget, preflightStatus, compactState, blockedGates, failedHardChecks })

  return {
    target: resolvedTarget,
    generatedAt: new Date().toISOString(),
    outputProfile,
    summary: {
      status: preflightStatus,
      failedHardChecks: failedHardChecks.length,
      warnings: warningChecks.length,
      blockedGates: blockedGates.length,
      riskCount: residualRisks.length,
      activeRiskCount: residualRisks.length,
      archivedRiskCount,
      totalRiskCount,
      topRiskCount: topRisks.length,
    },
    preflight: {
      status: preflightStatus,
      checks,
      failures: failedHardChecks,
      warnings: warningChecks,
    },
    compactState,
    ownerExternalGateSummary,
    prompt,
    limits: [
      'This packet is the portable /gse continue preflight, not host-native slash-command proof.',
      'Owner/external records affect only public release, marketplace, registry, or host-specific claims; they are not GSE core workflow blockers unless project policy says so.',
      'Bad state or evidence index is a hard preflight failure and must be repaired before implementation starts.',
    ],
  }
}

function renderMarkdown(report) {
  if (report.outputProfile === 'brief') return renderBriefMarkdown(report)
  if (report.outputProfile === 'doctor') return renderDoctorMarkdown(report)
  const lines = []
  lines.push('# GSE Continue Packet')
  lines.push('')
  lines.push('Generated: ' + report.generatedAt)
  lines.push('Target: ' + report.target)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + report.summary.status)
  lines.push('- Project: ' + report.compactState.projectName)
  lines.push('- Phase: ' + report.compactState.phase)
  lines.push('- Canonical product goal source: ' + (report.compactState.canonicalGoalSource || 'not discovered'))
  lines.push('- Goal map role: ' + report.compactState.goalMapRole)
  lines.push('- Goal map boundary: canonical product goal source owns durable intent; goal-map stays projection-only.')
  lines.push('- Current slice: ' + report.compactState.currentSlice.outcome)
  lines.push('- Next action: ' + report.compactState.currentSlice.nextAction)
  lines.push('- Risks: ' + report.summary.topRiskCount + ' shown / ' + report.summary.activeRiskCount + ' active (' + report.summary.archivedRiskCount + ' archived)')
  lines.push('- Pending public/host claim evidence: ' + report.summary.blockedGates)
  lines.push('- Gate taxonomy: core gates block default continuation; release and host-adapter gates block only their specific claims unless project policy promotes them.')
  lines.push('- Active project guards: ' + report.compactState.projectGuards.activeCount)
  lines.push('- Latest evidence level: ' + (report.compactState.latestEvidenceLevel || 'missing'))
  lines.push('- Evidence level downgrades: ' + report.compactState.evidenceLevels.downgraded.length)
  lines.push('- UI/browser proof boundary: `verified-component` is not `verified-browser`; screenshot/browser-backed claims require `verified-browser` evidence.')
  lines.push('- Role fallback packets: ' + report.compactState.roleFallback.total + ' (' + report.compactState.roleFallback.status + ')')
  lines.push('- State repair: ' + report.compactState.stateRepair.status + ' (' + report.compactState.stateRepair.repairActions.length + ' action(s))')
  lines.push('- Learning promotion: ' + report.compactState.learningPromotion.status + ' (' + report.compactState.learningPromotion.promoted + ' candidate(s))')
  lines.push('- Learning drift: ' + report.compactState.learningDrift.status + ' (' + report.compactState.learningDrift.enforced + '/' + report.compactState.learningDrift.candidates + ' enforced)')
  lines.push('- Host capabilities: ' + report.compactState.hostCapabilities.status + ' (' + report.compactState.hostCapabilities.total + ' row(s))')
  lines.push('- Maintenance snapshot: ' + report.compactState.maintenanceSnapshot.status + ' (' + report.compactState.maintenanceSnapshot.installedSyncMode + ')')
  lines.push('- Session sync boundary: ' + report.compactState.sessionSyncBoundary.boundary + ' (adoptionProven=' + report.compactState.sessionSyncBoundary.adoptionProven + ')')
  lines.push('- Product outcome gate: ' + report.compactState.productOutcomeGate.status + ' (' + report.compactState.productOutcomeGate.projectType + '/' + report.compactState.productOutcomeGate.sliceType + ')')
  lines.push('- Canonical goal source hygiene: ' + report.compactState.canonicalGoalSourceHygiene.status + ' (' + (report.compactState.canonicalGoalSourceHygiene.path || 'not discovered') + ')')
  lines.push('- Delivery pack: ' + report.compactState.deliveryPackRecommendation.primaryLabel + ' (' + report.compactState.deliveryPackRecommendation.changedSurface + ')')
  lines.push('- Project stage: ' + (report.compactState.projectStage.current_stage || 'unavailable') + ' -> ' + (report.compactState.projectStage.next_stage || 'unknown') + ' (' + (report.compactState.projectStage.decision || 'unknown') + ')')
  lines.push('- Completion plan: ' + report.compactState.completionPlan.requiredCloseCommands.length + ' required command(s), ' + report.compactState.completionPlan.activeCloseCommands.length + ' active conditional command(s)')
  if (report.compactState.completionPlan.ignoredGeneratedPathCount > 0) {
    lines.push('- Ignored generated/noisy paths: ' + report.compactState.completionPlan.ignoredGeneratedPathCount)
  }
  lines.push('')
  lines.push('## Preflight')
  lines.push('')
  for (const item of report.preflight.checks) {
    const marker = item.status === 'passed' ? '[x]' : item.status === 'warning' ? '[!]' : '[ ]'
    lines.push('- ' + marker + ' ' + item.id + ' ' + item.label + ': ' + item.evidence)
  }
  lines.push('')
  lines.push('## Completion Plan')
  lines.push('')
  lines.push('Required steps:')
  for (const step of report.compactState.completionPlan.requiredSteps) {
    lines.push('- ' + step)
  }
  lines.push('')
  lines.push('Required commands:')
  for (const command of report.compactState.completionPlan.requiredCloseCommands) {
    lines.push('- `' + command + '`')
  }
  const activeConditional = report.compactState.completionPlan.conditionalCloseCommands.filter((item) => item.active)
  if (activeConditional.length) {
    lines.push('')
    lines.push('Active conditional commands:')
    for (const item of activeConditional) {
      lines.push('- `' + item.command + '` - ' + item.when)
    }
  }
  if (report.compactState.completionPlan.ignoredGeneratedPathCount > 0) {
    lines.push('')
    lines.push('Ignored generated/noisy paths:')
    for (const item of report.compactState.completionPlan.ignoredGeneratedPaths) {
      lines.push('- `' + item + '`')
    }
  }
  lines.push('')
  lines.push('## Delivery Pack')
  lines.push('')
  lines.push('- Primary: ' + report.compactState.deliveryPackRecommendation.primaryLabel)
  lines.push('- Changed surface: ' + report.compactState.deliveryPackRecommendation.changedSurface)
  lines.push('- References: ' + report.compactState.deliveryPackRecommendation.references.join(', '))
  lines.push('- Minimum verification:')
  for (const item of report.compactState.deliveryPackRecommendation.minimumVerification.slice(0, 6)) lines.push('  - ' + item)
  lines.push('- Review axes: ' + report.compactState.deliveryPackRecommendation.reviewAxes.join(', '))
  lines.push('- Acceptance scenarios:')
  for (const item of report.compactState.deliveryPackRecommendation.acceptanceScenarios) lines.push('  - ' + item.scenario)
  lines.push('')
  lines.push('## Prompt')
  lines.push('')
  lines.push('```text')
  lines.push(report.prompt)
  lines.push('```')
  return lines.join('\n') + '\n'
}

function renderBriefMarkdown(report) {
  return [
    report.prompt,
    'Checks: ' + report.summary.status + '; warnings=' + report.summary.warnings + '; hardFailures=' + report.summary.failedHardChecks,
    'Next: ' + report.compactState.noGoalMode.recommendedAction,
  ].join('\n') + '\n'
}

function renderDoctorMarkdown(report) {
  const lines = []
  lines.push('# GSE Continue Doctor')
  lines.push('')
  lines.push('Generated: ' + report.generatedAt)
  lines.push('Target: ' + report.target)
  lines.push('')
  lines.push('## Full Packet')
  lines.push('')
  lines.push('```json')
  lines.push(JSON.stringify(report, null, 2))
  lines.push('```')
  return lines.join('\n') + '\n'
}

const target = selfTest ? createFixture({
  invalidEvidence: args.includes('--invalid-evidence-fixture'),
  verifiedSlice: args.includes('--verified-slice-fixture'),
}) : targetArg
const report = await buildContinuePacket(target)

if (selfTest) fs.rmSync(target, { recursive: true, force: true })

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(renderMarkdown(report))

if (report.preflight.status === 'failed') process.exit(1)
