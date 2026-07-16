#!/usr/bin/env node
import fs from 'node:fs'
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

function readJson(relativePath) {
  const fullPath = path.join(root, relativePath)
  if (!fs.existsSync(fullPath)) return null
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  return {
    command: [command, ...commandArgs].join(' '),
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

function npm(commandArgs) {
  return process.platform === 'win32'
    ? run('cmd', ['/c', 'npm', ...commandArgs])
    : run('npm', commandArgs)
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

const pkg = readJson('package.json')
const repositoryUrl = typeof pkg?.repository === 'string' ? pkg.repository : pkg?.repository?.url
const expectedRepositoryUrls = new Set([
  'git+https://github.com/275005746/gse.git',
  'https://github.com/275005746/gse.git',
  'https://github.com/275005746/gse',
])
const publishRun = npm(['publish', '--dry-run', '--json'])
const publishData = parseJson(publishRun.stdout)
const usablePublishData = publishData?.name && publishData?.version ? publishData : null
const alreadyPublished = publishRun.status !== 0 && /previously published versions/i.test(publishRun.stderr)
const registryViewRun = alreadyPublished && pkg?.name && pkg?.version
  ? npm(['view', `${pkg.name}@${pkg.version}`, '--json'])
  : null
const registryViewData = registryViewRun ? parseJson(registryViewRun.stdout) : null
const packRun = npm(['pack', '--dry-run', '--json'])
const packData = parseJson(packRun.stdout)
const packEntry = Array.isArray(packData) ? packData[0] : null
const publishFiles = new Set(((usablePublishData?.files ?? packEntry?.files) ?? []).map((item) => item.path))
const effectiveData = usablePublishData ?? (registryViewData
  ? {
      id: `${registryViewData.name}@${registryViewData.version}`,
      name: registryViewData.name,
      version: registryViewData.version,
      filename: registryViewData.dist?.tarball ? path.basename(registryViewData.dist.tarball) : undefined,
      size: packEntry?.size,
      unpackedSize: packEntry?.unpackedSize,
      files: packEntry?.files,
      shasum: registryViewData.dist?.shasum,
      integrity: registryViewData.dist?.integrity,
    }
  : null)
const harmfulWarnings = [
  /auto-corrected some errors/i,
  /errors corrected/i,
  /invalid and removed/i,
  /empty "bin" was removed/i,
  /bin\[.*\].*removed/i,
]
const allowedWarnings = [
  /requires you to be logged in/i,
  /Publishing to .* \(dry-run\)/i,
]
const warningLines = publishRun.stderr
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
const unexpectedWarningLines = warningLines.filter((line) => {
  if (!/^npm (warn|notice)\b/i.test(line)) return false
  if (harmfulWarnings.some((pattern) => pattern.test(line))) return true
  return !allowedWarnings.some((pattern) => pattern.test(line))
})

const requiredPublishFiles = [
  'package.json',
  'SKILL.md',
  'README.md',
  'README.zh-CN.md',
  'LICENSE',
  'scripts/gse.mjs',
  'scripts/validate-gse.mjs',
  'scripts/audit-npm-publish-dry-run.mjs',
  'references/commands.md',
  'references/packaging.md',
]

const checks = [
  check('NPD01', 'npm publish dry-run command succeeds or published version is registry-verifiable', (publishRun.status === 0 && Boolean(usablePublishData)) || (alreadyPublished && registryViewRun?.status === 0 && Boolean(registryViewData)), alreadyPublished ? `${publishRun.command}; ${registryViewRun?.command ?? 'npm view not run'}` : publishRun.command, publishRun.stderr),
  check('NPD02', 'publish target resolves to the expected package identity', effectiveData?.name === pkg?.name && effectiveData?.version === pkg?.version && effectiveData?.id === `${pkg?.name}@${pkg?.version}`, effectiveData ? `${effectiveData.id}` : 'missing publish dry-run or registry JSON'),
  check('NPD03', 'publish dry-run preserves CLI package metadata before publication', pkg?.bin?.gse === 'scripts/gse.mjs' && fs.existsSync(path.join(root, 'scripts', 'gse.mjs')), 'bin.gse=' + (pkg?.bin?.gse ?? 'missing')),
  check('NPD04', 'publish package includes required runtime files', packRun.status === 0 && requiredPublishFiles.every((item) => publishFiles.has(item)), requiredPublishFiles.filter((item) => !publishFiles.has(item)).join(', ') || 'all required publish files present'),
  check('NPD05', 'publish or registry metadata reports tarball integrity fields', typeof effectiveData?.shasum === 'string' && typeof effectiveData?.integrity === 'string' && effectiveData.integrity.startsWith('sha512-'), 'shasum and integrity'),
  check('NPD06', 'publish dry-run does not auto-correct or remove package metadata', unexpectedWarningLines.length === 0, unexpectedWarningLines.join(' | ') || 'no harmful npm warnings'),
  check('NPD07', 'package metadata points at the public GSE repository without publishConfig overrides', !pkg?.publishConfig && expectedRepositoryUrls.has(repositoryUrl), 'repository=' + (repositoryUrl ?? 'missing') + ', publishConfig=' + (pkg?.publishConfig ? 'present' : 'absent')),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    npmPublishDryRun: failed === 0 ? 'verified' : 'failed',
    registryPublication: alreadyPublished && registryViewData ? 'published' : 'not-published',
  },
  publish: effectiveData
    ? {
        id: effectiveData.id,
        name: effectiveData.name,
        version: effectiveData.version,
        filename: effectiveData.filename,
        size: effectiveData.size,
        unpackedSize: effectiveData.unpackedSize,
        fileCount: effectiveData.files?.length ?? 0,
        integrity: effectiveData.integrity,
      }
    : null,
  warnings: warningLines,
  commands: [publishRun.command],
  limits: [
    'This audit verifies npm publish dry-run metadata only.',
    'It does not publish GSE, reserve the package name, prove npm ownership, or create public registry evidence.',
    'The npm login warning is allowed for dry-run; metadata auto-correction warnings are not allowed.',
  ],
  checks,
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE npm Publish Dry-Run Audit')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Root: ' + data.root)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('- Status: ' + data.summary.status)
  lines.push('- Checks: ' + data.summary.passed + '/' + data.summary.total)
  lines.push('- npm publish dry-run: ' + data.workflows.npmPublishDryRun)
  lines.push('- Registry publication: ' + data.workflows.registryPublication)
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
