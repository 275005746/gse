#!/usr/bin/env node
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const jsonOnly = args.includes('--json')
const profile = readArg('--profile', 'full')
if (!['smoke', 'full'].includes(profile)) {
  console.error('Unsupported --profile. Expected smoke or full.')
  process.exit(1)
}
const smokeProfile = profile === 'smoke'

function run(command, commandArgs, cwd = root) {
  const result = spawnSync(command, commandArgs, {
    cwd,
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

function runAsync(command, commandArgs, cwd = root) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, { cwd, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8') })
    child.on('close', (status) => {
      resolve({
        command: [command, ...commandArgs].join(' '),
        status: status ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      })
    })
  })
}

function parseJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

function skipped(id, label, evidence, risk = '') {
  return { id, label, status: 'skipped', evidence, risk }
}

function runInstalledPackageValidation(target) {
  const validationCommands = [
    ['audit-gse.mjs', ['--root', target, '--json']],
    ['audit-project.mjs', ['--root', target, '--json']],
    ['audit-fixtures.mjs', ['--root', target, '--json']],
    ['audit-commands.mjs', ['--root', target, '--json']],
    ['audit-command-execution.mjs', ['--root', target, '--profile', 'lite', '--json']],
    ['audit-readme-docs.mjs', ['--root', target, '--json']],
    ['audit-marketplace-discovery.mjs', ['--root', target, '--json']],
    ['generate-session-prompt.mjs', ['--root', target, '--json']],
  ]
  const results = validationCommands.map(([script, commandArgs]) => {
    const result = run(process.execPath, [path.join(target, 'scripts', script), ...commandArgs], target)
    const parsed = parseJson(result.stdout)
    const failed = parsed?.summary?.failed
    const ok = result.status === 0 || failed === 0
    return {
      script,
      command: result.command,
      status: result.status,
      ok,
      summary: parsed?.summary ?? null,
      stderr: result.stderr,
    }
  })
  const passed = results.filter((item) => item.ok).length
  const failed = results.length - passed
  return {
    command: 'remote installed package validation: ' + validationCommands.map(([script]) => script).join(', '),
    status: failed === 0 ? 0 : 1,
    stdout: JSON.stringify({
      summary: {
        status: failed === 0 ? 'passed' : 'failed',
        passed,
        failed,
        total: results.length,
      },
      results,
      limits: [
        'Installed-package validation checks portable skill structure, bootstrap fixtures, command semantics, lite command execution, README docs, marketplace metadata, and session prompt generation.',
        'It intentionally excludes source-workspace-only roadmap, long evidence logs, repository governance files, release-bundle cache, and owner/external acceptance artifacts.',
      ],
    }),
    stderr: results.filter((item) => !item.ok).map((item) => item.script + ': ' + item.stderr).filter(Boolean).join('\n'),
  }
}

function contentType(filePath) {
  if (filePath.endsWith('.json')) return 'application/json'
  if (filePath.endsWith('.md')) return 'text/markdown; charset=utf-8'
  if (filePath.endsWith('.mjs')) return 'text/javascript; charset=utf-8'
  return 'application/octet-stream'
}

function createStaticServer(baseDir) {
  const server = http.createServer((request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, '')) || 'gse-package-manifest.json'
      const fullPath = path.resolve(baseDir, relativePath)
      if (!fullPath.startsWith(path.resolve(baseDir))) {
        response.writeHead(403)
        response.end('Forbidden')
        return
      }
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        response.writeHead(404)
        response.end('Not found')
        return
      }
      response.writeHead(200, { 'content-type': contentType(fullPath) })
      fs.createReadStream(fullPath).pipe(response)
    } catch (error) {
      response.writeHead(500)
      response.end(error instanceof Error ? error.message : String(error))
    }
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}/` })
    })
  })
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-remote-distribution-'))
const packageOut = path.join(tempRoot, 'package')
const installTarget = path.join(tempRoot, 'installed-gse')
const tamperedTarget = path.join(tempRoot, 'tampered-install')

const packageRun = run(process.execPath, [
  path.join(root, 'scripts', 'package-gse.mjs'),
  '--root',
  root,
  '--out',
  packageOut,
  '--label',
  'gse-remote-audit',
  '--json',
])
const packageData = parseJson(packageRun.stdout)

const manifestPath = path.join(packageOut, 'gse-package-manifest.json')
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null

let server
let baseUrl = ''
let remoteInstall = { status: 1, command: 'not-run', stdout: '', stderr: '' }
let installedValidate = { status: 1, command: 'not-run', stdout: '', stderr: '' }
let installedCli = { status: 1, command: 'not-run', stdout: '', stderr: '' }
let tamperedInstall = { status: 1, command: 'not-run', stdout: '', stderr: '' }

try {
  const started = await createStaticServer(packageOut)
  server = started.server
  baseUrl = started.baseUrl
  remoteInstall = await runAsync(process.execPath, [
    path.join(root, 'scripts', 'install-gse.mjs'),
    '--source-url',
    baseUrl,
    '--target',
    installTarget,
    '--json',
  ])
  installedValidate = smokeProfile
    ? { status: 0, command: 'skipped by --profile smoke', stdout: '', stderr: '' }
    : runInstalledPackageValidation(installTarget)
  installedCli = await runAsync(process.execPath, [
    path.join(installTarget, 'scripts', 'gse.mjs'),
    'status',
    '--target',
    installTarget,
    '--json',
  ], installTarget)

  fs.appendFileSync(path.join(packageOut, 'README.md'), '\nTampered for integrity audit.\n', 'utf8')
  tamperedInstall = await runAsync(process.execPath, [
    path.join(root, 'scripts', 'install-gse.mjs'),
    '--source-url',
    baseUrl,
    '--target',
    tamperedTarget,
    '--json',
  ])
} finally {
  if (server) await new Promise((resolve) => server.close(resolve))
}

const remoteInstallData = parseJson(remoteInstall.stdout)
const installedValidateData = parseJson(installedValidate.stdout)
const installedCliData = parseJson(installedCli.stdout)
const tamperedInstallData = parseJson(tamperedInstall.stdout)

const checks = [
  check('RD01', 'package manifest includes sha256 file hashes', packageRun.status === 0 && manifest?.integrity?.algorithm === 'sha256' && manifest?.fileHashes?.['SKILL.md'], 'gse-package-manifest.json'),
  check('RD02', 'HTTP package source served manifest and files', Boolean(baseUrl) && remoteInstall.status === 0, baseUrl),
  check('RD03', 'install-gse supports --source-url', remoteInstall.status === 0 && remoteInstallData?.sourceMode === 'http-url', remoteInstall.command),
  check('RD04', 'remote install validates file integrity', remoteInstall.status === 0 && remoteInstallData?.summary?.integrityFailed === 0 && remoteInstallData?.integrity?.algorithm === 'sha256', 'install summary integrity'),
  smokeProfile
    ? skipped('RD05', 'remote installed copy validates', installedValidate.command, 'Run --profile full for remote installed-copy validation.')
    : check('RD05', 'remote installed copy validates', installedValidate.status === 0 && installedValidateData?.summary?.failed === 0, installedValidate.command),
  check('RD06', 'remote installed short CLI wrapper runs status command', installedCli.status === 0 && installedCliData?.command === '/gse status' && installedCliData?.project?.stateValid === true, installedCli.command),
  check('RD07', 'tampered remote package fails integrity gate', tamperedInstall.status === 1 && tamperedInstallData?.summary?.integrityFailed > 0, 'tampered README.md install'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const skippedCount = checks.filter((item) => item.status === 'skipped').length
const failed = checks.filter((item) => item.status === 'failed').length
const report = {
  root,
  generatedAt: new Date().toISOString(),
  tempRoot,
  baseUrl,
  profile,
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, skipped: skippedCount, total: checks.length },
  workflows: {
    remoteInstall: remoteInstall.status === 0 ? 'verified' : 'failed',
    integrityGate: tamperedInstall.status === 1 ? 'verified' : 'failed',
    installedValidation: smokeProfile ? 'skipped' : installedValidate.status === 0 ? 'verified' : 'failed',
    installedCli: installedCli.status === 0 ? 'verified' : 'failed',
  },
  commands: [packageRun.command, remoteInstall.command, installedValidate.command, installedCli.command, tamperedInstall.command],
  limits: [
    'This audit verifies HTTP URL install through a local ephemeral server and manifest integrity checks.',
    'Use --profile smoke for routine remote install, CLI, and integrity checks; use --profile full before release or when installed-copy validation matters.',
    'Installed-package validation intentionally excludes source-workspace-only roadmap, long evidence logs, release-bundle cache, and owner/external acceptance artifacts.',
    'It does not publish to a public registry, verify marketplace discovery, or sign artifacts with a trusted key.',
  ],
  checks,
}

fs.rmSync(tempRoot, { recursive: true, force: true })

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))

if (failed > 0) process.exit(1)
