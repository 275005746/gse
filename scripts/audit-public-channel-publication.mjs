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

function read(relativePath) {
  const fullPath = path.join(root, relativePath)
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : ''
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath))
}

function run(command, commandArgs, cwd = root) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    command: [command, ...commandArgs].join(' '),
  }
}

function parseJson(stdout) {
  try {
    return JSON.parse(stdout)
  } catch {
    return null
  }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function createFixture() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-public-channel-publication-'))
  fs.mkdirSync(path.join(fixture, '.gse', 'releases'), { recursive: true })
  return fixture
}

const recordScript = path.join(root, 'scripts', 'record-public-channel-publication.mjs')
const template = read('assets/templates/public-channel-publication-record.md')
const publicRelease = read('references/public-release.md')
const marketplace = read('references/marketplace-discovery.md')
const packaging = read('references/packaging.md')
const finalReadiness = read('references/final-readiness.md')
const validate = read('scripts/validate-gse.mjs')

const fixture = exists('scripts/record-public-channel-publication.mjs') ? createFixture() : null
const pending = fixture ? run(process.execPath, [recordScript, '--root', fixture, '--publication-status', 'pending', '--dry-run', '--json']) : null
const registryOk = fixture ? run(process.execPath, [
  recordScript,
  '--root', fixture,
  '--publication-status', 'accepted',
  '--channel-type', 'package-registry',
  '--channel-name', 'npm',
  '--channel-url', 'https://registry.example/gse',
  '--version', '1.0.0',
  '--artifact-digest', 'sha256:fixture',
  '--review-status', 'published',
  '--evidence-owner', 'fixture-owner',
  '--evidence-date', '2026-07-06',
  '--evidence-url', 'https://registry.example/gse/1.0.0',
  '--evidence-status', 'accepted',
  '--accepted-by', 'fixture-owner',
  '--accepted-at', '2026-07-06',
  '--proves-registry-publication', 'true',
  '--proves-channel-installability', 'true',
  '--dry-run',
  '--json',
]) : null
const marketplaceOk = fixture ? run(process.execPath, [
  recordScript,
  '--root', fixture,
  '--publication-status', 'accepted',
  '--channel-type', 'marketplace',
  '--channel-name', 'Example Marketplace',
  '--channel-url', 'https://marketplace.example/gse',
  '--version', '1.0.0',
  '--review-status', 'approved',
  '--evidence-owner', 'fixture-owner',
  '--evidence-date', '2026-07-06',
  '--evidence-url', 'https://marketplace.example/gse/review',
  '--evidence-status', 'accepted',
  '--accepted-by', 'fixture-owner',
  '--accepted-at', '2026-07-06',
  '--proves-marketplace-approval', 'true',
  '--proves-channel-installability', 'true',
  '--dry-run',
  '--json',
]) : null
const registryMissingInstallability = fixture ? run(process.execPath, [
  recordScript,
  '--root', fixture,
  '--publication-status', 'accepted',
  '--channel-type', 'package-registry',
  '--channel-name', 'npm',
  '--channel-url', 'https://registry.example/gse',
  '--version', '1.0.0',
  '--artifact-digest', 'sha256:fixture',
  '--review-status', 'published',
  '--evidence-owner', 'fixture-owner',
  '--evidence-date', '2026-07-06',
  '--evidence-url', 'https://registry.example/gse/1.0.0',
  '--evidence-status', 'accepted',
  '--accepted-by', 'fixture-owner',
  '--accepted-at', '2026-07-06',
  '--proves-registry-publication', 'true',
  '--proves-channel-installability', 'false',
  '--dry-run',
  '--json',
]) : null
const marketplaceMissingInstallability = fixture ? run(process.execPath, [
  recordScript,
  '--root', fixture,
  '--publication-status', 'accepted',
  '--channel-type', 'marketplace',
  '--channel-name', 'Example Marketplace',
  '--channel-url', 'https://marketplace.example/gse',
  '--version', '1.0.0',
  '--review-status', 'approved',
  '--evidence-owner', 'fixture-owner',
  '--evidence-date', '2026-07-06',
  '--evidence-url', 'https://marketplace.example/gse/review',
  '--evidence-status', 'accepted',
  '--accepted-by', 'fixture-owner',
  '--accepted-at', '2026-07-06',
  '--proves-marketplace-approval', 'true',
  '--proves-channel-installability', 'false',
  '--dry-run',
  '--json',
]) : null
const acceptedMissing = fixture ? run(process.execPath, [recordScript, '--root', fixture, '--publication-status', 'accepted', '--evidence-status', 'pending', '--dry-run', '--json']) : null
const registryPlaceholderWrite = fixture ? run(process.execPath, [
  recordScript,
  '--root', fixture,
  '--publication-status', 'accepted',
  '--channel-type', 'package-registry',
  '--channel-name', 'npm',
  '--channel-url', 'https://registry.example/gse',
  '--version', '1.0.0',
  '--artifact-digest', 'sha256:fixture',
  '--review-status', 'published',
  '--evidence-owner', 'fixture-owner',
  '--evidence-date', '2026-07-06',
  '--evidence-url', 'https://registry.example/gse/1.0.0',
  '--evidence-status', 'accepted',
  '--accepted-by', 'fixture-owner',
  '--accepted-at', '2026-07-06',
  '--proves-registry-publication', 'true',
  '--proves-channel-installability', 'true',
  '--json',
]) : null

