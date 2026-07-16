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
const tempRoot = tempRootArg ? path.resolve(tempRootArg) : fs.mkdtempSync(path.join(os.tmpdir(), 'gse-adoption-audit-'))
const target = path.join(tempRoot, 'existing-repo')
const discoveryScript = path.join(root, 'scripts', 'discover-project-profile.mjs')

function write(relativePath, content) {
  const fullPath = path.join(target, relativePath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, content.trimStart().replace(/\n/g, '\r\n'), 'utf8')
}

function runNode(script, commandArgs) {
  return spawnSync(process.execPath, [script, ...commandArgs], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
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

function setupFixture() {
  fs.rmSync(target, { recursive: true, force: true })
  fs.mkdirSync(target, { recursive: true })
  write('AGENTS.md', '# Existing Repo Rules\n\n- Prefer focused tests.\n- Do not overwrite existing project workflow files without explicit force.\n')
  write('README.md', '# Existing Repo Fixture\n\nRepresentative repository shape for GSE adoption smoke.\n')
  write('package.json', JSON.stringify({
    name: 'gse-existing-repo-fixture',
    private: true,
    scripts: { dev: 'vite', test: 'vitest run', 'test:e2e': 'playwright test', typecheck: 'tsc --noEmit', build: 'vite build' },
    dependencies: { react: '^19.0.0', vite: '^6.0.0' },
    devDependencies: { typescript: '^5.0.0', '@playwright/test': '^1.0.0', vitest: '^2.0.0', eslint: '^9.0.0' },
  }, null, 2))
  write('playwright.config.ts', 'export default {}\n')
  write('.env.example', 'PUBLIC_API_URL=https://example.invalid\n')
  write('.github/workflows/ci.yml', 'name: ci\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n')
  write('.gse/project-profile.md', '# Existing Project Profile\n\nDo not overwrite me without --force.\n')
  write('.gse/goal-map.md', '# Existing Goal Map\n\nExisting project goal map.\n')
}

if (!fs.existsSync(discoveryScript)) {
  console.error('Missing discover-project-profile.mjs at ' + discoveryScript)
  process.exit(1)
}

setupFixture()
const profilePath = path.join(target, '.gse', 'project-profile.md')
const beforeProfile = fs.readFileSync(profilePath, 'utf8')

const discovery = runNode(discoveryScript, ['--target', target, '--json'])
const model = discovery.status === 0 ? parseJson(discovery.stdout) : null
const noForceWrite = runNode(discoveryScript, ['--target', target, '--write'])
const afterNoForce = fs.readFileSync(profilePath, 'utf8')
const forceWrite = runNode(discoveryScript, ['--target', target, '--write', '--force'])
const afterForce = fs.readFileSync(profilePath, 'utf8')

const frameworks = new Set(model?.identity?.frameworks ?? [])
const toolConnections = model?.toolConnections ?? []
const statuses = new Set(toolConnections.map((item) => item.status))
const verifiedTools = toolConnections.filter((item) => item.status === 'verified')
const scriptNames = new Set((model?.scripts ?? []).map((item) => item.name))

const checks = [
  check('A01', 'controlled existing repo fixture was created', fs.existsSync(path.join(target, 'package.json')) && fs.existsSync(profilePath), 'package.json and pre-existing .gse/project-profile.md'),
  check('A02', 'discovery reads real project files', discovery.status === 0 && Boolean(model), 'discover-project-profile --json'),
  check('A03', 'discovery detects representative existing repo shape', frameworks.has('React') && frameworks.has('Vite') && frameworks.has('TypeScript') && frameworks.has('Playwright'), 'frameworks: ' + [...frameworks].join(', ')),
  check('A04', 'discovery captures focused commands from package.json', scriptNames.has('test') && scriptNames.has('test:e2e') && scriptNames.has('typecheck') && scriptNames.has('build'), 'scripts: ' + [...scriptNames].join(', ')),
  check('A05', 'tool statuses stay documented or unknown, not invented verified', statuses.has('documented') && statuses.has('unknown') && verifiedTools.length === 0, 'tool statuses: ' + [...statuses].join(', ')),
  check('A06', 'write without force refuses to overwrite existing profile', noForceWrite.status === 2 && afterNoForce === beforeProfile, 'exit ' + noForceWrite.status + '; profile unchanged'),
  check('A07', 'write with force explicitly overwrites profile', forceWrite.status === 0 && afterForce !== beforeProfile && afterForce.includes('Generated:') && afterForce.includes('Tool Connections'), 'force write exit ' + forceWrite.status),
  check('A08', 'generated profile preserves documented-not-verified warning', afterForce.includes('Tool presence from config is marked documented, not verified'), '.gse/project-profile.md known gotcha'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  tempRoot,
  target,
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    existingRepoDiscovery: checks.filter((item) => ['A02', 'A03', 'A04', 'A05'].includes(item.id)).every((item) => item.status === 'passed') ? 'verified' : 'failed',
    nonOverwriteSafety: checks.filter((item) => ['A06', 'A07'].includes(item.id)).every((item) => item.status === 'passed') ? 'verified' : 'failed',
  },
  limits: [
    'Adoption audit uses a controlled existing-repo fixture in a temporary directory, not arbitrary production repositories.',
    'Config and script presence is treated as documented unless commands are actually run.',
    'No package install, CI, browser, MCP, LSP, or external service is executed.',
  ],
  checks,
}

if (!keepTemp) fs.rmSync(tempRoot, { recursive: true, force: true })

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Existing Repo Adoption Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('Temp root: ' + data.tempRoot)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Existing repo discovery: ' + data.workflows.existingRepoDiscovery)
  lines.push('- Non-overwrite safety: ' + data.workflows.nonOverwriteSafety)
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
