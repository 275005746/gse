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
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function readJson(relativePath) {
  try {
    return JSON.parse(read(relativePath))
  } catch {
    return null
  }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const listingText = read('assets/marketplace/gse-listing.json')
const listing = readJson('assets/marketplace/gse-listing.json')
const marketplaceRef = read('references/marketplace-discovery.md')
const packaging = read('references/packaging.md')
const openai = read('agents/openai.yaml')
const validate = read('scripts/validate-gse.mjs')

const keywords = new Set(Array.isArray(listing?.keywords) ? listing.keywords : [])
const categories = new Set(Array.isArray(listing?.categories) ? listing.categories : [])
const entrypoints = new Set(Array.isArray(listing?.entrypoints) ? listing.entrypoints : [])
const verification = Array.isArray(listing?.verification) ? listing.verification : []
const hostSupport = Array.isArray(listing?.hostSupport) ? listing.hostSupport : []
const boundaries = Array.isArray(listing?.boundaries) ? listing.boundaries.join('\n') : ''
const privateLeakPattern = new RegExp(
  [
    ['C:', 'Users', 'Admin'].join('[\\\\\\\\/]'),
    ['D:', 'codex'].join('[\\\\\\\\/]'),
    ['hermes', 'workspace'].join('[-_]'),
    ['node', 'banana'].join('[-_]'),
  ].join('|'),
  'i',
)
const noPrivateOrLocalLeak =
  !privateLeakPattern.test(listingText) &&
  !privateLeakPattern.test(marketplaceRef)

const checks = [
  check('MD01', 'marketplace listing metadata exists and parses', Boolean(listing), 'assets/marketplace/gse-listing.json'),
  check('MD02', 'listing has searchable identity and summary', listing?.name === 'gse' && listing?.displayName === 'GSE' && typeof listing?.tagline === 'string' && listing.tagline.length > 20 && typeof listing?.summary === 'string' && listing.summary.includes('AI coding agents') && listing.summary.includes('functional Slices'), 'name, displayName, tagline, summary'),
  check('MD03', 'listing uses natural ecosystem keywords', ['agent workflow engineering', 'goal-spec workflow', 'SDD', 'AI coding agent workflow', 'evidence gates', 'goal map'].every((item) => keywords.has(item)), 'keywords'),
  check('MD04', 'listing classifies the Agent Skill without unverified inclusion claims', categories.has('agent workflow engineering') && categories.has('software development workflow') && marketplaceRef.includes('external-required') && marketplaceRef.includes('real public URL') && marketplaceRef.includes('local marketplace audit is a metadata check'), 'categories and discovery reference'),
  check('MD05', 'listing exposes human and machine entrypoints', ['SKILL.md', 'README.md', 'README.zh-CN.md', 'scripts/run-gse-command.mjs', 'scripts/validate-gse.mjs'].every((item) => entrypoints.has(item)), 'entrypoints'),
  check('MD06', 'listing exposes validation commands', verification.some((item) => item.includes('validate-gse.mjs')) && verification.some((item) => item.includes('audit-marketplace-discovery.mjs')) && verification.some((item) => item.includes('audit-host-ui-invocation.mjs')), 'verification commands'),
  check('MD07', 'listing separates host support status from proof', hostSupport.some((item) => item.host.includes('Codex') && item.status === 'documented') && hostSupport.some((item) => item.host.includes('Claude') && item.status === 'documented') && boundaries.includes('native host UI invocation require separate evidence'), 'hostSupport and boundaries'),
  check('MD08', 'release trust and distribution references are linked', listing?.distribution?.packageScript === 'scripts/package-gse.mjs' && listing?.distribution?.trustPolicy === 'references/release-trust.md' && packaging.includes('references/marketplace-discovery.md'), 'distribution metadata and packaging reference'),
  check('MD09', 'OpenAI host metadata remains present', openai.includes('display_name: "GSE"') && openai.includes('default_prompt'), 'agents/openai.yaml'),
  check('MD10', 'validator includes marketplace discovery audit', validate.includes('audit-marketplace-discovery.mjs'), 'scripts/validate-gse.mjs'),
  check('MD11', 'metadata avoids local/private project leakage', noPrivateOrLocalLeak, 'listing and marketplace reference'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { marketplaceDiscovery: failed === 0 ? 'verified' : 'failed' },
  acceptedBy: 'not accepted; this audit verifies metadata readiness but does not publish to or receive approval from a marketplace',
  limits: [
    'This audit verifies local discovery metadata, not marketplace approval.',
    'It does not prove maintainer identity, public registry publication, ranking, search indexing, or host-native installation.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Marketplace Discovery Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Marketplace discovery: ' + data.workflows.marketplaceDiscovery)
  lines.push('- Accepted by: ' + data.acceptedBy)
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