const pendingData = pending ? parseJson(pending.stdout) : null
const registryOkData = registryOk ? parseJson(registryOk.stdout) : null
const marketplaceOkData = marketplaceOk ? parseJson(marketplaceOk.stdout) : null
const registryMissingInstallabilityData = registryMissingInstallability ? parseJson(registryMissingInstallability.stdout) : null
const marketplaceMissingInstallabilityData = marketplaceMissingInstallability ? parseJson(marketplaceMissingInstallability.stdout) : null
const acceptedMissingData = acceptedMissing ? parseJson(acceptedMissing.stdout) : null
const registryPlaceholderWriteData = registryPlaceholderWrite ? parseJson(registryPlaceholderWrite.stdout) : null

const checks = [
  check('PCP01', 'public channel publication record command exists', exists('scripts/record-public-channel-publication.mjs'), 'scripts/record-public-channel-publication.mjs'),
  check('PCP02', 'public channel publication template exists', exists('assets/templates/public-channel-publication-record.md') && template.includes('Channel type') && template.includes('Does this prove public registry publication?'), 'assets/templates/public-channel-publication-record.md'),
  check('PCP03', 'pending publication path remains writable without external proof', pending?.status === 0 && pendingData?.status === 'ready' && pendingData?.publicationStatus === 'pending' && pendingData?.evidenceStatus === 'pending', 'record-public-channel-publication pending dry-run'),
  check('PCP04', 'accepted registry path requires and accepts digest/publication evidence', registryOk?.status === 0 && registryOkData?.status === 'ready' && registryOkData?.channelType === 'package-registry' && registryOkData?.evidenceStatus === 'accepted', 'record-public-channel-publication package-registry dry-run'),
  check('PCP05', 'accepted marketplace path requires and accepts approval evidence', marketplaceOk?.status === 0 && marketplaceOkData?.status === 'ready' && marketplaceOkData?.channelType === 'marketplace' && marketplaceOkData?.evidenceStatus === 'accepted', 'record-public-channel-publication marketplace dry-run'),
  check('PCP06', 'accepted registry path rejects missing channel installability proof', registryMissingInstallability?.status !== 0 && registryMissingInstallabilityData?.status === 'failed' && registryMissingInstallabilityData?.errors?.some((item) => item.includes('--proves-channel-installability true')), 'record-public-channel-publication package-registry installability guard'),
  check('PCP07', 'accepted marketplace path rejects missing channel installability proof', marketplaceMissingInstallability?.status !== 0 && marketplaceMissingInstallabilityData?.status === 'failed' && marketplaceMissingInstallabilityData?.errors?.some((item) => item.includes('--proves-channel-installability true')), 'record-public-channel-publication marketplace installability guard'),
  check('PCP08', 'accepted publication rejects missing external evidence', acceptedMissing?.status !== 0 && acceptedMissingData?.status === 'failed' && acceptedMissingData?.errors?.some((item) => item.includes('--channel-url')) && acceptedMissingData?.errors?.some((item) => item.includes('--accepted-by')) && acceptedMissingData?.errors?.some((item) => item.includes('--evidence-status accepted')), 'record-public-channel-publication accepted missing-fields dry-run'),
  check('PCP09', 'accepted publication real write rejects placeholder or example evidence', registryPlaceholderWrite?.status !== 0 && registryPlaceholderWriteData?.status === 'failed' && registryPlaceholderWriteData?.errors?.some((item) => item.includes('not a placeholder')), 'record-public-channel-publication accepted placeholder write'),
  check('PCP10', 'public release docs reference channel publication evidence', publicRelease.includes('Public channel publication') && publicRelease.includes('record-public-channel-publication.mjs'), 'references/public-release.md'),
  check('PCP11', 'marketplace and packaging docs keep approval/publication external', marketplace.includes('Discovery metadata is not marketplace approval') && packaging.includes('It still does not publish GSE'), 'references/marketplace-discovery.md, references/packaging.md'),
  check('PCP12', 'final readiness matrix includes public channel publication record', finalReadiness.includes('Public channel publication record') && finalReadiness.includes('Public registry publication') && finalReadiness.includes('Marketplace approval'), 'references/final-readiness.md'),
  check('PCP13', 'consolidated validator includes public channel publication audit', validate.includes('audit-public-channel-publication.mjs'), 'scripts/validate-gse.mjs'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  fixtureRoot: fixture,
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    publicChannelPublication: failed === 0 ? 'verified' : 'failed',
    acceptedRegistryPublication: registryOkData?.status === 'ready' ? 'fixture-verified' : 'not-verified',
    acceptedMarketplaceApproval: marketplaceOkData?.status === 'ready' ? 'fixture-verified' : 'not-verified',
  },
  limits: [
    'This audit verifies record mechanics and guardrails for public channel publication evidence.',
    'It does not publish to a registry, approve a marketplace listing, or prove public installability.',
    'Accepted publication still requires real external evidence from the chosen channel.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Public Channel Publication Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- Public channel publication: ' + data.workflows.publicChannelPublication)
  lines.push('- Accepted registry publication path: ' + data.workflows.acceptedRegistryPublication)
  lines.push('- Accepted marketplace approval path: ' + data.workflows.acceptedMarketplaceApproval)
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
