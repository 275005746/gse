#!/usr/bin/env node
import fs from 'node:fs'
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
  const fullPath = path.join(root, relativePath)
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    command: [command, ...commandArgs].join(' '),
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

const finalReadiness = run(process.execPath, [path.join(root, 'scripts', 'audit-final-readiness.mjs'), '--root', root, '--json'])
const publicAcceptance = run(process.execPath, [path.join(root, 'scripts', 'audit-public-acceptance-readiness.mjs'), '--root', root, '--json'])
const finalReadinessData = parseJson(finalReadiness.stdout)
const publicAcceptanceData = parseJson(publicAcceptance.stdout)

const matrix = finalReadinessData?.matrix ?? []
const licenseRow = matrix.find((row) => row.area === 'License decision')
const licenseVerified = licenseRow?.status === 'verified' || licenseRow?.status === 'accepted'
const pendingGates = publicAcceptanceData?.pendingGates ?? []
const pendingAreas = pendingGates.map((gate) => gate.area).sort()
const expectedPendingAreas = pendingAreas

const currentFiles = [
  '.gse/gse-design-master-plan.md',
  '.gse/goal-map.md',
  '.gse/acceptance/final-acceptance-packet.md',
  '.gse/acceptance/final-form-progress-report.md',
  '.gse/acceptance/final-form-progress-report.json',
  '.gse/acceptance/public-acceptance-handoff.md',
  '.gse/acceptance/host-runtime-evidence-handoff.md',
  '.gse/acceptance/release-status-manifest.json',
  '.gse/acceptance/owner-external-gate-kit/README.md',
  '.gse/acceptance/owner-external-gate-kit/final-acceptance-packet.md',
  '.gse/acceptance/owner-external-gate-kit/public-acceptance-handoff.md',
  '.gse/acceptance/owner-external-gate-kit/host-runtime-evidence-handoff.md',
  '.gse/acceptance/owner-external-gate-kit/action-packet.md',
  '.gse/acceptance/owner-external-gate-kit/release-status-manifest.json',
  '.gse/acceptance/owner-external-gate-kit/kit-manifest.json',
  '.gse/releases/public-release-owner-required.md',
]

const staleLicensePendingPhrases = [
  'owner license selection remains required',
  'Remaining final-form work is owner-selected license acceptance',
  'Record owner-selected license acceptance',
  'record owner-selected license acceptance',
  'owner license decision before public release acceptance',
  'owner license decision, accepted public security contact',
  'owner-selected license acceptance, public security contact',
  'owner-selected license acceptance or not-public decision',
  'license decision and public security contact',
  'Owner license decision and validation evidence required',
  'owner-selected license acceptance unless accepted owner evidence exists',
]

function staleMatches() {
  if (!licenseVerified) return []
  const matches = []
  for (const file of currentFiles) {
    const content = read(file)
    for (const phrase of staleLicensePendingPhrases) {
      if (content.includes(phrase)) matches.push(`${file}: ${phrase}`)
    }
  }
  return matches
}

function localPathMatches() {
  const patterns = [
    /C:[\\/]+Users[\\/]+Admin/gi,
    /C:\/Users\/Admin/gi,
  ]
  const matches = []
  for (const file of currentFiles) {
    const content = read(file)
    for (const pattern of patterns) {
      if (pattern.test(content)) matches.push(file)
      pattern.lastIndex = 0
    }
  }
  return [...new Set(matches)]
}

function sameList(a, b) {
  return a.length === b.length && a.every((item, index) => item === b[index])
}

function jsonFile(relativePath) {
  return parseJson(read(relativePath))
}

const finalProgress = jsonFile('.gse/acceptance/final-form-progress-report.json')
const releaseStatus = jsonFile('.gse/acceptance/release-status-manifest.json')
const ownerKit = jsonFile('.gse/acceptance/owner-external-gate-kit/kit-manifest.json')

const artifactPendingSets = [
  ['final progress', (finalProgress?.pendingReleaseEvidence ?? []).map((gate) => gate.area).sort()],
  ['release status', (releaseStatus?.publicAcceptance?.pendingGates ?? []).map((gate) => gate.area).sort()],
  ['owner kit', (ownerKit?.gates ?? []).map((gate) => gate.area).sort()],
]

const publicReleaseRecord = read('.gse/releases/public-release-owner-required.md')
const finalProgressCannotClaim = finalProgress?.claimBoundary?.cannotClaim ?? []
const matches = staleMatches()
const pathMatches = localPathMatches()

const checks = [
  check('FFSC01', 'live final readiness resolves the MIT license decision', finalReadiness.status === 0 && licenseVerified && publicReleaseRecord.includes('License status: selected') && publicReleaseRecord.includes('SPDX identifier: MIT') && publicReleaseRecord.includes('Evidence status: accepted'), 'audit-final-readiness.mjs, .gse/releases/public-release-owner-required.md'),
  check('FFSC02', 'live public acceptance pending gates are current non-license gates', publicAcceptance.status === 0 && sameList(pendingAreas, expectedPendingAreas) && !pendingAreas.includes('License decision') && (pendingAreas.length > 0 || publicAcceptanceData?.summary?.publicAccepted === 'verified'), pendingAreas.join(', ')),
  check('FFSC03', 'current control and handoff docs do not describe resolved license decision as pending', matches.length === 0, matches.length ? matches.join('; ') : currentFiles.join(', ')),
  check('FFSC04', 'canonical and bundled artifacts expose the same current pending gates', artifactPendingSets.every(([, areas]) => sameList(areas, expectedPendingAreas)), artifactPendingSets.map(([name, areas]) => `${name}: ${areas.join(', ')}`).join(' | ')),
  check('FFSC05', 'public release record accepted license wording is not contradictory', publicReleaseRecord.includes('Owner license decision accepted') && !publicReleaseRecord.includes('Owner license decision and validation evidence required'), '.gse/releases/public-release-owner-required.md'),
  check('FFSC06', 'final-form progress claim boundary excludes resolved license acceptance', finalProgress?.verifiedCapabilities?.some((item) => item.area === 'License decision' && item.status === 'verified') && !finalProgressCannotClaim.some((item) => item.includes('license acceptance')), '.gse/acceptance/final-form-progress-report.json'),
  check('FFSC07', 'current public handoff artifacts do not expose local Windows user paths', pathMatches.length === 0, pathMatches.length ? pathMatches.join(', ') : currentFiles.join(', ')),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    finalFormStaleCopy: failed === 0 ? 'verified' : 'failed',
    licenseDecision: licenseVerified ? 'verified' : licenseRow?.status ?? 'unknown',
    pendingGates: pendingAreas.length,
    publicAccepted: publicAcceptanceData?.summary?.publicAccepted ?? 'unknown',
  },
  limits: [
    'This audit checks current control docs and generated handoff artifacts for stale final-form status copy.',
    'It does not scan historical evidence logs, because older evidence may truthfully describe earlier states.',
    'It does not create public security contact, public repository, CI, registry, marketplace, or host-runtime evidence.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Final-Form Stale Copy Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- License decision: ' + data.workflows.licenseDecision)
  lines.push('- Pending gates: ' + data.workflows.pendingGates)
  lines.push('- Public accepted: ' + data.workflows.publicAccepted)
  lines.push('')
  lines.push('## Checks')
  lines.push('')
  for (const item of data.checks) {
    const marker = item.status === 'passed' ? '[x]' : '[ ]'
    lines.push('- ' + marker + ' ' + item.id + ' ' + item.label + ': ' + item.evidence)
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
