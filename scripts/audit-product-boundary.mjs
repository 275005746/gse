#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const target = path.resolve(readArg('--target', root))
const jsonOnly = args.includes('--json')

const SOURCE_ROOTS = [
  'src',
  'app',
  'pages',
  'components',
  'server',
  'api',
  'client',
  'web',
]
const SKIPPED_SEGMENTS = new Set([
  '.gse',
  '.git',
  'node_modules',
  'test',
  'tests',
  '__tests__',
  'fixtures',
  '__fixtures__',
  'docs',
  'examples',
  'scripts',
  'dist',
  'build',
  'coverage',
  'generated',
  'vendor',
])
const MANAGEMENT_SEGMENTS = new Set([
  'gse-admin',
  'gse-management',
  'gse-diagnostics',
])
const TEXT_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.vue',
  '.svelte',
  '.html',
  '.htm',
  '.json',
])
const MAX_FILES = 2000
const MAX_FILE_BYTES = 256 * 1024
const MAX_TOTAL_BYTES = 8 * 1024 * 1024
const LEAK_PATTERNS = [
  {
    id: 'GSE_STATE_PATH',
    pattern: /["'`]\.gse[\\/]state\.json["'`]/i,
  },
  {
    id: 'REQUIRED_EVIDENCE_FIELD',
    pattern: /["'`]requiredEvidenceLevel["'`]/,
  },
  {
    id: 'STATE_REVISION_FIELD',
    pattern: /["'`]stateRevision["'`]\s*:/,
  },
  {
    id: 'PLAN_UNIT_FIELD',
    pattern: /["'`]topLevelPlanUnitId["'`]/,
  },
  {
    id: 'PLAN_UNIT_COPY',
    pattern: /(?:["'`][^"'`]*\bPlan Unit\b[^"'`]*["'`]|>[^<]*\bPlan Unit\b[^<]*<)/i,
  },
  {
    id: 'SLICE_GATE_COPY',
    pattern: /(?:["'`][^"'`]*\bSlice gate\b[^"'`]*["'`]|>[^<]*\bSlice gate\b[^<]*<)/i,
  },
]

function normalizedSegments(relativePath) {
  return relativePath.split(/[\\/]+/).filter(Boolean)
}

function isSkipped(relativePath) {
  return normalizedSegments(relativePath).some((segment) =>
    SKIPPED_SEGMENTS.has(segment.toLowerCase()),
  )
}

function isManagementSurface(relativePath) {
  return normalizedSegments(relativePath).some((segment) =>
    MANAGEMENT_SEGMENTS.has(segment.toLowerCase()),
  )
}

function candidateRoots(base) {
  return SOURCE_ROOTS
    .map((relativePath) => ({
      relativePath,
      fullPath: path.join(base, relativePath),
    }))
    .filter(({ fullPath }) => {
      try {
        return fs.statSync(fullPath).isDirectory()
      } catch {
        return false
      }
    })
}

function scanProductBoundary(base) {
  const roots = candidateRoots(base)
  const findings = []
  const scannedPaths = new Set()
  let filesScanned = 0
  let bytesScanned = 0
  let incompleteReason = null

  function scanDirectory(directory) {
    if (incompleteReason) return
    let entries
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
    } catch (error) {
      incompleteReason = `READ_DIRECTORY_FAILED:${error.code ?? 'UNKNOWN'}`
      return
    }

    for (const entry of entries) {
      if (incompleteReason) return
      if (entry.isSymbolicLink()) continue
      const fullPath = path.join(directory, entry.name)
      const relativePath = path.relative(base, fullPath).replace(/\\/g, '/')
      if (isSkipped(relativePath) || isManagementSurface(relativePath)) continue
      if (entry.isDirectory()) {
        scanDirectory(fullPath)
        continue
      }
      if (!entry.isFile() || !TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        continue
      }
      if (scannedPaths.has(relativePath)) continue
      if (filesScanned >= MAX_FILES) {
        incompleteReason = 'MAX_FILES_EXCEEDED'
        return
      }

      const stat = fs.statSync(fullPath)
      if (stat.size > MAX_FILE_BYTES) continue
      if (bytesScanned + stat.size > MAX_TOTAL_BYTES) {
        incompleteReason = 'MAX_TOTAL_BYTES_EXCEEDED'
        return
      }
      const content = fs.readFileSync(fullPath, 'utf8').replace(/^﻿/, '')
      scannedPaths.add(relativePath)
      filesScanned += 1
      bytesScanned += stat.size
      for (const [index, line] of content.split(/\r?\n/).entries()) {
        for (const rule of LEAK_PATTERNS) {
          if (rule.pattern.test(line)) {
            findings.push({
              ruleId: rule.id,
              path: relativePath,
              line: index + 1,
            })
          }
        }
      }
    }
  }

  for (const sourceRoot of roots) scanDirectory(sourceRoot.fullPath)

  return {
    status: incompleteReason
      ? 'incomplete'
      : findings.length > 0
        ? 'failed'
        : 'passed',
    roots: roots.map((item) => item.relativePath),
    filesScanned,
    bytesScanned,
    incompleteReason,
    findings,
  }
}

function writeFixtureFile(base, relativePath, content) {
  const fullPath = path.join(base, relativePath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, content, 'utf8')
}

function createFixtures() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-product-boundary-'))
  writeFixtureFile(
    fixture,
    'src/components/status.tsx',
    'export const Status = () => <p>Resolve the Slice gate first.</p>\n',
  )
  writeFixtureFile(
    fixture,
    'server/api/status.ts',
    'export const payload = { "requiredEvidenceLevel": "verified-unit" }\n',
  )
  writeFixtureFile(
    fixture,
    'src/notifications/continue.ts',
    'export const message = "Continue the approved Plan Unit"\n',
  )
  writeFixtureFile(
    fixture,
    'scripts/internal-state.mjs',
    'export const statePath = ".gse/state.json"\n',
  )
  writeFixtureFile(
    fixture,
    'src/gse-management/panel.tsx',
    'export const Panel = () => <p>Plan Unit stateRevision</p>\n',
  )
  return fixture
}

function check(id, label, ok, evidence) {
  return {
    id,
    label,
    status: ok ? 'passed' : 'failed',
    evidence,
  }
}

const fixture = createFixtures()
const fixtureScan = scanProductBoundary(fixture)
const targetScan = scanProductBoundary(target)
fs.rmSync(fixture, { recursive: true, force: true })

const fixtureRules = new Set(
  fixtureScan.findings.map((finding) => finding.ruleId),
)
const checks = [
  check(
    'PB01',
    'visible UI workflow terminology is detected',
    fixtureRules.has('SLICE_GATE_COPY'),
    `${fixtureScan.findings.length} fixture finding(s)`,
  ),
  check(
    'PB02',
    'public API and notification workflow terminology is detected',
    fixtureRules.has('REQUIRED_EVIDENCE_FIELD')
      && fixtureRules.has('PLAN_UNIT_COPY'),
    [...fixtureRules].sort().join(', '),
  ),
  check(
    'PB03',
    'internal scripts and fixtures are outside the product scan',
    !fixtureScan.findings.some(
      (finding) => finding.path === 'scripts/internal-state.mjs',
    ),
    fixtureScan.roots.join(', '),
  ),
  check(
    'PB04',
    'explicit GSE management surfaces use a narrow path allowlist',
    !fixtureScan.findings.some(
      (finding) => finding.path.includes('/gse-management/'),
    ),
    [...MANAGEMENT_SEGMENTS].join(', '),
  ),
  check(
    'PB05',
    'target product surfaces contain no high-confidence GSE workflow leaks',
    targetScan.status === 'passed',
    targetScan.incompleteReason
      ?? `${targetScan.findings.length} finding(s) in ${targetScan.filesScanned} file(s)`,
  ),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  target,
  generatedAt: new Date().toISOString(),
  summary: {
    status: failed === 0 ? 'passed' : 'failed',
    passed,
    failed,
    total: checks.length,
  },
  workflows: {
    productBoundary: failed === 0 ? 'verified' : 'failed',
  },
  targetScan,
  checks,
  limits: [
    'This is a static, read-only, high-confidence scan of common product source roots.',
    'It excludes GSE state, scripts, tests, fixtures, docs, generated output, dependencies, and explicit GSE management surfaces.',
    `It scans at most ${MAX_FILES} files, ${MAX_FILE_BYTES} bytes per file, and ${MAX_TOTAL_BYTES} bytes total; exceeding a bound fails closed.`,
    'It does not infer runtime visibility or replace product-specific UI, API, or notification tests.',
  ],
}

console.log(JSON.stringify(report, null, jsonOnly ? 2 : 2))
if (failed > 0) process.exit(1)
