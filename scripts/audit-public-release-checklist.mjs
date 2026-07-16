#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const jsonOnly = args.includes('--json')

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

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

const tmp = mkdtempSync(path.join(tmpdir(), 'gse-public-release-checklist-'))
const tmpManifest = path.join(tmp, 'release-status-manifest.json')
const tmpChecklist = path.join(tmp, 'public-release-checklist.md')
const manifestRun = exists('scripts/generate-release-status-manifest.mjs')
  ? run(process.execPath, [path.join(root, 'scripts', 'generate-release-status-manifest.mjs'), '--root', root, '--out', tmpManifest, '--force', '--json'])
  : null
const checklistRun = manifestRun?.status === 0 && exists('scripts/generate-public-release-checklist.mjs')
  ? run(process.execPath, [path.join(root, 'scripts', 'generate-public-release-checklist.mjs'), '--root', root, '--manifest', tmpManifest, '--out', tmpChecklist, '--force', '--json'])
  : null
const manifest = fs.existsSync(tmpManifest) ? parseJson(fs.readFileSync(tmpManifest, 'utf8')) : null
const checklist = fs.existsSync(tmpChecklist) ? fs.readFileSync(tmpChecklist, 'utf8') : ''
const checklistData = checklistRun ? parseJson(checklistRun.stdout) : null
const canonicalChecklist = read('.gse/acceptance/public-release-checklist.md')
rmSync(tmp, { recursive: true, force: true })

const pendingGates = manifest?.publicAcceptance?.pendingGates ?? []
const hasPendingGates = pendingGates.length > 0
const expectedAreas = pendingGates.map((gate) => gate.area)
const requiredPhases = [
  '01. Prepare the release bundle',
  '02. Publish and configure the public repository',
  '03. Approve the public security contact',
  '04. Run public CI on the release commit',
  '05. Publish the registry package',
  '06. Publish or submit marketplace listing',
  '07. Record native slash-command evidence',
  '08. Record other host runtime invocation evidence',
]
const expectedScripts = [...new Set(pendingGates
  .map((gate) => String(gate.recordCommand ?? '').match(/scripts\/([\w-]+\.mjs)/)?.[1])
  .filter(Boolean))]
const noLocalPaths = !/[A-Z]:\\|C:\\Users\\|D:\\codex\\/i.test(checklist) && !/[A-Z]:\\|C:\\Users\\|D:\\codex\\/i.test(canonicalChecklist)
const publicAcceptedStatus = manifest?.publicAcceptance?.publicAccepted ?? 'unknown'
const noFalseAcceptance = checklist.includes('Public accepted: ' + publicAcceptedStatus) &&
  checklist.includes('does not publish, approve, or accept') &&
  checklist.includes('A gate is complete only after real accepted evidence')
const commandCoverage = (hasPendingGates ? expectedScripts.every((script) => checklist.includes(script)) : true) &&
  checklist.includes('/gse release') &&
  checklist.includes('/gse release --execute --out <bundle>') &&
  checklist.includes('/gse probe')
const canonicalFresh = canonicalChecklist.includes('GSE Public Release Checklist') &&
  requiredPhases.every((phase) => canonicalChecklist.includes(phase)) &&
  (hasPendingGates ? expectedAreas.every((area) => canonicalChecklist.includes(`Gate: ${area}`)) : canonicalChecklist.includes('Public accepted: verified')) &&
  canonicalChecklist.includes(`Pending owner/external gates: ${pendingGates.length}`)

const checks = [
  check('PRC01', 'public release checklist generator exists', exists('scripts/generate-public-release-checklist.mjs'), 'scripts/generate-public-release-checklist.mjs'),
  check('PRC02', 'generator writes checklist from release status manifest', checklistRun?.status === 0 && checklistData?.status === 'written' && checklist.includes('GSE Public Release Checklist'), 'generate-public-release-checklist.mjs'),
  check('PRC03', 'checklist uses ordered public release runway phases', requiredPhases.every((phase) => checklist.includes(phase)), 'public-release-checklist.md'),
  check('PRC04', 'checklist covers every pending owner/external gate', hasPendingGates ? expectedAreas.every((area) => checklist.includes(`Gate: ${area}`)) : checklist.includes('Pending owner/external gates: 0'), 'release-status-manifest pending gates'),
  check('PRC05', 'checklist includes executable preflight and record command families', commandCoverage && (hasPendingGates ? (checklist.includes('Preflight:') && checklist.includes('Record accepted evidence:')) : checklist.includes('Final Verification')), 'public-release-checklist.md'),
  check('PRC06', 'checklist preserves public acceptance boundary', noFalseAcceptance, 'public-release-checklist.md'),
  check('PRC07', 'checklist avoids local machine paths', noLocalPaths, 'public-release-checklist.md'),
  check('PRC08', 'canonical checklist is fresh against current manifest', canonicalFresh, '.gse/acceptance/public-release-checklist.md'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: {
    status: failed === 0 ? 'passed' : 'failed',
    passed,
    failed,
    total: checks.length,
  },
  workflows: {
    publicReleaseChecklist: failed === 0 ? 'verified' : 'failed',
    publicAccepted: manifest?.publicAcceptance?.publicAccepted ?? 'unknown',
    pendingGates: pendingGates.length,
  },
  checks,
}

if (jsonOnly) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(`${report.summary.status}: ${passed}/${checks.length}`)
}

process.exit(failed === 0 ? 0 : 1)
