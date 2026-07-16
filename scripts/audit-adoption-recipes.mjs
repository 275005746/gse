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

function read(relativePath) {
  const fullPath = path.join(root, relativePath)
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : ''
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const recipes = read('references/adoption-recipes.md')
const skill = read('SKILL.md')
const bootstrap = read('references/project-bootstrap.md')
const packaging = read('references/packaging.md')
const examples = read('examples/README.md')

const recipeNames = ['Fresh Project Install', 'Existing Repo Adoption', 'Update Existing GSE', 'Host Adapter Adoption', 'CLI Or Package Project Adoption']
const recordFields = ['Adoption recipe:', 'Project path:', 'Mode or host:', 'Project rules read:', 'Commands run:', 'Files created or changed:', 'Preserved project-specific rules:', 'Host/tool statuses:', 'Validation evidence:', 'Evidence status:', 'Residual risk:', 'Next action:']
const commands = ['init-project.mjs', 'discover-project-profile.mjs', 'generate-command-adapter.mjs', 'audit-command-adapters.mjs', 'generate-host-adapter.mjs', 'audit-project.mjs', 'audit-adoption.mjs', 'audit-host-adapters.mjs', 'audit-fixtures.mjs', 'validate-gse.mjs']
const statusTerms = ['result', 'verified', 'accepted', 'not ready', 'unknown', 'documented', 'unavailable']

const checks = [
  check('AR01', 'adoption recipes reference exists', exists('references/adoption-recipes.md'), 'references/adoption-recipes.md'),
  check('AR02', 'SKILL routes adoption recipes', skill.includes('references/adoption-recipes.md'), 'SKILL.md Reference Routing'),
  check('AR03', 'bootstrap, packaging, and examples route to recipes', bootstrap.includes('references/adoption-recipes.md') && packaging.includes('references/adoption-recipes.md') && examples.includes('references/adoption-recipes.md'), 'project-bootstrap.md, packaging.md, examples/README.md'),
  check('AR04', 'core adoption recipes are present', recipeNames.every((item) => recipes.includes(item)), recipeNames.join(', ')),
  check('AR05', 'fresh install includes mode selection and init command', recipes.includes('--mode <mode>') && recipes.includes('node <gse-skill>/scripts/init-project.mjs --target <project-root> --mode <mode>'), 'Fresh Project Install'),
  check('AR06', 'existing repo adoption protects pre-existing project files', recipes.includes('Do not overwrite') && recipes.includes('--force') && recipes.includes('documented`, not `verified`'), 'Existing Repo Adoption'),
  check('AR07', 'update recipe preserves local decisions and validates skill package', recipes.includes('Preserve local project decisions') && recipes.includes('node <gse-skill>/scripts/validate-gse.mjs --root <gse-skill>'), 'Update Existing GSE'),
  check('AR08', 'host adapter recipe uses current command adapter path and keeps .gse source of truth', recipes.includes('Keep `.gse/` as the source of truth') && recipes.includes('generate-command-adapter.mjs') && recipes.includes('claude|codex|hermes|workbuddy|copilot|gemini|generic|all') && recipes.includes('legacy fixture helper') && recipes.includes('verified`, `documented`, `unknown`, or `unavailable`'), 'Host Adapter Adoption'),
  check('AR09', 'adoption record has required fields', recordFields.every((item) => recipes.includes(item)), recordFields.join(', ')),
  check('AR10', 'verification command list covers adoption scripts', commands.every((item) => recipes.includes(item)), commands.join(', ')),
  check('AR11', 'status vocabulary avoids overclaiming', statusTerms.every((item) => recipes.includes(item)) && recipes.includes('do not certify arbitrary production repositories'), 'status and certification boundary'),
  check('AR12', 'recipes are host-neutral and require project evidence', recipes.includes('host-neutral') && recipes.includes('project-specific evidence') && recipes.includes('unknown` until checked'), 'host-neutral project evidence rules'),
  check('AR13', 'CLI/package adoption keeps release and install claims evidence-bound', recipes.includes('CLI Or Package Project Adoption') && recipes.includes('npm pack --dry-run') && recipes.includes('registry access') && recipes.includes('global install') && recipes.includes('shell completion require project-specific evidence'), 'CLI/package adoption recipe'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { adoptionRecipes: failed === 0 ? 'verified' : 'failed' },
  limits: [
    'Adoption recipe audit verifies reusable recipe coverage and routing; it does not install GSE into arbitrary production repositories.',
    'Real adoption still needs project-specific inspection, focused smokes, and host/tool evidence.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Adoption Recipe Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Adoption recipes: ' + data.workflows.adoptionRecipes)
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
