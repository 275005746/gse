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
const keepTemp = args.includes('--keep-temp')
const tempRootArg = readArg('--temp-root', null)
const tempRoot = tempRootArg ? path.resolve(tempRootArg) : fs.mkdtempSync(path.join(os.tmpdir(), 'gse-host-adapter-audit-'))
const target = path.join(tempRoot, 'project')
const generator = path.join(root, 'scripts', 'generate-host-adapter.mjs')

function runNode(script, commandArgs) {
  return spawnSync(process.execPath, [script, ...commandArgs], { cwd: root, encoding: 'utf8', windowsHide: true })
}

function parseJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function read(relativePath) {
  const fullPath = path.join(target, relativePath)
  if (!fs.existsSync(fullPath)) return ''
  return fs.readFileSync(fullPath, 'utf8')
}

fs.rmSync(target, { recursive: true, force: true })
fs.mkdirSync(path.join(target, '.gse'), { recursive: true })
fs.writeFileSync(path.join(target, '.gse', 'project-profile.md'), '# Project Profile\n', 'utf8')
fs.writeFileSync(path.join(target, '.gse', 'goal-map.md'), '# Goal Map\nSECRET_GOAL_COPY_SENTINEL\n', 'utf8')
fs.writeFileSync(path.join(target, '.gse', 'quality-gates.md'), '# Quality Gates\nSECRET_GATE_COPY_SENTINEL\n', 'utf8')

const first = runNode(generator, ['--target', target, '--host', 'all', '--json'])
const firstJson = parseJson(first.stdout)
const codexText = read(path.join('.codex', 'gse-adapter.md'))
const claudeText = read(path.join('.claude', 'gse-adapter.md'))
const second = runNode(generator, ['--target', target, '--host', 'all', '--json'])
const secondJson = parseJson(second.stdout)
const beforeForce = codexText
const force = runNode(generator, ['--target', target, '--host', 'codex', '--force', '--json'])
const forceJson = parseJson(force.stdout)
const afterForce = read(path.join('.codex', 'gse-adapter.md'))

const adapterTexts = [codexText, claudeText, afterForce]
const checks = [
  check('H01', 'generator exists', fs.existsSync(generator), 'scripts/generate-host-adapter.mjs'),
  check('H02', 'first run writes Codex and Claude adapters', first.status === 0 && firstJson?.results?.filter((item) => item.status === 'written').length === 2, 'first run written count'),
  check('H03', 'adapters point to .gse source of truth', codexText.includes('Source of truth: `.gse/`.') && claudeText.includes('Source of truth: `.gse/`.'), '.codex and .claude adapter text'),
  check('H04', 'adapters include status vocabulary', adapterTexts.every((text) => text.includes('`verified`, `documented`, `unknown`, `unavailable`')), 'status vocabulary'),
  check('H05', 'adapters do not copy portable goal map or quality gates', !adapterTexts.some((text) => text.includes('SECRET_GOAL_COPY_SENTINEL') || text.includes('SECRET_GATE_COPY_SENTINEL')), 'sentinel text absent'),
  check('H06', 'second run skips existing adapters without force', second.status === 0 && secondJson?.results?.every((item) => item.status === 'skipped'), 'second run skipped'),
  check('H07', 'force run explicitly rewrites selected adapter', force.status === 0 && forceJson?.results?.[0]?.status === 'written' && afterForce === beforeForce, 'force rewrite stable content'),
  check('H08', 'unsupported host fails clearly', runNode(generator, ['--target', target, '--host', 'unsupported']).status === 1, 'unsupported host exit 1'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  tempRoot,
  target,
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { hostAdapterGeneration: failed === 0 ? 'verified' : 'failed' },
  limits: [
    'Host adapter audit verifies generated pointer files, not host runtime capabilities.',
    'Codex and Claude adapter shapes are covered; other host families remain compatibility-matrix guidance until project evidence exists.',
    'Generated adapters intentionally point back to .gse/ instead of copying portable policy.',
  ],
  checks,
}

if (!keepTemp) fs.rmSync(tempRoot, { recursive: true, force: true })

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Host Adapter Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('Temp root: ' + data.tempRoot)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Host adapter generation: ' + data.workflows.hostAdapterGeneration)
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
