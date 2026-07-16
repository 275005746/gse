#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const target = path.resolve(readArg('--target', process.cwd()))
const write = args.includes('--write')
const force = args.includes('--force')
const json = args.includes('--json')
const profilePath = path.join(target, '.gse', 'project-profile.md')

function exists(relativePath) {
  return fs.existsSync(path.join(target, relativePath))
}

function readText(relativePath) {
  const filePath = path.join(target, relativePath)
  if (!fs.existsSync(filePath)) return null
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

function listExisting(paths) {
  return paths.filter((item) => exists(item))
}

function detectPackageManager() {
  if (exists('pnpm-lock.yaml')) return 'pnpm'
  if (exists('bun.lockb') || exists('bun.lock')) return 'bun'
  if (exists('yarn.lock')) return 'yarn'
  if (exists('package-lock.json')) return 'npm'
  if (exists('package.json')) return 'npm or project-specific'
  return ''
}

function detectFrameworks(pkg) {
  if (!pkg) return []
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
  const frameworks = []
  const checks = [
    ['next', 'Next.js'],
    ['react', 'React'],
    ['vite', 'Vite'],
    ['vue', 'Vue'],
    ['svelte', 'Svelte'],
    ['typescript', 'TypeScript'],
    ['playwright', 'Playwright'],
    ['@playwright/test', 'Playwright'],
    ['vitest', 'Vitest'],
    ['jest', 'Jest'],
    ['eslint', 'ESLint'],
    ['prettier', 'Prettier'],
  ]
  for (const [dep, label] of checks) {
    if (deps[dep] && !frameworks.includes(label)) frameworks.push(label)
  }
  return frameworks
}

function detectScripts(pkg) {
  const scripts = pkg?.scripts ?? {}
  const wanted = ['install', 'dev', 'start', 'test', 'test:unit', 'test:e2e', 'lint', 'typecheck', 'check', 'build', 'format']
  const names = new Set(wanted.filter((name) => scripts[name]))
  for (const name of Object.keys(scripts)) {
    if (/^(smoke|evidence|replay|eval|release|deploy|publish|electron):/.test(name)) names.add(name)
  }
  return [...names]
    .filter((name) => scripts[name])
    .map((name) => ({ name, command: scripts[name] }))
}

function detectWorkflows() {
  const dir = path.join(target, '.github', 'workflows')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((name) => /\.ya?ml$/i.test(name)).map((name) => `.github/workflows/${name}`)
}

function detectMcpFiles() {
  return listExisting([
    '.mcp.json',
    'mcp.json',
    '.cursor/mcp.json',
    '.claude/mcp.json',
    '.codex/mcp.json',
  ])
}

function detectAgentRules() {
  return listExisting([
    'AGENTS.md',
    'CLAUDE.md',
    'GEMINI.md',
    'CONTEXT.md',
    'CONTEXT-MAP.md',
    '.cursorrules',
    '.windsurfrules',
  ])
}

function detectDocs() {
  return listExisting([
    'README.md',
    'CONTRIBUTING.md',
    'CODING_STANDARDS.md',
    'SECURITY.md',
    'CHANGELOG.md',
    'docs/adr',
    'docs/architecture.md',
  ])
}

function detectConfigFiles() {
  return listExisting([
    'package.json',
    'tsconfig.json',
    'Makefile',
    'justfile',
    'pyproject.toml',
    'Cargo.toml',
    'go.mod',
    'playwright.config.ts',
    'playwright.config.js',
    'vite.config.ts',
    'vite.config.js',
    'next.config.js',
    'eslint.config.js',
    'eslint.config.mjs',
    '.prettierrc',
    '.pre-commit-config.yaml',
    '.env.example',
  ])
}

function inferRepoType(pkg, configs) {
  if (pkg) return 'JavaScript/TypeScript package or web app'
  if (configs.includes('pyproject.toml')) return 'Python project'
  if (configs.includes('Cargo.toml')) return 'Rust project'
  if (configs.includes('go.mod')) return 'Go project'
  return 'unknown'
}

function table(rows) {
  if (rows.length === 0) return '| Item | Value | Status | Evidence |\n|---|---|---|---|\n| - | - | unknown | - |'
  return ['| Item | Value | Status | Evidence |', '|---|---|---|---|', ...rows.map((row) => `| ${row.item} | ${row.value} | ${row.status} | ${row.evidence} |`)].join('\n')
}

function renderMarkdown(model) {
  const scriptLines = model.scripts.length
    ? model.scripts.map((item) => `- ${item.name}: \`${item.command}\` (documented in package.json)`).join('\n')
    : '- No package scripts detected.'

  const toolRows = [
    ...model.toolConnections.map((item) => ({
      item: item.tool,
      value: item.purpose,
      status: item.status,
      evidence: item.evidence,
    })),
  ]

  return `# Project Profile

Generated: ${model.generatedAt}

Keep this file short and factual. Project-specific rules override generic GSE defaults.

## Identity

- Product/system name: ${model.identity.name}
- Repository type: ${model.identity.repoType}
- Main languages/frameworks: ${model.identity.frameworks.length ? model.identity.frameworks.join(', ') : 'unknown'}
- Package manager: ${model.identity.packageManager || 'unknown'}

## Evidence Sources

- Agent rules: ${model.sources.agentRules.length ? model.sources.agentRules.join(', ') : '-'}
- Docs: ${model.sources.docs.length ? model.sources.docs.join(', ') : '-'}
- Config files: ${model.sources.configFiles.length ? model.sources.configFiles.join(', ') : '-'}
- CI workflows: ${model.sources.workflows.length ? model.sources.workflows.join(', ') : '-'}

## Development Commands

${scriptLines}

## Standards

- Coding standards: ${model.sources.docs.includes('CODING_STANDARDS.md') ? 'documented in CODING_STANDARDS.md' : 'unknown'}
- Formatting: ${model.formatting.length ? model.formatting.join(', ') : 'unknown'}
- Testing expectations: ${model.testing.length ? model.testing.join(', ') : 'unknown'}
- Documentation expectations: ${model.sources.docs.includes('CONTRIBUTING.md') ? 'documented in CONTRIBUTING.md' : 'unknown'}

## Tool Connections

${table(toolRows)}

## Agent Host Adapters

- Codex: ${model.sources.agentRules.includes('AGENTS.md') ? 'documented via AGENTS.md' : 'unknown'}
- Claude Code: ${model.sources.agentRules.includes('CLAUDE.md') || exists('.claude') ? 'documented' : 'unknown'}
- Hermes/AION-style runtime: unknown
- WorkBuddy/other: unknown

## Security And Permissions

- Secrets handling: ${model.sources.configFiles.includes('.env.example') ? 'documented by .env.example presence; real secrets not inspected' : 'unknown'}
- Write-capable tools: unknown
- Destructive commands: unknown
- External services: ${model.externalServices.length ? model.externalServices.join(', ') : 'unknown'}

## Release And Rollback

- Release command/process: ${model.release.length ? model.release.join(', ') : 'unknown'}
- Rollback: unknown
- Smoke checks: ${model.smoke.length ? model.smoke.join(', ') : 'unknown'}

## Known Gotchas

- Tool presence from config is marked documented, not verified. Run focused commands before relying on any tool.
`
}

const pkg = safeJson('package.json')
const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) }
const configs = detectConfigFiles()
const workflows = detectWorkflows()
const scripts = detectScripts(pkg)
const frameworks = detectFrameworks(pkg)
const mcpFiles = detectMcpFiles()
const agentRules = detectAgentRules()
const docs = detectDocs()

