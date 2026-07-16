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
const baseTemp = tempRootArg ? path.resolve(tempRootArg) : fs.mkdtempSync(path.join(os.tmpdir(), 'gse-project-audit-'))
const initScript = path.join(root, 'scripts', 'init-project.mjs')

const commonFiles = [
  '.gse/README.md',
  '.gse/state.json',
  '.gse/project-profile.md',
  '.gse/goal-map.md',
  '.gse/quality-gates.md',
  '.gse/project-guards.md',
  '.gse/tooling.md',
  '.gse/host-capabilities.md',
  '.gse/learnings.md',
  '.gse/evidence/index.jsonl',
  '.gse/goals/README.md',
  '.gse/templates/change-brief.md',
  '.gse/templates/spec.md',
  '.gse/templates/design.md',
  '.gse/templates/tasks.md',
  '.gse/templates/evidence.md',
  '.gse/templates/review.md',
  '.gse/templates/execution-quality-pack.md',
]

const standardFiles = [
  '.gse/agent-workspace.md',
  '.gse/agents/roles.md',
  '.gse/agents/dispatch.md',
  '.gse/agents/role-fallback-packets.md',
  '.gse/skills/README.md',
  '.gse/lsp/README.md',
]

const enterpriseFiles = [
  '.gse/hooks/README.md',
  '.gse/mcp/README.md',
  '.gse/plugins/README.md',
  '.gse/release.md',
  '.gse/incident-review.md',
  '.gse/audit.md',
]

const modeExpectations = {
  lite: {
    files: commonFiles,
    dirs: ['.gse/changes', '.gse/evidence', '.gse/templates', '.gse/goals'],
  },
  standard: {
    files: [...commonFiles, ...standardFiles],
    dirs: ['.gse/changes', '.gse/evidence', '.gse/templates', '.gse/goals', '.gse/agents', '.gse/skills', '.gse/lsp'],
  },
  enterprise: {
    files: [...commonFiles, ...standardFiles, ...enterpriseFiles],
    dirs: [
      '.gse/changes',
      '.gse/evidence',
      '.gse/templates',
      '.gse/goals',
      '.gse/agents',
      '.gse/skills',
      '.gse/lsp',
      '.gse/hooks',
      '.gse/mcp',
      '.gse/plugins',
    ],
  },
}

const autoExpectations = [
  {
    name: 'empty-project',
    expectedMode: 'lite',
    setup(target) {
      fs.mkdirSync(target, { recursive: true })
    },
  },
  {
    name: 'standard-app',
    expectedMode: 'standard',
    setup(target) {
      fs.mkdirSync(target, { recursive: true })
      fs.writeFileSync(path.join(target, 'README.md'), '# Standard App\n', 'utf8')
      fs.writeFileSync(
        path.join(target, 'package.json'),
        JSON.stringify({ scripts: { test: 'vitest run', build: 'vite build' }, devDependencies: { typescript: '^5.0.0', vitest: '^2.0.0' } }, null, 2),
        'utf8',
      )
      fs.writeFileSync(path.join(target, 'tsconfig.json'), '{}\n', 'utf8')
    },
  },
  {
    name: 'enterprise-agent-runtime',
    expectedMode: 'enterprise',
    setup(target) {
      fs.mkdirSync(path.join(target, '.claude'), { recursive: true })
      fs.mkdirSync(path.join(target, '.codex'), { recursive: true })
      fs.writeFileSync(path.join(target, '.mcp.json'), '{}\n', 'utf8')
      fs.writeFileSync(
        path.join(target, 'package.json'),
        JSON.stringify({ scripts: { test: 'vitest run', release: 'node release.mjs' } }, null, 2),
        'utf8',
      )
    },
  },
]

