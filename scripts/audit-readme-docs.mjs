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

function section(text, heading) {
  const start = text.indexOf(heading)
  if (start === -1) return ''
  const next = text.indexOf('\n## ', start + heading.length)
  return next === -1 ? text.slice(start) : text.slice(start, next)
}

function z(codes) {
  return String.fromCodePoint(...codes)
}

function hasBom(relativePath) {
  const fullPath = path.join(root, relativePath)
  if (!fs.existsSync(fullPath)) return false
  const bytes = fs.readFileSync(fullPath)
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
}

function hasEncodingDamage(text) {
  const mojibakeSentinels = [
    '\uFFFD',
    String.fromCodePoint(0x951b),
    String.fromCodePoint(0x9286),
    String.fromCodePoint(0x9428),
    String.fromCodePoint(0x95c8),
    String.fromCodePoint(0x6d93),
    String.fromCodePoint(0x7ecb),
    String.fromCodePoint(0x6d60),
  ]
  return mojibakeSentinels.some((item) => text.includes(item))
}

const english = read('README.md')
const chinese = read('README.zh-CN.md')
const skill = read('SKILL.md')
const validate = read('scripts/validate-gse.mjs')
const packaging = read('references/packaging.md')
const englishCommunity = section(english, '## Community')
const zh = {
  community: z([0x23, 0x23, 0x20, 0x793e, 0x533a]),
  noPretend: z([0x4e0d, 0x8981, 0x5047, 0x88c5]),
  noGroundlessClaim: z([0x4e0d, 0x80fd, 0x51ed, 0x7a7a, 0x5ba3, 0x79f0]),
  noGateHubDependency: z([0x4e0d, 0x4f9d, 0x8d56, 0x20, 0x47, 0x61, 0x74, 0x65, 0x48, 0x75, 0x62]),
  notRegistryCenter: z([0x4e0d, 0x662f, 0x20, 0x47, 0x53, 0x45, 0x20, 0x7684, 0x5305, 0x6ce8, 0x518c, 0x4e2d, 0x5fc3]),
  securityDisclosureChannel: z([0x5b89, 0x5168, 0x6f0f, 0x6d1e, 0x62ab, 0x9732, 0x6e20, 0x9053]),
  hostRuntimeCertification: 'host runtime ' + z([0x8ba4, 0x8bc1]),
  highlights: z([0x23, 0x23, 0x20, 0x4eae, 0x70b9]),
  quickStart: z([0x23, 0x23, 0x20, 0x5feb, 0x901f, 0x5f00, 0x59cb]),
  longRunningAgentProjects: z([0x9762, 0x5411, 0x957f, 0x671f, 0x20, 0x61, 0x67, 0x65, 0x6e, 0x74, 0x20, 0x8f85, 0x52a9, 0x8f6f, 0x4ef6, 0x9879, 0x76ee]),
  whenToUse: z([0x23, 0x23, 0x20, 0x4ec0, 0x4e48, 0x65f6, 0x5019, 0x7528, 0x20, 0x47, 0x53, 0x45]),
  manyAgentSessions: z([0x9879, 0x76ee, 0x4f1a, 0x8de8, 0x5f88, 0x591a, 0x20, 0x61, 0x67, 0x65, 0x6e, 0x74, 0x20, 0x4f1a, 0x8bdd, 0x6301, 0x7eed, 0x63a8, 0x8fdb]),
  whatItCreates: z([0x23, 0x23, 0x20, 0x4f1a, 0x521b, 0x5efa, 0x4ec0, 0x4e48]),
  projectLayout: z([0x23, 0x23, 0x20, 0x9879, 0x76ee, 0x7ed3, 0x6784]),
  commands: z([0x23, 0x23, 0x20, 0x547d, 0x4ee4]),
  documentation: z([0x23, 0x23, 0x20, 0x6587, 0x6863]),
  recommendedTopics: z([0x63a8, 0x8350, 0x20, 0x47, 0x69, 0x74, 0x48, 0x75, 0x62, 0x20, 0x74, 0x6f, 0x70, 0x69, 0x63, 0x73]),
  recommendedDescription: z([0x63a8, 0x8350, 0x4ed3, 0x5e93, 0x20, 0x64, 0x65, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74, 0x69, 0x6f, 0x6e]),
  largeProjectFirstAdoption: z([0x5927, 0x9879, 0x76ee, 0x7b2c, 0x4e00, 0x6b21, 0x63a5, 0x5165, 0x4e5f, 0x53ef, 0x4ee5, 0x76f4, 0x63a5, 0x4f7f, 0x7528]),
  gsePosition: z([0x23, 0x23, 0x20, 0x47, 0x53, 0x45, 0x20, 0x7684, 0x4f4d, 0x7f6e]),
  searchTerms: z([0x641c, 0x7d22, 0x8bcd]),
  gatehubSupports: 'GateHub' + z([0xff08]) + '[gatehub.top](https://gatehub.top/)' + z([0xff09, 0x652f, 0x6301, 0x20, 0x47, 0x53, 0x45, 0x20, 0x7684, 0x5f00, 0x53d1]),
  installation: z([0x23, 0x23, 0x20, 0x5b89, 0x88c5]),
}
const chineseCommunity = section(chinese, zh.community)
const englishReadmeUrl = 'https://github.com/275005746/gse/blob/main/README.md'
const chineseReadmeUrl = 'https://github.com/275005746/gse/blob/main/README.zh-CN.md'

