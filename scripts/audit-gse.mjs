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
const out = readArg('--out')
const jsonOnly = args.includes('--json')

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function anyExists(relativePaths) {
  return relativePaths.some((relativePath) => exists(relativePath))
}

function criterion(id, label, required, note = '') {
  const ok = Array.isArray(required) ? anyExists(required) : exists(required)
  return {
    id,
    label,
    status: ok ? 'present' : 'missing',
    required,
    note,
  }
}

const capabilityAreas = [
  {
    id: 'GSE-C01',
    name: 'Skill Core',
    criteria: [
      criterion('C01-01', 'Skill entrypoint exists', 'SKILL.md'),
      criterion('C01-02', 'English README exists', 'README.md'),
      criterion('C01-03', 'Chinese README exists', 'README.zh-CN.md'),
      criterion('C01-04', 'References folder exists', 'references'),
      criterion('C01-05', 'Scripts folder exists', 'scripts'),
      criterion('C01-06', 'Reusable templates exist', 'assets/templates'),
      criterion('C01-07', 'OpenAI UI metadata exists', 'agents/openai.yaml', 'Optional package metadata; may be added after validator path is healthy.'),
    ],
  },
  {
    id: 'GSE-C02',
    name: 'GSE Self-Development Governance',
    criteria: [
      criterion('C02-01', 'Development protocol exists', '.gse/gse-development-protocol.md'),
      criterion('C02-02', 'Design master plan exists', '.gse/gse-design-master-plan.md'),
      criterion('C02-03', 'Benchmark audit records exist', '.gse/benchmark-audits'),
      criterion('C02-04', 'Evidence records exist', '.gse/evidence'),
      criterion('C02-05', 'Self-audit script exists', 'scripts/audit-gse.mjs'),
      criterion('C02-06', 'Release/version checklist exists', ['.gse/release.md', 'references/release.md', 'assets/templates/release.md']),
    ],
  },
  {
    id: 'GSE-C03',
    name: 'Project Bootstrap And Profile',
    criteria: [
      criterion('C03-01', 'Project init script exists', 'scripts/init-project.mjs'),
      criterion('C03-02', 'Project profile reference exists', 'references/project-profile.md'),
      criterion('C03-03', 'Project bootstrap reference exists', 'references/project-bootstrap.md'),
      criterion('C03-04', 'Profile discovery script exists', 'scripts/discover-project-profile.mjs'),
    ],
  },
  {
    id: 'GSE-C04',
    name: 'Router And Workflow Selection',
    criteria: [
      criterion('C04-01', 'Task levels reference exists', 'references/task-levels.md'),
      criterion('C04-02', 'Dedicated router reference exists', 'references/router.md'),
      criterion('C04-03', 'Command semantics reference exists', 'references/commands.md'),
      criterion('C04-04', 'Portable command runner exists', ['scripts/run-gse-command.mjs', 'scripts/audit-command-execution.mjs']),
      criterion('C04-05', 'Machine-readable state freshness audit exists', 'scripts/audit-state-freshness.mjs'),
    ],
  },
  {
    id: 'GSE-C05',
    name: 'Goal And Spec System',
    criteria: [
      criterion('C05-01', 'Goal map reference exists', 'references/goal-map.md'),
      criterion('C05-02', 'Spec workflow reference exists', 'references/spec-workflow.md'),
      criterion('C05-03', 'Change brief template exists', 'assets/templates/change-brief.md'),
      criterion('C05-04', 'Spec template exists', 'assets/templates/spec.md'),
      criterion('C05-05', 'Evidence status taxonomy exists', 'references/evidence-taxonomy.md'),
      criterion('C05-06', 'Change pack initializer exists', 'scripts/init-change.mjs'),
      criterion('C05-07', 'Change system audit exists', 'scripts/audit-change-system.mjs'),
      criterion('C05-08', 'Design/tasks/review templates exist', ['assets/templates/design.md', 'assets/templates/tasks.md', 'assets/templates/review.md']),
      criterion('C05-09', 'Change close/archive lifecycle exists', ['scripts/close-change.mjs', 'scripts/audit-change-lifecycle.mjs']),
      criterion('C05-10', 'Document hygiene and canonical compaction dry-run exist', ['scripts/audit-document-hygiene.mjs', 'scripts/compact-canonical-goal-source.mjs']),
    ],
  },
  {
    id: 'GSE-C06',
    name: 'Project Knowledge And Domain Model',
    criteria: [
      criterion('C06-01', 'Project profile reference exists', 'references/project-profile.md'),
      criterion('C06-02', 'ADR template exists', 'assets/templates/adr.md'),
      criterion('C06-03', 'Domain model reference exists', 'references/domain-model.md'),
    ],
  },
  {
    id: 'GSE-C07',
    name: 'Tool And Adapter Layer',
    criteria: [
      criterion('C07-01', 'Tool adapters reference exists', 'references/tool-adapters.md'),
      criterion('C07-02', 'Project agent workspace reference exists', 'references/project-agent-workspace.md'),
      criterion('C07-03', 'Host adapter templates exist', ['assets/templates/host-adapter.md', 'references/host-adapters.md']),
      criterion('C07-04', 'Model routing reference exists', 'references/model-routing.md'),
    ],
  },
  {
    id: 'GSE-C08',
    name: 'Multi-Agent And Role Execution',
    criteria: [
      criterion('C08-01', 'Agent roles reference exists', 'references/agent-roles.md'),
      criterion('C08-02', 'Dispatch template exists', 'assets/templates/dispatch-packet.md'),
      criterion('C08-03', 'File ownership rules exist', 'references/file-ownership.md'),
      criterion('C08-04', 'Forward-test protocol exists', 'references/forward-test.md'),
    ],
  },
  {
    id: 'GSE-C09',
    name: 'Implementation Discipline',
    criteria: [
      criterion('C09-01', 'Operating model exists', 'references/operating-model.md'),
      criterion('C09-02', 'Quality gates exist', 'references/quality-gates.md'),
      criterion('C09-03', 'Dirty worktree or ownership policy exists', ['references/dirty-worktree.md', 'references/file-ownership.md']),
      criterion('C09-04', 'Execution quality pack template exists', 'assets/templates/execution-quality-pack.md'),
    ],
  },
  {
    id: 'GSE-C10',
    name: 'Verification And Evidence Gate',
    criteria: [
      criterion('C10-01', 'Evidence template exists', 'assets/templates/evidence.md'),
      criterion('C10-02', 'Quality gates reference exists', 'references/quality-gates.md'),
      criterion('C10-03', 'Evidence taxonomy exists', 'references/evidence-taxonomy.md'),
      criterion('C10-04', 'Audit script exists', 'scripts/audit-gse.mjs'),
      criterion('C10-05', 'Validation profile runner exists', ['scripts/run-validation-profile.mjs', 'scripts/audit-validation-profiles.mjs']),
    ],
  },
  {
    id: 'GSE-C11',
    name: 'Review, Quality, And Architecture Health',
    criteria: [
      criterion('C11-01', 'Quality gates reference exists', 'references/quality-gates.md'),
      criterion('C11-02', 'Review reference exists', 'references/review.md'),
      criterion('C11-03', 'Architecture health reference exists', 'references/architecture-health.md'),
    ],
  },
  {
    id: 'GSE-C12',
    name: 'Release, Incident, And Recovery',
    criteria: [
      criterion('C12-01', 'Incident review template exists', 'assets/templates/incident-review.md'),
      criterion('C12-02', 'Release reference or template exists', ['references/release.md', 'assets/templates/release.md', '.gse/release.md']),
      criterion('C12-03', 'Recovery or handoff protocol exists', ['references/recovery.md', 'references/handoff.md']),
      criterion('C12-04', 'Release trust and key custody policy exists', ['references/release-trust.md', 'assets/templates/release-trust-record.md', 'scripts/audit-release-trust.mjs']),
    ],
  },
  {
    id: 'GSE-C13',
    name: 'Learning And Memory',
    criteria: [
      criterion('C13-01', 'Learning system reference exists', 'references/learning-system.md'),
      criterion('C13-02', 'Learning promotion rules exist', ['references/learning-system.md']),
      criterion('C13-03', 'Drift audit exists', 'references/drift-audit.md'),
      criterion('C13-04', 'Learning capture command exists', ['scripts/record-learning.mjs', 'scripts/audit-learning-system.mjs']),
    ],
  },
  {
    id: 'GSE-C14',
    name: 'Packaging, Distribution, And Maintenance',
    criteria: [
      criterion('C14-01', 'Validation script exists', ['scripts/audit-gse.mjs', 'scripts/validate-gse.mjs']),
      criterion('C14-02', 'Compatibility matrix exists', ['references/compatibility.md', '.gse/gse-design-master-plan.md']),
      criterion('C14-03', 'Example fixtures exist', ['examples', 'fixtures', 'assets/examples']),
      criterion('C14-04', 'Release notes or changelog policy exists', ['CHANGELOG.md', 'references/release.md']),
      criterion('C14-05', 'Command semantics audit exists', 'scripts/audit-commands.mjs'),
      criterion('C14-06', 'README docs audit exists', 'scripts/audit-readme-docs.mjs'),
      criterion('C14-07', 'Local package and install scripts exist', ['scripts/package-gse.mjs', 'scripts/install-gse.mjs']),
      criterion('C14-08', 'Distribution audit exists', 'scripts/audit-distribution.mjs'),
      criterion('C14-09', 'Host command adapter scripts exist', ['scripts/generate-command-adapter.mjs', 'scripts/audit-command-adapters.mjs']),
      criterion('C14-10', 'Remote URL distribution and integrity audit exists', 'scripts/audit-remote-distribution.mjs'),
      criterion('C14-11', 'Package signing and verification scripts exist', ['scripts/sign-gse-package.mjs', 'scripts/verify-gse-package.mjs', 'scripts/audit-signing.mjs']),
      criterion('C14-12', 'Marketplace discovery metadata exists', ['assets/marketplace/gse-listing.json', 'references/marketplace-discovery.md', 'scripts/audit-marketplace-discovery.mjs']),
      criterion('C14-13', 'Host UI invocation evidence audit exists', ['assets/templates/host-ui-invocation-record.md', 'scripts/audit-host-ui-invocation.mjs']),
      criterion('C14-14', 'Right-sized validation profile entrypoints exist', ['scripts/run-validation-profile.mjs', 'scripts/audit-validation-profiles.mjs']),
      criterion('C14-15', 'Open-source defaults audit exists', ['references/open-source-defaults.md', 'scripts/audit-open-source-defaults.mjs', 'LICENSE']),
      criterion('C14-16', 'Community support channel boundaries exist', ['references/community-channels.md', 'SUPPORT.md']),
      criterion('C14-17', 'Node package metadata and npm pack audit exist', ['package.json', 'scripts/audit-npm-package-metadata.mjs']),
      criterion('C14-18', 'Node package tarball install audit exists', 'scripts/audit-npm-tarball-install.mjs'),
    ],
  },
]

