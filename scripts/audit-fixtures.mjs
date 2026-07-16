#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

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

function readText(relativePath) {
  const filePath = path.join(root, relativePath)
  if (!fs.existsSync(filePath)) return ''
  return fs.readFileSync(filePath, 'utf8')
}

function safeJson(relativePath) {
  const text = readText(relativePath)
  if (!text) return null
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
}

function detectSmallAppProfile() {
  const base = 'examples/small-app'
  const pkg = safeJson(base + '/package.json')
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) }
  const scripts = pkg?.scripts ?? {}
  const frameworks = []
  const checks = [
    ['react', 'React'],
    ['vite', 'Vite'],
    ['typescript', 'TypeScript'],
    ['@playwright/test', 'Playwright'],
    ['vitest', 'Vitest'],
    ['eslint', 'ESLint'],
    ['prettier', 'Prettier'],
  ]
  for (const [dep, label] of checks) {
    if (deps[dep]) frameworks.push(label)
  }
  const configFiles = [
    base + '/package.json',
    base + '/playwright.config.ts',
    base + '/.env.example',
    base + '/.github/workflows/ci.yml',
    base + '/AGENTS.md',
  ].filter(exists)
  return { pkg, frameworks, scripts, configFiles }
}

function detectCliToolProfile() {
  const base = 'examples/cli-tool'
  const pkg = safeJson(base + '/package.json')
  const scripts = pkg?.scripts ?? {}
  const configFiles = [
    base + '/package.json',
    base + '/AGENTS.md',
    base + '/.gse/project-profile.md',
  ].filter(exists)
  return { pkg, scripts, configFiles }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const small = detectSmallAppProfile()
const cli = detectCliToolProfile()
const runtimeProfile = readText('examples/agent-runtime-host/.gse/project-profile.md')
const codexAdapter = readText('examples/agent-runtime-host/.codex/gse-adapter.md')
const claudeAdapter = readText('examples/agent-runtime-host/.claude/gse-adapter.md')
const runtimeTooling = readText('examples/agent-runtime-host/.gse/tooling.md')
const modelRouting = readText('examples/agent-runtime-host/docs/model-routing.md')

const checks = [
  check('F01', 'examples root exists', exists('examples/README.md'), 'examples/README.md'),
  check('F02', 'small-app fixture exists', exists('examples/small-app/README.md') && exists('examples/small-app/package.json'), 'examples/small-app/README.md, package.json'),
  check('F03', 'small-app profile discovery signals are present', small.frameworks.includes('React') && small.frameworks.includes('Vite') && small.frameworks.includes('TypeScript') && small.frameworks.includes('Playwright'), 'frameworks: ' + small.frameworks.join(', ')),
  check('F04', 'small-app commands and evidence sources are documented', Boolean(small.scripts.test && small.scripts['test:e2e'] && small.scripts.typecheck && small.configFiles.length >= 5), 'scripts: ' + Object.keys(small.scripts).join(', ') + '; config files: ' + small.configFiles.join(', ')),
  check('F05', 'cli-tool fixture exists', exists('examples/cli-tool/README.md') && exists('examples/cli-tool/package.json') && exists('examples/cli-tool/.gse/project-profile.md'), 'examples/cli-tool README, package.json, project-profile.md'),
  check('F06', 'cli-tool package adoption signals are documented', Boolean(cli.pkg?.bin?.['gse-fixture'] && cli.scripts.smoke && cli.scripts['release:dry-run'] && cli.scripts.typecheck && cli.scripts.lint), 'bin and scripts: ' + Object.keys(cli.scripts).join(', ')),
  check('F07', 'cli-tool profile keeps package capabilities evidence-bound', readText('examples/cli-tool/.gse/project-profile.md').includes('documented') && readText('examples/cli-tool/.gse/project-profile.md').includes('unknown') && readText('examples/cli-tool/.gse/project-profile.md').includes('npm pack --dry-run'), 'examples/cli-tool/.gse/project-profile.md'),
  check('F08', 'cli-tool is listed in examples routing', readText('examples/README.md').includes('cli-tool') && readText('examples/README.md').includes('package adoption'), 'examples/README.md'),
  check('F09', 'agent-runtime-host fixture exists', exists('examples/agent-runtime-host/README.md') && exists('examples/agent-runtime-host/.gse/project-profile.md'), 'examples/agent-runtime-host/README.md, .gse/project-profile.md'),
  check('F10', 'host adapters point back to .gse source of truth', codexAdapter.includes('Source of truth: `.gse/`.') && claudeAdapter.includes('Source of truth: `.gse/`.'), '.codex/gse-adapter.md, .claude/gse-adapter.md'),
  check('F11', 'host adapter fixture separates verified and unknown capability claims', runtimeProfile.includes('documented') && runtimeProfile.includes('unknown') && runtimeTooling.includes('not verified'), '.gse/project-profile.md and .gse/tooling.md status vocabulary'),
  check('F12', 'drift audit and model routing signals are present', codexAdapter.includes('references/drift-audit.md') && modelRouting.includes('provider support from docs alone'), 'Codex adapter drift pointer and docs/model-routing.md'),
  check('F13', 'fixture safety rules avoid secrets and bulky artifacts', readText('examples/README.md').includes('No secrets') && readText('examples/README.md').includes('No lockfiles, caches, screenshots'), 'examples/README.md safety rules'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { passed, failed, total: checks.length, status: failed === 0 ? 'passed' : 'failed' },
  workflows: {
    projectProfileDiscovery: checks.filter((item) => ['F02', 'F03', 'F04'].includes(item.id)).every((item) => item.status === 'passed') ? 'verified' : 'failed',
    cliPackageAdoption: checks.filter((item) => ['F05', 'F06', 'F07', 'F08'].includes(item.id)).every((item) => item.status === 'passed') ? 'verified' : 'failed',
    hostAdapterAndDrift: checks.filter((item) => ['F09', 'F10', 'F11', 'F12'].includes(item.id)).every((item) => item.status === 'passed') ? 'verified' : 'failed',
  },
  limits: [
    'Fixture audit uses controlled example project shapes, not broad real repositories.',
    'Fixture audit does not claim fresh-session acceptance.',
    'Config presence is treated as documented unless a command is actually run.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Fixture Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Project profile discovery: ' + data.workflows.projectProfileDiscovery)
  lines.push('- CLI package adoption: ' + data.workflows.cliPackageAdoption)
  lines.push('- Host adapter and drift: ' + data.workflows.hostAdapterAndDrift)
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