const sharedTerms = [
  'Goal -> Spec -> Execute -> Evidence -> Learn',
  '/gse continue',
  '/gse status',
  'result -> verified -> accepted',
  'validate-gse.mjs',
  '.gse/',
  'spec-driven development',
]

const defensivePhrases = [
  'not the package registry',
  'security disclosure channel',
  'host-runtime certification',
  'does not require GateHub',
  'not required to use GSE',
  'Do not claim',
  'Do not fake',
  zh.noPretend,
  zh.noGroundlessClaim,
  zh.noGateHubDependency,
  zh.notRegistryCenter,
  zh.securityDisclosureChannel,
  zh.hostRuntimeCertification,
]

const checks = [
  check('RD01', 'English README exists', exists('README.md'), 'README.md'),
  check('RD02', 'Chinese README exists', exists('README.zh-CN.md'), 'README.zh-CN.md'),
  check('RD02A', 'READMEs link to each other with public absolute URLs for npm and GitHub rendering', english.includes(`[简体中文](${chineseReadmeUrl})`) && chinese.includes(`[English](${englishReadmeUrl})`), 'README.md, README.zh-CN.md'),
  check('RD03', 'READMEs share core concepts and commands', sharedTerms.every((term) => english.includes(term) && chinese.includes(term)), sharedTerms.join(', ')),
  check('RD04', 'READMEs open with value, quick start, and highlights', english.includes('## Highlights') && english.includes('## Quick Start') && english.includes('Goal-Spec-Evidence Engineering for long-running') && chinese.includes(zh.highlights) && chinese.includes(zh.quickStart) && chinese.includes(zh.longRunningAgentProjects), 'README.md, README.zh-CN.md'),
  check('RD05', 'READMEs explain when to use GSE', english.includes('## When To Use GSE') && english.includes('the project will continue across many agent sessions') && chinese.includes(zh.whenToUse) && chinese.includes(zh.manyAgentSessions), 'README.md, README.zh-CN.md'),
  check('RD06', 'SKILL links bilingual README docs', skill.includes('README.md') && skill.includes('README.zh-CN.md'), 'SKILL.md'),
  check('RD07', 'validate-gse runs README docs audit', validate.includes('audit-readme-docs.mjs'), 'scripts/validate-gse.mjs'),
  check('RD08', 'READMEs include open-source style usage sections', english.includes('## What It Creates') && english.includes('## Project Layout') && english.includes('## Commands') && english.includes('## Documentation') && chinese.includes(zh.whatItCreates) && chinese.includes(zh.projectLayout) && chinese.includes(zh.commands) && chinese.includes(zh.documentation), 'README.md, README.zh-CN.md'),
  check('RD09', 'READMEs avoid machine-local absolute paths', !english.includes('C:\\Users\\Admin') && !chinese.includes('C:\\Users\\Admin') && english.includes('node scripts/validate-gse.mjs --root . --json') && chinese.includes('node scripts/validate-gse.mjs --root . --json'), 'README.md, README.zh-CN.md'),
  check('RD10', 'READMEs avoid private project examples', !english.includes('AION') && !chinese.includes('AION') && !english.includes('aion-productization') && !chinese.includes('aion-productization'), 'README.md, README.zh-CN.md'),
  check('RD11', 'READMEs avoid maintainer-only GitHub metadata blocks', !english.includes('Recommended GitHub topics') && !chinese.includes(zh.recommendedTopics) && !english.includes('Recommended repository description') && !chinese.includes(zh.recommendedDescription), 'README.md, README.zh-CN.md'),
  check('RD12', 'READMEs avoid defensive caveat bloat', defensivePhrases.every((phrase) => !english.includes(phrase) && !chinese.includes(phrase)), 'README.md, README.zh-CN.md'),
  check('RD13', 'READMEs explain scaffold modes and project workspace', english.includes('lite') && english.includes('standard') && english.includes('enterprise') && english.includes('Large projects can start directly') && chinese.includes('lite') && chinese.includes('standard') && chinese.includes('enterprise') && chinese.includes(zh.largeProjectFirstAdoption), 'README.md, README.zh-CN.md'),
  check('RD14', 'READMEs explain goal hierarchy and ecosystem positioning naturally', english.includes('.gse/goals/') && english.includes('agentic engineering') && english.includes('spec-driven development') && english.includes('SDD') && !english.includes('## How GSE Fits') && chinese.includes('.gse/goals/') && chinese.includes('agentic engineering') && chinese.includes('spec-driven development') && chinese.includes('SDD') && !chinese.includes(zh.gsePosition) && !english.includes('Search Terms') && !chinese.includes(zh.searchTerms), 'README.md, README.zh-CN.md'),
  check('RD15', 'README community sections are concise and non-defensive', englishCommunity.includes('GateHub ([gatehub.top](https://gatehub.top/)) supports GSE development') && !englishCommunity.includes('SUPPORT.md') && !englishCommunity.includes('CONTRIBUTING.md') && englishCommunity.length < 240 && chineseCommunity.includes(zh.gatehubSupports) && !chineseCommunity.includes('SUPPORT.md') && !chineseCommunity.includes('CONTRIBUTING.md') && chineseCommunity.length < 140, 'README.md, README.zh-CN.md'),
  check('RD16', 'READMEs keep release and security caveats in deeper docs', english.includes('## License') && chinese.includes('## License') && read('references/community-channels.md').includes('vulnerability disclosure channel') && read('references/public-release.md').includes('references/community-channels.md'), 'README.md, README.zh-CN.md, references/community-channels.md, references/public-release.md'),
  check('RD17', 'READMEs include package, install, and npm metadata commands', english.includes('## Installation') && chinese.includes(zh.installation) && english.includes('node scripts/package-gse.mjs --root . --out <package-dir> --label <release-label>') && chinese.includes('node scripts/package-gse.mjs --root . --out <package-dir> --label <release-label>') && english.includes('node scripts/install-gse.mjs --source <package-dir> --target <install-skill-dir>') && chinese.includes('node scripts/install-gse.mjs --source <package-dir> --target <install-skill-dir>') && english.includes('node scripts/install-gse.mjs --source-url <file-or-http-package-url> --target <install-skill-dir>') && chinese.includes('node scripts/install-gse.mjs --source-url <file-or-http-package-url> --target <install-skill-dir>') && english.includes('node scripts/audit-npm-package-metadata.mjs --root . --json') && chinese.includes('node scripts/audit-npm-package-metadata.mjs --root . --json') && english.includes('node scripts/audit-npm-tarball-install.mjs --root . --json') && chinese.includes('node scripts/audit-npm-tarball-install.mjs --root . --json') && english.includes('node scripts/audit-npm-publish-dry-run.mjs --root . --json') && chinese.includes('node scripts/audit-npm-publish-dry-run.mjs --root . --json') && packaging.includes('audit-npm-package-metadata.mjs') && packaging.includes('audit-npm-tarball-install.mjs') && packaging.includes('audit-npm-publish-dry-run.mjs') && packaging.includes('npm pack --dry-run --json') && english.includes('references/packaging.md') && chinese.includes('references/packaging.md'), 'README.md, README.zh-CN.md, references/packaging.md'),
  check('RD18', 'READMEs have no BOM, replacement characters, or common mojibake sentinels', !hasBom('README.md') && !hasBom('README.zh-CN.md') && !hasEncodingDamage(english) && !hasEncodingDamage(chinese), 'README.md, README.zh-CN.md'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { readmeDocs: failed === 0 ? 'verified' : 'failed' },
  limits: [
    'This audit checks bilingual README coverage, public-facing clarity, and avoidance of defensive caveat bloat.',
    'Release, marketplace, security, and host-runtime boundaries belong in deeper reference docs and dedicated audits.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE README Docs Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- README docs: ' + data.workflows.readmeDocs)
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
