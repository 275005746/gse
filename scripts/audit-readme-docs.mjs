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
const zh = {
  recommendedTopics: z([0x63a8, 0x8350, 0x20, 0x47, 0x69, 0x74, 0x48, 0x75, 0x62, 0x20, 0x74, 0x6f, 0x70, 0x69, 0x63, 0x73]),
  recommendedDescription: z([0x63a8, 0x8350, 0x4ed3, 0x5e93, 0x20, 0x64, 0x65, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74, 0x69, 0x6f, 0x6e]),
  whyGse: '## ' + z([0x4e3a, 0x4ec0, 0x4e48, 0x9700, 0x8981, 0x20, 0x47, 0x53, 0x45]),
  quickStart: '## ' + z([0x5feb, 0x901f, 0x5f00, 0x59cb]),
  workspace: '## ' + z([0x9879, 0x76ee, 0x5de5, 0x4f5c, 0x533a]),
  commands: '## ' + z([0x5e38, 0x7528, 0x547d, 0x4ee4]),
  documentation: '## ' + z([0x6587, 0x6863, 0x5165, 0x53e3]),
  whenToUse: '## ' + z([0x4ec0, 0x4e48, 0x65f6, 0x5019, 0x9002, 0x5408, 0x4f7f, 0x7528, 0x20, 0x47, 0x53, 0x45]),
  packaging: '## ' + z([0x6253, 0x5305, 0x4e0e, 0x5f00, 0x53d1]),
  officialServices: '## ' + z([0x5b98, 0x65b9, 0x670d, 0x52a1]),
  riskWorkflow: z([0x6309, 0x98ce, 0x9669, 0x4f38, 0x7f29, 0x7684, 0x5de5, 0x4f5c, 0x6d41]),
  taskRouting: z([0x7a33, 0x5b9a, 0x7684, 0x4efb, 0x52a1, 0x8def, 0x7531]),
  compactContext: z([0x6709, 0x9884, 0x7b97, 0x7684, 0x4e0a, 0x4e0b, 0x6587]),
  evidenceFirst: z([0x5148, 0x6709, 0x8bc1, 0x636e, 0xff0c, 0x518d, 0x8bf4, 0x5b8c, 0x6210]),
  gatehubRelay: 'GateHub ' + z([0x540c, 0x65f6, 0x63d0, 0x4f9b, 0x20, 0x41, 0x49, 0x20, 0x6a21, 0x578b, 0x4e2d, 0x8f6c, 0x670d, 0x52a1]),
}

const sharedTerms = [
  'Goal -> Spec -> Execute -> Evidence -> Learn',
  '/gse continue',
  '/gse status',
  'result -> verified -> accepted',
  'validate-gse.mjs',
  '.gse/',
  'topLevelPlanUnitId',
  'taskCreationIntent',
  '--compact',
]

