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

function read(relativePath) {
  const absolutePath = path.join(root, relativePath)
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : ''
}

function run(script, commandArgs, cwd = root) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...commandArgs], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  })
  const stdout = (result.stdout ?? '').trim()
  let parsed = null
  try {
    parsed = JSON.parse(stdout)
  } catch {
    parsed = null
  }
  return {
    command: [process.execPath, path.join(root, 'scripts', script), ...commandArgs].join(' '),
    status: result.status ?? 1,
    stdout,
    stderr: (result.stderr ?? '').trim(),
    data: parsed,
  }
}

function check(id, label, passed, evidence, risk = '') {
  return {
    id,
    label,
    status: passed ? 'passed' : 'failed',
    evidence,
    risk,
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function writeExtraFiles(dir, extraFiles = {}) {
  for (const [relativePath, content] of Object.entries(extraFiles)) {
    const absolutePath = path.join(dir, relativePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, content, 'utf8')
  }
}

function createBaseFixture(kind, extraFiles = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gse-delivery-pack-${kind}-`))
  fs.mkdirSync(path.join(dir, '.gse', 'evidence'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.gse', 'maintenance'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.gse', 'project-profile.md'), [
    '# Project Profile',
    '',
    '- Product/system name: Delivery Pack Fixture',
    `- Type: ${kind}`,
    '',
  ].join('\n'), 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'goal-map.md'), [
    '# Goal Map',
    '',
    'Canonical product goal source: `docs/product-architecture.md`.',
    '',
    'This file is a GSE execution projection. Canonical product goal source wins.',
    '',
    '## Current Focus',
    '',
    `- Active slice: ${kind} fixture.`,
    '- Next action: Run delivery pack audit.',
    '',
  ].join('\n'), 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'quality-gates.md'), '# Quality Gates\n\n- Evidence required.\n', 'utf8')
  fs.writeFileSync(path.join(dir, 'docs', 'product-architecture.md'), '# Product Architecture\n\nA small app fixture.\n', 'utf8')
  writeJson(path.join(dir, '.gse', 'state.json'), {
    schemaVersion: 1,
    projectName: `delivery-pack-${kind}`,
    mode: 'standard',
    canonicalPlan: 'docs/product-architecture.md',
    phase: 'execute',
    currentSlice: {
      id: `delivery-pack-${kind}`,
      outcome: `${kind} delivery fixture change.`,
      status: 'planned',
      nextAction: 'Run delivery pack audit.',
    },
    toolStatuses: {
      browser: 'unknown',
      lsp: 'unknown',
      mcp: 'unknown',
      subagents: 'unknown',
      ci: 'unknown',
    },
    lastEvidence: '.gse/evidence/2026-07-12.md',
    residualRisks: [],
  })
  fs.writeFileSync(path.join(dir, '.gse', 'evidence', 'index.jsonl'), JSON.stringify({
    date: '2026-07-12',
    recordType: 'slice',
    status: 'verified',
    evidenceLevel: 'verified-unit',
    requiredEvidenceLevel: 'verified-unit',
    summary: 'Fixture evidence.',
    evidenceFile: '.gse/evidence/2026-07-12.md',
    commands: ['fixture'],
    nextAction: 'Run delivery pack audit.',
  }) + '\n', 'utf8')
  fs.writeFileSync(path.join(dir, '.gse', 'evidence', '2026-07-12.md'), '# Evidence\n', 'utf8')
  writeJson(path.join(dir, '.gse', 'maintenance', 'latest-maintenance-snapshot.json'), {
    schemaVersion: 1,
    root: dir,
    target: dir,
    generatedAt: '2026-07-12T00:00:00.000Z',
    summary: {
      status: 'passed',
      passed: 1,
      failed: 0,
      total: 1,
      installedSyncMode: 'package-only',
    },
    workflows: {
      maintenanceSnapshot: 'verified',
      installedSync: 'package-only',
      releaseBundleFreshness: 'skipped',
    },
  })
  spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8', windowsHide: true })
  spawnSync('git', ['add', '.'], { cwd: dir, encoding: 'utf8', windowsHide: true })
  spawnSync('git', ['-c', 'user.name=GSE Audit', '-c', 'user.email=gse-audit@example.invalid', 'commit', '-m', 'baseline'], { cwd: dir, encoding: 'utf8', windowsHide: true })
  writeExtraFiles(dir, extraFiles)
  return dir
}

const fixtures = [
  {
    id: 'frontend',
    expectedSurface: 'frontend',
    expectedPrimary: 'frontend-ui-browser',
    dir: createBaseFixture('frontend app', {
      'src/app/page.tsx': 'export default function Page(){ return <main>Visible UI</main> }\n',
      'components/Button.tsx': 'export function Button(){ return <button>Run</button> }\n',
    }),
  },
  {
    id: 'backend',
    expectedPrimary: 'backend-api-data',
    dir: createBaseFixture('backend api', {
      'server/api/generate.ts': 'export function handler(){ return { ok: true } }\n',
    }),
  },
  {
    id: 'fullstack',
    expectedSurface: 'mixed',
    expectedPrimary: 'frontend-ui-browser',
    dir: createBaseFixture('full-stack app', {
      'src/app/page.tsx': 'export default function Page(){ return <main>Result</main> }\n',
      'server/api/result.ts': 'export function result(){ return { ok: true } }\n',
    }),
  },
  {
    id: 'worker',
    expectedPrimary: 'worker-queue-runtime',
    dir: createBaseFixture('worker queue', {
      'workers/render-job.ts': 'export async function run(){ return true }\n',
    }),
  },
  {
    id: 'migration',
    expectedPrimary: 'data-migration',
    dir: createBaseFixture('db migration project', {
      'db/migrations/001_init.sql': 'create table item(id text primary key);\n',
    }),
  },
  {
    id: 'library-cli',
    expectedPrimary: 'library-cli',
    dir: createBaseFixture('library and CLI tool', {
      'src/cli/index.ts': 'console.log("ok")\n',
      'package.json': JSON.stringify({ name: '@fixture/cli', bin: { fixture: 'src/cli/index.ts' } }, null, 2) + '\n',
    }),
  },
]

const referenceFiles = [
  'references/frontend-delivery-pack.md',
  'references/backend-data-delivery-pack.md',
  'references/ci-cd-deployment-gates.md',
  'references/project-onboarding-doctor-v2.md',
  'references/review-router.md',
  'references/acceptance-scenarios.md',
]

const matrix = read('references/capability-execution-matrix.md')
const continueSource = read('scripts/generate-continue-packet.mjs')
const validationProfile = read('scripts/run-validation-profile.mjs')
const validator = read('scripts/validate-gse.mjs')

const fixtureResults = fixtures.map((fixture) => {
  const result = run('generate-continue-packet.mjs', ['--root', root, '--target', fixture.dir, '--json'])
  const recommendation = result.data?.compactState?.deliveryPackRecommendation
  return {
    id: fixture.id,
    command: result.command,
    status: result.status,
    expectedPrimary: fixture.expectedPrimary,
    expectedSurface: fixture.expectedSurface ?? null,
    primaryPack: recommendation?.primaryPack ?? null,
    changedSurface: recommendation?.changedSurface ?? null,
    reviewAxes: recommendation?.reviewAxes ?? [],
    acceptanceScenarios: recommendation?.acceptanceScenarios ?? [],
    minimumVerification: recommendation?.minimumVerification ?? [],
    evidenceBoundaries: recommendation?.evidenceBoundaries ?? [],
    limits: recommendation?.limits ?? [],
    ok:
      result.status === 0 &&
      recommendation?.primaryPack === fixture.expectedPrimary &&
      (!fixture.expectedSurface || recommendation?.changedSurface === fixture.expectedSurface) &&
      Array.isArray(recommendation?.acceptanceScenarios) &&
      recommendation.acceptanceScenarios.length >= 1 &&
      Array.isArray(recommendation?.reviewAxes) &&
      recommendation.reviewAxes.length >= 1 &&
      Array.isArray(recommendation?.minimumVerification) &&
      recommendation.minimumVerification.length >= 1 &&
      JSON.stringify(recommendation).includes('Do not run or claim browser, CI, deploy, release'),
    stderr: result.stderr,
  }
})

const checks = [
  check('FSDP01', 'six delivery pack references exist', referenceFiles.every((file) => fs.existsSync(path.join(root, file))), referenceFiles.join(', ')),
  check('FSDP02', 'references include evidence boundaries and acceptance scenario guidance', referenceFiles.every((file) => /Evidence Boundary|Evidence level|Acceptance Scenario|Output Shape|Scenario/i.test(read(file))), 'delivery pack references'),
  check('FSDP03', 'capability matrix includes all six delivery-pack capability rows', [
    'Frontend UI/browser delivery pack',
    'Backend/API/data delivery pack',
    'CI/CD and deployment gate pack',
    'Project onboarding doctor v2',
    'Review router',
    'Acceptance scenario generator',
  ].every((item) => matrix.includes(item)), 'references/capability-execution-matrix.md'),
  check('FSDP04', 'continue packet exposes deliveryPackRecommendation', continueSource.includes('deliveryPackRecommendation') && continueSource.includes('buildDeliveryPackRecommendation'), 'scripts/generate-continue-packet.mjs'),
  check('FSDP05', 'fixtures cover frontend/backend/full-stack/worker/migration/library-cli classifications', fixtureResults.every((item) => item.ok), fixtureResults.map((item) => `${item.id}:${item.primaryPack}/${item.changedSurface}`).join('; '), fixtureResults.filter((item) => !item.ok).map((item) => `${item.id}:${item.stderr}`).join('; ')),
  check('FSDP06', 'recommendations include review axes and concise acceptance scenarios', fixtureResults.every((item) => item.reviewAxes.length && item.acceptanceScenarios.length), 'reviewAxes + acceptanceScenarios'),
  check('FSDP07', 'recommendations preserve evidence overclaim boundaries', fixtureResults.every((item) => item.evidenceBoundaries.length && item.limits.some((limit) => limit.includes('Do not run or claim browser'))), 'evidenceBoundaries + limits'),
  check('FSDP08', 'delivery-pack audit is wired into lite validation profile', validationProfile.includes('audit-full-stack-delivery-packs.mjs'), 'scripts/run-validation-profile.mjs'),
  check('FSDP09', 'full validator includes delivery-pack audit', validator.includes('audit-full-stack-delivery-packs.mjs'), 'scripts/validate-gse.mjs'),
]

const failed = checks.filter((item) => item.status === 'failed').length
const passed = checks.length - failed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: {
    status: failed === 0 ? 'passed' : 'failed',
    passed,
    failed,
    total: checks.length,
    fixtures: fixtures.length,
  },
  workflows: {
    fullStackDeliveryPacks: failed === 0 ? 'verified' : 'incomplete',
    changedSurfaceClassification: failed === 0 ? 'verified' : 'incomplete',
    reviewRouter: failed === 0 ? 'verified' : 'incomplete',
    acceptanceScenarioGenerator: failed === 0 ? 'verified' : 'incomplete',
  },
  fixtures: fixtureResults,
  checks,
  limits: [
    'This audit verifies generic delivery-pack routing and evidence boundaries with fixtures.',
    'It does not prove any target project implementation, browser runtime, CI run, deployment, npm publication, or host-native capability.',
  ],
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# Full-Stack Delivery Packs Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Fixtures: ' + data.summary.fixtures)
  lines.push('')
  lines.push('## Checks')
  lines.push('')
  for (const item of data.checks) {
    lines.push('- ' + (item.status === 'passed' ? '[x]' : '[ ]') + ' ' + item.id + ' ' + item.label + ': ' + item.status)
    if (item.evidence) lines.push('  - Evidence: ' + item.evidence)
    if (item.risk) lines.push('  - Risk: ' + item.risk)
  }
  lines.push('')
  lines.push('## Limits')
  lines.push('')
  for (const item of data.limits) lines.push('- ' + item)
  return lines.join('\n') + '\n'
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(renderMarkdown(report))

if (failed > 0) process.exit(1)