function runNode(script, runArgs) {
  return spawnSync(process.execPath, [script, ...runArgs], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
}

function readJsonFromRun(run) {
  if (run.status !== 0) return null
  try {
    return JSON.parse(run.stdout)
  } catch {
    return null
  }
}

function fileStatus(target, relativePath) {
  const fullPath = path.join(target, relativePath)
  if (!fs.existsSync(fullPath)) return 'missing'
  return fs.statSync(fullPath).isFile() ? 'present' : 'not-file'
}

function dirStatus(target, relativePath) {
  const fullPath = path.join(target, relativePath)
  if (!fs.existsSync(fullPath)) return 'missing'
  return fs.statSync(fullPath).isDirectory() ? 'present' : 'not-dir'
}

function collectSignatures(target, relativePaths) {
  const signatures = new Map()
  for (const relativePath of relativePaths) {
    const fullPath = path.join(target, relativePath)
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) continue
    const stat = fs.statSync(fullPath)
    const text = fs.readFileSync(fullPath, 'utf8')
    signatures.set(relativePath, { size: stat.size, text })
  }
  return signatures
}

function compareSignatures(before, after) {
  const changed = []
  for (const [relativePath, signature] of before.entries()) {
    const next = after.get(relativePath)
    if (!next || next.size !== signature.size || next.text !== signature.text) changed.push(relativePath)
  }
  return changed
}

function auditMode(mode, tempRoot) {
  const target = path.join(tempRoot, mode)
  fs.mkdirSync(target, { recursive: true })
  const expectation = modeExpectations[mode]
  const firstRun = runNode(initScript, ['--target', target, '--mode', mode])
  const firstJson = readJsonFromRun(firstRun)
  const fileChecks = expectation.files.map((relativePath) => ({ relativePath, status: fileStatus(target, relativePath) }))
  const dirChecks = expectation.dirs.map((relativePath) => ({ relativePath, status: dirStatus(target, relativePath) }))
  const before = collectSignatures(target, expectation.files)
  const secondRun = runNode(initScript, ['--target', target, '--mode', mode])
  const secondJson = readJsonFromRun(secondRun)
  const after = collectSignatures(target, expectation.files)
  const changedOnRerun = compareSignatures(before, after)
  const writtenCount = firstJson?.results?.filter((item) => item.status === 'written').length ?? 0
  const skippedCount = secondJson?.results?.filter((item) => item.status === 'skipped').length ?? 0
  const expectedWrites = expectation.files.length + 1
  const ok =
    firstRun.status === 0 &&
    secondRun.status === 0 &&
    firstJson &&
    secondJson &&
    fileChecks.every((item) => item.status === 'present') &&
    dirChecks.every((item) => item.status === 'present') &&
    writtenCount === expectedWrites &&
    skippedCount === expectedWrites &&
    changedOnRerun.length === 0
  return {
    mode,
    target,
    status: ok ? 'passed' : 'failed',
    firstRun: { status: firstRun.status, stderr: firstRun.stderr.trim(), writtenCount, expectedWrites },
    secondRun: { status: secondRun.status, stderr: secondRun.stderr.trim(), skippedCount, expectedSkips: expectedWrites },
    fileChecks,
    dirChecks,
    changedOnRerun,
  }
}