const checks = [
  check('RD01', 'English README exists', exists('README.md'), 'README.md'),
  check('RD02', 'Chinese README exists', exists('README.zh-CN.md'), 'README.zh-CN.md'),
  check('RD02A', 'READMEs link to each other', english.includes('[简体中文](README.zh-CN.md)') && chinese.includes('[English](README.md)'), 'README.md, README.zh-CN.md'),
  check('RD03', 'READMEs share core concepts and commands', sharedTerms.every((term) => english.includes(term) && chinese.includes(term)), sharedTerms.join(', ')),
  check('RD04', 'READMEs open with product value and quick start', english.includes('Goal-Spec-Evidence Engineering for long-running') && english.includes('## Why GSE') && english.includes('## Quick Start') && chinese.includes(zh.whyGse) && chinese.includes(zh.quickStart), 'README.md, README.zh-CN.md'),
  check('RD05', 'READMEs explain when to use GSE', english.includes('## Use GSE When') && english.includes('a project will continue across many agent sessions') && chinese.includes(zh.whenToUse) && chinese.includes('项目会跨很多 agent 会话持续推进'), 'README.md, README.zh-CN.md'),
  check('RD06', 'SKILL links bilingual README docs', skill.includes('README.md') && skill.includes('README.zh-CN.md'), 'SKILL.md'),
  check('RD07', 'validate-gse runs README docs audit', validate.includes('audit-readme-docs.mjs'), 'scripts/validate-gse.mjs'),
  check('RD08', 'READMEs include workspace, commands, and documentation sections', english.includes('## Project Workspace') && english.includes('## Command Overview') && english.includes('## Documentation') && chinese.includes(zh.workspace) && chinese.includes(zh.commands) && chinese.includes(zh.documentation), 'README.md, README.zh-CN.md'),
  check('RD09', 'READMEs avoid machine-local absolute paths and document source validation', !english.includes('C:\\Users\\Admin') && !chinese.includes('C:\\Users\\Admin') && english.includes('node scripts/validate-gse.mjs --root . --profile lite --json') && chinese.includes('node scripts/validate-gse.mjs --root . --profile lite --json'), 'README.md, README.zh-CN.md'),
  check('RD10', 'READMEs avoid private project examples', !english.includes('AION') && !chinese.includes('AION') && !english.includes('aion-productization') && !chinese.includes('aion-productization'), 'README.md, README.zh-CN.md'),
  check('RD11', 'READMEs avoid maintainer-only GitHub metadata blocks', !english.includes('Recommended GitHub topics') && !chinese.includes(zh.recommendedTopics) && !english.includes('Recommended repository description') && !chinese.includes(zh.recommendedDescription), 'README.md, README.zh-CN.md'),
  check('RD12', 'READMEs keep evidence boundaries concise', english.includes('## Honest Boundaries') && english.includes('Local success cannot silently become') && chinese.includes('## 诚实的能力边界') && chinese.includes('本地成功不能被静默扩大'), 'README.md, README.zh-CN.md'),
  check('RD13', 'READMEs explain risk-scaled modes and project workspace', ['lite', 'standard', 'enterprise'].every((term) => english.includes(term) && chinese.includes(term)) && english.includes('Risk-scaled workflow') && chinese.includes(zh.riskWorkflow) && english.includes('.gse/') && chinese.includes('.gse/'), 'README.md, README.zh-CN.md'),
  check('RD14', 'READMEs explain stable task routing and compact continuation', english.includes('Stable task routing') && english.includes('Bounded context and compact continuation') && chinese.includes(zh.taskRouting) && chinese.includes(zh.compactContext) && english.includes('taskCreationIntent: create') && chinese.includes('taskCreationIntent: create'), 'README.md, README.zh-CN.md'),
  check('RD15', 'READMEs explain evidence levels and controlled multi-agent use', english.includes('Controlled multi-agent use') && english.includes('Evidence before completion') && chinese.includes('受控的多 agent 协作') && chinese.includes(zh.evidenceFirst) && english.includes('not-observed') && chinese.includes('not-observed'), 'README.md, README.zh-CN.md'),
  check('RD16', 'READMEs keep release and security caveats in deeper docs', english.includes('## License') && chinese.includes('## License') && read('references/community-channels.md').includes('vulnerability disclosure channel') && read('references/public-release.md').includes('references/community-channels.md'), 'README.md, README.zh-CN.md, references/community-channels.md, references/public-release.md'),
  check('RD17', 'READMEs include npm install and package development commands', english.includes('npm install -g @t275005746/gse') && chinese.includes('npm install -g @t275005746/gse') && english.includes('node scripts/package-gse.mjs --root . --out <package-dir> --label <release-label>') && chinese.includes('node scripts/package-gse.mjs --root . --out <package-dir> --label <release-label>') && english.includes('node scripts/install-gse.mjs --source <package-dir> --target <skill-dir>') && chinese.includes('node scripts/install-gse.mjs --source <package-dir> --target <skill-dir>') && packaging.includes('audit-npm-package-metadata.mjs') && packaging.includes('audit-npm-tarball-install.mjs') && packaging.includes('audit-npm-publish-dry-run.mjs') && packaging.includes('npm pack --dry-run --json') && english.includes('references/packaging.md') && chinese.includes('references/packaging.md'), 'README.md, README.zh-CN.md, references/packaging.md'),
  check('RD18', 'READMEs have no BOM, replacement characters, or common mojibake sentinels', !hasBom('README.md') && !hasBom('README.zh-CN.md') && !hasEncodingDamage(english) && !hasEncodingDamage(chinese), 'README.md, README.zh-CN.md'),
  check('RD19', 'READMEs identify GateHub maintenance and AI model relay services', english.includes('officially maintained by [GateHub](https://gatehub.top/)') && english.includes('AI model relay service') && chinese.includes('[GateHub](https://gatehub.top/) 官方维护') && chinese.includes(zh.gatehubRelay) && english.includes('## Official Services') && chinese.includes(zh.officialServices), 'README.md, README.zh-CN.md'),
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