const formatting = []
if (configs.some((item) => item.includes('prettier'))) formatting.push('Prettier documented by config')
if (configs.some((item) => item.includes('eslint'))) formatting.push('ESLint documented by config')

const testing = []
for (const script of scripts) {
  if (script.name.includes('test')) testing.push(`${script.name} script documented`)
}
if (configs.some((item) => item.startsWith('playwright.config'))) testing.push('Playwright config documented')

const toolConnections = []
if (mcpFiles.length) toolConnections.push({ tool: 'MCP', purpose: 'External tool/data connections', status: 'documented', evidence: mcpFiles.join(', ') })
else toolConnections.push({ tool: 'MCP', purpose: 'External tool/data connections', status: 'unknown', evidence: '-' })
const playwrightEvidence = []
if (deps.playwright || deps['@playwright/test']) playwrightEvidence.push('package.json dependency')
if (scripts.some((item) => item.name.includes('smoke') && /browser|ui|playwright/i.test(item.command + ' ' + item.name))) playwrightEvidence.push('package.json smoke script')
if (configs.some((item) => item.startsWith('playwright.config'))) playwrightEvidence.push(configs.filter((item) => item.startsWith('playwright.config')).join(', '))
if (playwrightEvidence.length) toolConnections.push({ tool: 'Browser/Playwright', purpose: 'UI smoke and browser automation', status: 'documented', evidence: playwrightEvidence.join(', ') })
else toolConnections.push({ tool: 'Browser/Playwright', purpose: 'UI smoke and browser automation', status: 'unknown', evidence: '-' })
if (workflows.length) toolConnections.push({ tool: 'CI', purpose: 'Automated gates', status: 'documented', evidence: workflows.join(', ') })
else toolConnections.push({ tool: 'CI', purpose: 'Automated gates', status: 'unknown', evidence: '-' })
toolConnections.push({ tool: 'LSP/index', purpose: 'Symbol navigation', status: 'unknown', evidence: '-' })

const release = scripts.filter((item) => /release|deploy|publish/i.test(item.name)).map((item) => `${item.name}: ${item.command}`)
const smoke = scripts.filter((item) => /smoke|check|test:e2e/i.test(item.name)).map((item) => `${item.name}: ${item.command}`)
const externalServices = []
if (configs.includes('.env.example')) externalServices.push('.env.example present')

const model = {
  target,
  generatedAt: new Date().toISOString(),
  identity: {
    name: pkg?.name ?? path.basename(target),
    repoType: inferRepoType(pkg, configs),
    frameworks,
    packageManager: detectPackageManager(),
  },
  sources: { agentRules, docs, configFiles: configs, workflows },
  scripts,
  formatting,
  testing,
  toolConnections,
  release,
  smoke,
  externalServices,
}

const markdown = renderMarkdown(model)

if (write) {
  fs.mkdirSync(path.dirname(profilePath), { recursive: true })
  if (!force && fs.existsSync(profilePath)) {
    console.error(`Refusing to overwrite existing ${profilePath}. Pass --force to overwrite.`)
    process.exit(2)
  }
  fs.writeFileSync(profilePath, markdown, 'utf8')
}

if (json) console.log(JSON.stringify(model, null, 2))
else console.log(markdown)
