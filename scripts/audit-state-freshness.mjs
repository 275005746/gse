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

function parseJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

function run(script, commandArgs) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...commandArgs], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    command: [process.execPath, path.join(root, 'scripts', script), ...commandArgs].join(' '),
  }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const stateText = read('.gse/state.json')
const state = parseJson(stateText)
const doctorRun = run('audit-public-acceptance-readiness.mjs', ['--root', root, '--json'])
const doctor = parseJson(doctorRun.stdout)
const pendingAreas = (doctor?.pendingGates ?? []).map((gate) => gate.area).sort()
const stateSearch = [
  state?.currentSlice?.id,
  state?.currentSlice?.outcome,
  state?.currentSlice?.status,
  state?.currentSlice?.nextAction,
  ...(state?.nextChecks ?? []),
  ...(state?.residualRisks ?? []),
].join('\n')

const staleResolvedGatePhrases = [
  'authorize GitHub workflow scope',
  'run public CI',
  'public CI remains pending',
  'public CI run remains pending',
  'public security contact remains pending',
  'public repository settings remain pending',
  'marketplace approval remains pending',
  'marketplace approval, and native slash-command proof are not verified',
  '7 pending owner/external gates',
  'public CI, marketplace approval',
]

const staleMatches = staleResolvedGatePhrases.filter((phrase) => stateSearch.includes(phrase))
const mentionsAllPending = pendingAreas.every((area) => stateSearch.includes(area) || (
  area === 'Public registry publication' && stateSearch.includes('registry publication')
) || (
  area === 'Native slash command' && stateSearch.includes('Native slash-command')
))
const registryPending = pendingAreas.includes('Public registry publication')
const registryStateMatches = registryPending
  ? state?.currentSlice?.status === 'blocked-external-auth' &&
    (stateSearch.includes('npm is not logged in') || stateSearch.includes('not yet published on npm'))
  : !stateSearch.includes('not yet published on npm') &&
    !stateSearch.includes('npm is not logged in') &&
    !stateSearch.includes('Publish @t275005746/gse to npm with an authorized token')

const checks = [
  check('STF01', 'state JSON exists and parses', Boolean(state), '.gse/state.json'),
  check('STF02', 'public acceptance doctor runs before state freshness check', doctorRun.status === 0 && doctor?.summary?.status === 'passed', doctorRun.command),
  check('STF03', 'state next action mentions every current pending final-form gate', mentionsAllPending, pendingAreas.join(', ')),
  check('STF04', 'state no longer routes users to resolved public CI/security/repository/marketplace gates', staleMatches.length === 0, staleMatches.length ? staleMatches.join('; ') : '.gse/state.json'),
  check(
    'STF05',
    'state matches current registry publication gate status',
    registryStateMatches,
    '.gse/state.json',
  ),
  check('STF06', 'state points users to current doctor as source of truth', stateSearch.includes('/gse doctor') || stateSearch.includes('audit-public-acceptance-readiness.mjs'), '.gse/state.json'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    stateFreshness: failed === 0 ? 'verified' : 'failed',
    pendingGates: pendingAreas,
  },
  limits: [
    'This audit checks the machine-readable GSE state summary against the current public acceptance doctor.',
    'It does not publish to npm or prove native slash-command support.',
  ],
  checks,
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))

if (failed > 0) process.exit(1)
