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
const initScript = path.join(root, 'scripts', 'init-change.mjs')

function runNode(script, runArgs, cwd = root) {
  return spawnSync(process.execPath, [script, ...runArgs], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  })
}

function parseJson(stdout) {
  try {
    return JSON.parse(stdout)
  } catch {
    return null
  }
}

function read(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
}

function exists(filePath) {
  return fs.existsSync(filePath)
}

function check(id, label, ok, evidence, recommendation = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, recommendation }
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-change-system-'))
fs.mkdirSync(path.join(tempRoot, '.gse'), { recursive: true })
fs.writeFileSync(path.join(tempRoot, '.gse', 'goal-map.md'), '# Goal Map\n', 'utf8')
fs.writeFileSync(path.join(tempRoot, '.gse', 'state.json'), `${JSON.stringify({ schemaVersion: 1, stateRevision: 0, activeChangeId: null })}\n`, 'utf8')
fs.writeFileSync(path.join(tempRoot, '.gse', 'quality-gates.md'), '# Quality Gates\n', 'utf8')

const firstRun = runNode(initScript, ['--target', tempRoot, '--change-id', 'Add User Login!', '--level', 'enterprise', '--json'])
const first = parseJson(firstRun.stdout)
const secondRun = runNode(initScript, ['--target', tempRoot, '--change-id', 'Add User Login!', '--level', 'enterprise', '--json'])
const second = parseJson(secondRun.stdout)
const changeDir = path.join(tempRoot, '.gse', 'changes', 'add-user-login')
const requiredFiles = [
  'brief.md',
  'spec.md',
  'design.md',
  'tasks.md',
  'evidence.md',
  'review.md',
  'execution-quality-pack.md',
]
const missing = requiredFiles.filter((file) => !exists(path.join(changeDir, file)))
const spec = read(path.join(changeDir, 'spec.md'))
const design = read(path.join(changeDir, 'design.md'))
const tasks = read(path.join(changeDir, 'tasks.md'))
const evidence = read(path.join(changeDir, 'evidence.md'))
const review = read(path.join(changeDir, 'review.md'))
const executionPack = read(path.join(changeDir, 'execution-quality-pack.md'))

const checks = [
  check('CHG01', 'init-change script exists', exists(initScript), 'scripts/init-change.mjs'),
  check('CHG02', 'first run writes full change pack', firstRun.status === 0 && first?.summary?.written === requiredFiles.length && missing.length === 0, `written:${first?.summary?.written ?? 'unknown'}, missing:${missing.join(', ') || 'none'}`),
  check('CHG03', 'rerun is non-overwriting by default', secondRun.status === 0 && second?.summary?.skipped === requiredFiles.length, `skipped:${second?.summary?.skipped ?? 'unknown'}`),
  check('CHG04', 'spec includes behavior, state, recovery, privacy, acceptance, and non-goals', ['## Behavior', '## State / Data Flow', '## Error and Recovery', '## Permissions and Privacy', '## Acceptance Criteria', '## Non-goals'].every((term) => spec.includes(term)), 'spec.md'),
  check('CHG05', 'design includes contracts, rollback, alternatives, and open questions', ['## Interfaces And Contracts', '## Rollback', '## Alternatives Considered', '## Open Questions'].every((term) => design.includes(term)), 'design.md'),
  check('CHG06', 'tasks enforce verifiable slice execution', ['Locate existing patterns', 'Run focused verification', 'Record evidence'].every((term) => tasks.includes(term)), 'tasks.md'),
  check('CHG07', 'evidence preserves result/verified/accepted distinction', evidence.includes('result | verified | accepted | not ready'), 'evidence.md'),
  check('CHG08', 'review covers spec, quality, architecture, security, regression, and evidence', ['## Spec Compliance', '## Code Quality', '## Architecture / Ownership', '## Security / Privacy', '## Regression Risk', '## Evidence Review'].every((term) => review.includes(term)), 'review.md'),
  check('CHG09', 'execution pack maps skills, tools, quality gates, evidence, and closure', ['## Required Skills Or Roles', '## Tool Routing', 'Change pack', 'Role plan', '## Quality Gates Selected', '## Evidence Plan', '## Review And Closure'].every((term) => executionPack.includes(term)), 'execution-quality-pack.md'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  tempRoot,
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    changeSpecPack: failed === 0 ? 'verified' : 'failed',
    executionQualityPack: failed === 0 ? 'verified' : 'failed',
  },
  limits: [
    'This audit verifies GSE native change/spec and execution-quality pack structure in a fixture.',
    'It does not run project tests, browser smokes, host-native tools, or real target-project changes.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Change System Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Change spec pack: ' + data.workflows.changeSpecPack)
  lines.push('- Execution quality pack: ' + data.workflows.executionQualityPack)
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
