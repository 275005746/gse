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

const masterPlan = read('.gse/gse-design-master-plan.md')
const goalMap = read('.gse/goal-map.md')
const currentSlice = read('.gse/current-slice.md')
const evidenceIndex = read('.gse/evidence/index.jsonl')
const validate = read('scripts/validate-gse.mjs')
const verifiedCoreEvidenceRecorded = evidenceIndex
  .split(/\r?\n/)
  .filter(Boolean)
  .some((line) => {
    try {
      const record = JSON.parse(line)
      return record.recordType === 'core-foundation-validation' &&
        record.status === 'verified' &&
        record.evidenceLevel === 'verified-component' &&
        exists(record.evidenceFile)
    } catch {
      return false
    }
  })

const localCapabilityAudits = [
  'audit-gse.mjs',
  'audit-project.mjs',
  'audit-fixtures.mjs',
  'audit-adoption.mjs',
  'audit-host-adapters.mjs',
  'audit-compatibility.mjs',
  'audit-fresh-session-readiness.mjs',
  'audit-release-readiness.mjs',
  'audit-npm-package-metadata.mjs',
  'audit-update-release-acceptance.mjs',
  'audit-target-adoption-evidence.mjs',
  'audit-target-project.mjs',
  'audit-acceptance-execution-packet.mjs',
  'audit-roadmap-consistency.mjs',
  'audit-recovery-readiness.mjs',
  'audit-domain-quality-gates.mjs',
  'audit-adoption-recipes.mjs',
  'audit-commands.mjs',
  'audit-readme-docs.mjs',
  'generate-session-prompt.mjs',
  'run-gse-command.mjs',
  'audit-command-execution.mjs',
  'audit-close-gate.mjs',
  'update-project-state.mjs',
  'audit-v1-target-validation.mjs',
  'audit-command-adapters.mjs',
  'audit-change-lifecycle.mjs',
  'audit-remote-distribution.mjs',
  'audit-signing.mjs',
  'audit-release-trust.mjs',
  'audit-open-source-defaults.mjs',
  'audit-public-release-metadata.mjs',
  'record-public-release.mjs',
  'audit-public-release-decision.mjs',
  'audit-evidence-placeholders.mjs',
  'record-public-ci-run.mjs',
  'audit-public-ci-run.mjs',
  'audit-release-bundle.mjs',
  'generate-release-bundle.mjs',
  'audit-open-source-readiness.mjs',
  'audit-ci-readiness.mjs',
  'audit-public-collaboration-templates.mjs',
  'record-public-security-contact.mjs',
  'audit-public-security-contact.mjs',
  'record-public-repository-settings.mjs',
  'audit-public-repository-settings.mjs',
  'record-public-channel-publication.mjs',
  'audit-public-channel-publication.mjs',
  'audit-marketplace-discovery.mjs',
  'audit-validation-profiles.mjs',
  'audit-host-ui-invocation.mjs',
  'audit-host-runtime-invocations.mjs',
  'audit-host-runtime-invocation-drill.mjs',
  'audit-final-readiness.mjs',
  'audit-final-readiness-promotion.mjs',
  'audit-public-acceptance-readiness.mjs',
  'audit-public-acceptance-command-dry-run-drill.mjs',
  'audit-public-external-gate-probe.mjs',
  'audit-public-acceptance-handoff.mjs',
  'audit-release-status-manifest.mjs',
  'audit-release-owner-action-plan.mjs',
  'audit-public-release-checklist.mjs',
  'audit-release-owner-action-plan-drill.mjs',
  'audit-final-form-progress-report.mjs',
  'audit-final-form-roadmap.mjs',
  'audit-local-final-form-completion.mjs',
  'audit-final-form-stale-copy.mjs',
  'audit-npm-tarball-install.mjs',
  'audit-npm-publish-dry-run.mjs',
  'audit-host-runtime-evidence-handoff.mjs',
  'audit-owner-external-gate-kit.mjs',
  'generate-final-acceptance-packet.mjs',
  'audit-final-acceptance-packet.mjs',
]