function summarizeArea(area) {
  const present = area.criteria.filter((item) => item.status === 'present').length
  const total = area.criteria.length
  const score = total === 0 ? 0 : present / total
  let status = 'missing'
  if (score === 1) status = 'strong'
  else if (score >= 0.67) status = 'usable'
  else if (score > 0) status = 'thin'
  return { ...area, present, total, score: Number(score.toFixed(2)), status }
}

const areas = capabilityAreas.map(summarizeArea)
const totals = areas.reduce(
  (acc, area) => {
    acc.present += area.present
    acc.total += area.total
    acc[area.status] += 1
    return acc
  },
  { present: 0, total: 0, strong: 0, usable: 0, thin: 0, missing: 0 },
)

const summary = {
  root,
  generatedAt: new Date().toISOString(),
  totals: {
    ...totals,
    score: totals.total === 0 ? 0 : Number((totals.present / totals.total).toFixed(2)),
  },
  areas,
}

function renderMarkdown(report) {
  const lines = []
  lines.push('# GSE Self-Audit')
  lines.push('')
  lines.push(`Generated: ${report.generatedAt}`)
  lines.push(`Root: ${report.root}`)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push(`- Criteria present: ${report.totals.present}/${report.totals.total}`)
  lines.push(`- Score: ${report.totals.score}`)
  lines.push(`- Areas: strong ${report.totals.strong}, usable ${report.totals.usable}, thin ${report.totals.thin}, missing ${report.totals.missing}`)
  lines.push('')
  lines.push('## Areas')
  lines.push('')
  for (const area of report.areas) {
    lines.push(`### ${area.id} - ${area.name}`)
    lines.push('')
    lines.push(`Status: ${area.status} (${area.present}/${area.total}, score ${area.score})`)
    lines.push('')
    for (const item of area.criteria) {
      const marker = item.status === 'present' ? '[x]' : '[ ]'
      const required = Array.isArray(item.required) ? item.required.join(' or ') : item.required
      const note = item.note ? ` - ${item.note}` : ''
      lines.push(`- ${marker} ${item.id}: ${item.label} (${required})${note}`)
    }
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

if (out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
  fs.writeFileSync(path.resolve(out), renderMarkdown(summary), 'utf8')
}

if (jsonOnly || !out) {
  console.log(JSON.stringify(summary, null, 2))
} else {
  console.log(`Wrote ${path.resolve(out)}`)
}