function auditAuto(item, tempRoot) {
  const target = path.join(tempRoot, 'auto-' + item.name)
  fs.rmSync(target, { recursive: true, force: true })
  item.setup(target)
  const run = runNode(initScript, ['--target', target, '--mode', 'auto'])
  const model = readJsonFromRun(run)
  const expectation = modeExpectations[item.expectedMode]
  const fileChecks = expectation.files.map((relativePath) => ({ relativePath, status: fileStatus(target, relativePath) }))
  const dirChecks = expectation.dirs.map((relativePath) => ({ relativePath, status: dirStatus(target, relativePath) }))
  const ok =
    run.status === 0 &&
    model?.requestedMode === 'auto' &&
    model?.mode === item.expectedMode &&
    Array.isArray(model?.selectionReasons) &&
    model.selectionReasons.length > 0 &&
    fileChecks.every((check) => check.status === 'present') &&
    dirChecks.every((check) => check.status === 'present') &&
    (item.expectedMode !== 'enterprise' || (fileStatus(target, '.codex/gse-adapter.md') === 'present' && fileStatus(target, '.claude/gse-adapter.md') === 'present'))
  return {
    name: item.name,
    target,
    expectedMode: item.expectedMode,
    detectedMode: model?.mode ?? null,
    selectionReasons: model?.selectionReasons ?? [],
    status: ok ? 'passed' : 'failed',
    run: { status: run.status, stderr: run.stderr.trim() },
    fileChecks,
    dirChecks,
    hostAdapterChecks:
      item.expectedMode === 'enterprise'
        ? [
            { relativePath: '.codex/gse-adapter.md', status: fileStatus(target, '.codex/gse-adapter.md') },
            { relativePath: '.claude/gse-adapter.md', status: fileStatus(target, '.claude/gse-adapter.md') },
          ]
        : [],
  }
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Project Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('Temp root: ' + data.tempRoot)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Modes: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Bootstrap scaffold: ' + data.workflows.bootstrapScaffold)
  lines.push('- Rerun safety: ' + data.workflows.rerunSafety)
  lines.push('- Auto mode selection: ' + data.workflows.autoModeSelection)
  lines.push('')
  lines.push('## Modes')
  lines.push('')
  for (const item of data.modes) {
    const marker = item.status === 'passed' ? '[x]' : '[ ]'
    lines.push('- ' + marker + ' ' + item.mode + ': files ' + item.fileChecks.filter((check) => check.status === 'present').length + '/' + item.fileChecks.length + ', dirs ' + item.dirChecks.filter((check) => check.status === 'present').length + '/' + item.dirChecks.length + ', skipped on rerun ' + item.secondRun.skippedCount + '/' + item.secondRun.expectedSkips)
    if (item.changedOnRerun.length) lines.push('  - Changed on rerun: ' + item.changedOnRerun.join(', '))
  }
  lines.push('')
  lines.push('## Auto Mode')
  lines.push('')
  for (const item of data.autoModes) {
    const marker = item.status === 'passed' ? '[x]' : '[ ]'
    const hostAdapters = item.hostAdapterChecks?.length ? ', host adapters ' + item.hostAdapterChecks.filter((check) => check.status === 'present').length + '/' + item.hostAdapterChecks.length : ''
    lines.push('- ' + marker + ' ' + item.name + ': expected ' + item.expectedMode + ', detected ' + item.detectedMode + ', reasons ' + item.selectionReasons.join(', ') + hostAdapters)
  }
  lines.push('')
  lines.push('## Limits')
  lines.push('')
  for (const item of data.limits) lines.push('- ' + item)
  return lines.join('\n') + '\n'
}

if (!fs.existsSync(initScript)) {
  console.error('Missing init-project.mjs at ' + initScript)
  process.exit(1)
}

fs.rmSync(baseTemp, { recursive: true, force: true })
fs.mkdirSync(baseTemp, { recursive: true })

const modes = Object.keys(modeExpectations).map((mode) => auditMode(mode, baseTemp))
const autoModes = autoExpectations.map((item) => auditAuto(item, baseTemp))
const passed = modes.filter((item) => item.status === 'passed').length
const autoPassed = autoModes.filter((item) => item.status === 'passed').length
const failed = modes.length - passed + (autoModes.length - autoPassed)
const report = {
  root,
  generatedAt: new Date().toISOString(),
  tempRoot: baseTemp,
  summary: { passed: passed + autoPassed, failed, total: modes.length + autoModes.length, status: failed === 0 ? 'passed' : 'failed' },
  workflows: {
    bootstrapScaffold: modes.every((item) => item.fileChecks.every((check) => check.status === 'present') && item.dirChecks.every((check) => check.status === 'present')) ? 'verified' : 'failed',
    rerunSafety: modes.every((item) => item.changedOnRerun.length === 0 && item.secondRun.skippedCount === item.secondRun.expectedSkips) ? 'verified' : 'failed',
    autoModeSelection: autoModes.every((item) => item.status === 'passed') ? 'verified' : 'failed',
  },
  limits: [
    'Project audit uses temporary directories and generated scaffolds, not arbitrary real repositories.',
    'Project audit verifies init-project scaffold and rerun safety, not tool installation, CI, package install, or fresh-session acceptance.',
    'Use discover-project-profile and focused project checks separately for real existing repo adoption.',
  ],
  modes,
  autoModes,
}

if (!keepTemp) fs.rmSync(baseTemp, { recursive: true, force: true })

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(renderMarkdown(report))

if (failed > 0) process.exit(1)