const requiredArtifacts = [
  'SKILL.md',
  '.gse/gse-design-master-plan.md',
  '.gse/goal-map.md',
  '.gse/current-slice.md',
  'assets/templates/acceptance-execution-packet.md',
  'assets/templates/target-adoption-evidence.md',
  'assets/templates/update-release-acceptance-record.md',
  'references/evidence-taxonomy.md',
  'references/forward-test.md',
  'references/adoption-recipes.md',
  'references/commands.md',
  'README.md',
  'README.zh-CN.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'SUPPORT.md',
  '.github/workflows/validate-gse.yml',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/change_request.yml',
  'assets/templates/public-channel-publication-record.md',
  'assets/templates/public-ci-run-record.md',
  'assets/templates/public-security-contact-record.md',
  'assets/templates/public-repository-settings-record.md',
  '.gse/state.json',
  '.gse/evidence/index.jsonl',
  'scripts/generate-session-prompt.mjs',
  'scripts/run-gse-command.mjs',
  'scripts/audit-command-execution.mjs',
  'scripts/audit-close-gate.mjs',
  'scripts/update-project-state.mjs',
  'scripts/audit-v1-target-validation.mjs',
  'scripts/package-gse.mjs',
  'scripts/install-gse.mjs',
  'scripts/audit-npm-package-metadata.mjs',
  'scripts/generate-command-adapter.mjs',
  'scripts/audit-command-adapters.mjs',
  'scripts/close-change.mjs',
  'scripts/audit-change-lifecycle.mjs',
  'scripts/audit-remote-distribution.mjs',
  'scripts/sign-gse-package.mjs',
  'scripts/verify-gse-package.mjs',
  'scripts/audit-signing.mjs',
  'references/release-trust.md',
  'assets/templates/release-trust-record.md',
  'scripts/audit-release-trust.mjs',
  'scripts/audit-open-source-defaults.mjs',
  'references/public-release.md',
  'assets/templates/public-release-record.md',
  'scripts/audit-public-release-metadata.mjs',
  'scripts/record-public-release.mjs',
  'scripts/audit-public-release-decision.mjs',
  'scripts/audit-evidence-placeholders.mjs',
  'scripts/record-public-ci-run.mjs',
  'scripts/audit-public-ci-run.mjs',
  'scripts/generate-release-bundle.mjs',
  'scripts/audit-release-bundle.mjs',
  'scripts/audit-open-source-readiness.mjs',
  'scripts/audit-ci-readiness.mjs',
  'scripts/audit-public-collaboration-templates.mjs',
  'scripts/record-public-security-contact.mjs',
  'scripts/audit-public-security-contact.mjs',
  'scripts/record-public-repository-settings.mjs',
  'scripts/audit-public-repository-settings.mjs',
  'scripts/record-public-channel-publication.mjs',
  'scripts/audit-public-channel-publication.mjs',
  '.gse/releases/public-release-owner-required.md',
  '.gse/releases/public-security-contact-owner-required.md',
  'references/marketplace-discovery.md',
  'assets/marketplace/gse-listing.json',
  'scripts/audit-marketplace-discovery.mjs',
  'scripts/audit-validation-profiles.mjs',
  'scripts/run-validation-profile.mjs',
  'assets/templates/host-ui-invocation-record.md',
  'scripts/audit-host-ui-invocation.mjs',
  'scripts/record-host-invocation.mjs',
  'scripts/audit-host-runtime-invocations.mjs',
  'scripts/audit-host-runtime-invocation-drill.mjs',
  'references/final-readiness.md',
  'scripts/audit-final-readiness.mjs',
  'scripts/audit-final-readiness-promotion.mjs',
  'scripts/audit-public-acceptance-readiness.mjs',
  'scripts/audit-public-acceptance-command-dry-run-drill.mjs',
  'scripts/probe-public-external-gates.mjs',
  'scripts/audit-public-external-gate-probe.mjs',
  'scripts/generate-public-acceptance-handoff.mjs',
  'scripts/audit-public-acceptance-handoff.mjs',
  'scripts/generate-release-status-manifest.mjs',
  'scripts/audit-release-status-manifest.mjs',
  'scripts/generate-release-owner-action-plan.mjs',
  'scripts/audit-release-owner-action-plan.mjs',
  'scripts/generate-public-release-checklist.mjs',
  'scripts/audit-public-release-checklist.mjs',
  'scripts/audit-release-owner-action-plan-drill.mjs',
  'scripts/generate-final-form-progress-report.mjs',
  'scripts/audit-final-form-progress-report.mjs',
  'references/final-form-roadmap.md',
  'scripts/audit-final-form-roadmap.mjs',
  'scripts/audit-local-final-form-completion.mjs',
  'scripts/audit-final-form-stale-copy.mjs',
  'scripts/audit-npm-tarball-install.mjs',
  'scripts/audit-npm-publish-dry-run.mjs',
  'scripts/generate-host-runtime-evidence-handoff.mjs',
  'scripts/audit-host-runtime-evidence-handoff.mjs',
  'scripts/generate-owner-external-gate-kit.mjs',
  'scripts/audit-owner-external-gate-kit.mjs',
  'scripts/generate-final-acceptance-packet.mjs',
  'scripts/audit-final-acceptance-packet.mjs',
  '.gse/acceptance/final-form-progress-report.md',
  '.gse/acceptance/final-form-progress-report.json',
  '.gse/acceptance/public-acceptance-handoff.md',
  '.gse/acceptance/release-status-manifest.json',
  '.gse/acceptance/release-owner-action-plan.md',
  '.gse/acceptance/public-release-checklist.md',
  '.gse/acceptance/owner-external-gate-kit/README.md',
  '.gse/acceptance/owner-external-gate-kit/kit-manifest.json',
]

const checks = [
  check('CR01', 'completion readiness audit is wired into validator', validate.includes('audit-completion-readiness.mjs'), 'scripts/validate-gse.mjs'),
  check('CR02', 'all local capability audits are wired into validator', localCapabilityAudits.every((item) => validate.includes(item)), localCapabilityAudits.join(', ')),
  check('CR03', 'required completion artifacts exist', requiredArtifacts.every(exists), requiredArtifacts.join(', ')),
  check('CR04', 'master plan records the current public baseline and evidence-gated acceptance', masterPlan.includes('GSE 1.0.0 is the public baseline') && masterPlan.includes('Never claim tool availability, host-native support, delegated execution, tests, or evidence without proof') && masterPlan.includes('A GSE change is complete only when:'), '.gse/gse-design-master-plan.md'),
  check('CR05', 'current slice preserves required GSE slice fields after acceptance', currentSlice.includes('## Outcome') && currentSlice.includes('## Scope') && currentSlice.includes('## Acceptance') && currentSlice.includes('## Evidence Plan') && currentSlice.includes('## Risk') && currentSlice.includes('## Next Action'), '.gse/current-slice.md'),
  check('CR06', 'goal map records v1 execution-state work as verified', goalMap.includes('GSE-008') && goalMap.includes('Productize v1.0 execution-state workflow') && goalMap.includes('verified') && goalMap.includes('audit-v1-target-validation.mjs'), '.gse/goal-map.md'),
  check('CR07', 'evidence index records verified Core foundation validation', verifiedCoreEvidenceRecorded, '.gse/evidence/index.jsonl'),
  check('CR08', 'current control docs keep optional capability and local-validation limits explicit', masterPlan.includes('optional adapters') && masterPlan.includes('Real delegated execution remains a host capability and must be proven separately') && goalMap.includes('Native slash-command support is an optional host-adapter claim') && goalMap.includes('Local validation proves the package and workflow checks, not arbitrary project success'), '.gse/gse-design-master-plan.md, .gse/goal-map.md'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { completionReadiness: failed === 0 ? 'current-scope-validated' : 'failed' },
  completionStatus: failed === 0 ? 'complete for current verified scope: target validation, local distribution, npm package metadata, npm tarball installability, remote URL distribution with integrity, package signing/verification, portable command execution, validation profiles, release trust policy, open-source defaults, public release metadata workflow, MIT license decision, public release decision lifecycle, public evidence placeholder rejection, public CI run record mechanics, public channel publication record mechanics, public external gate live probe mechanics, release bundle generation, release status manifest, release owner action plan, release owner action plan drill, open-source repository readiness, CI workflow readiness, public collaboration templates, public security contact record mechanics, public repository settings record mechanics, marketplace discovery metadata, npm public registry publication evidence, host runtime invocation record mechanics, host runtime invocation fixture drill, host runtime evidence handoff, final readiness matrix, final readiness accepted-record promotion, public acceptance doctor, public acceptance command dry-run drill, public acceptance handoff, final-form progress report, final acceptance packet, owner/external gate kit and canonical freshness audit, final-form stale-copy audit, Codex text-command host invocation, command-adapter generation, and real-workspace change archive lifecycle are verified; native slash-command support remains external-gated work' : 'not ready: roadmap or evidence state is inconsistent',
  limits: [
    'This audit verifies GSE scaffold readiness and v1 execution-state target validation tracking.',
    'It does not certify arbitrary repositories, public registry publication, marketplace install, CI, MCP, LSP, subagent runtime, or fresh-session execution.',
    'It does not certify real remote-machine network conditions, marketplace approval, native slash-command execution, other host runtime invocation, or arbitrary repositories.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Completion Readiness Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Completion readiness: ' + data.workflows.completionReadiness)
  lines.push('- Completion status: ' + data.completionStatus)
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
