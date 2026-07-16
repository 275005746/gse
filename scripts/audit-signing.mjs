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

function run(command, commandArgs, cwd = root) {
  const result = spawnSync(command, commandArgs, { cwd, encoding: 'utf8', windowsHide: true })
  return {
    command: [command, ...commandArgs].join(' '),
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

function parseJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

function check(id, label, ok, evidence, risk = '') {
  return { id, label, status: ok ? 'passed' : 'failed', evidence, risk }
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gse-signing-'))
const packageOut = path.join(tempRoot, 'package')
const installTarget = path.join(tempRoot, 'installed-gse')
const tamperedPackage = path.join(tempRoot, 'tampered-package')
const tamperedTarget = path.join(tempRoot, 'tampered-installed')
const privateKey = path.join(tempRoot, 'gse-private.pem')
const publicKey = path.join(tempRoot, 'gse-public.pem')

const packageRun = run(process.execPath, [
  path.join(root, 'scripts', 'package-gse.mjs'),
  '--root',
  root,
  '--out',
  packageOut,
  '--label',
  'gse-signing-audit',
  '--json',
])
const signRun = run(process.execPath, [
  path.join(root, 'scripts', 'sign-gse-package.mjs'),
  '--package',
  packageOut,
  '--private-key',
  privateKey,
  '--public-key',
  publicKey,
  '--generate-key',
  '--json',
])
const verifyRun = run(process.execPath, [
  path.join(root, 'scripts', 'verify-gse-package.mjs'),
  '--package',
  packageOut,
  '--public-key',
  publicKey,
  '--json',
])
const installRun = run(process.execPath, [
  path.join(root, 'scripts', 'install-gse.mjs'),
  '--source',
  packageOut,
  '--target',
  installTarget,
  '--public-key',
  publicKey,
  '--json',
])

fs.cpSync(packageOut, tamperedPackage, { recursive: true })
fs.appendFileSync(path.join(tamperedPackage, 'SKILL.md'), '\nTampered for signature audit.\n', 'utf8')
const tamperedVerify = run(process.execPath, [
  path.join(root, 'scripts', 'verify-gse-package.mjs'),
  '--package',
  tamperedPackage,
  '--public-key',
  publicKey,
  '--json',
])
const tamperedInstall = run(process.execPath, [
  path.join(root, 'scripts', 'install-gse.mjs'),
  '--source',
  tamperedPackage,
  '--target',
  tamperedTarget,
  '--public-key',
  publicKey,
  '--json',
])

const signData = parseJson(signRun.stdout)
const verifyData = parseJson(verifyRun.stdout)
const installData = parseJson(installRun.stdout)
const tamperedVerifyData = parseJson(tamperedVerify.stdout)
const tamperedInstallData = parseJson(tamperedInstall.stdout)

const checks = [
  check('SIGN01', 'package command succeeds', packageRun.status === 0, packageRun.command),
  check('SIGN02', 'sign command creates signature and keys', signRun.status === 0 && fs.existsSync(path.join(packageOut, 'gse-package-signature.json')) && fs.existsSync(publicKey), signRun.command),
  check('SIGN03', 'verify command accepts signed package', verifyRun.status === 0 && verifyData?.summary?.failed === 0, verifyRun.command),
  check('SIGN04', 'install command accepts signed package with public key', installRun.status === 0 && installData?.signature?.status === 'verified', installRun.command),
  check('SIGN05', 'tampered package fails signature/hash verification', tamperedVerify.status === 1 && tamperedVerifyData?.summary?.failed > 0, tamperedVerify.command),
  check('SIGN06', 'install command rejects tampered signed package', tamperedInstall.status === 1 && (tamperedInstallData?.signature?.status === 'failed' || tamperedInstallData?.summary?.integrityFailed > 0), tamperedInstall.command),
  check('SIGN07', 'signature uses Ed25519', signData?.algorithm === 'ed25519', 'sign-gse-package output'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  tempRoot,
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: {
    packageSigning: signRun.status === 0 ? 'verified' : 'failed',
    signatureVerification: verifyRun.status === 0 ? 'verified' : 'failed',
    signedInstall: installRun.status === 0 ? 'verified' : 'failed',
    tamperRejection: tamperedVerify.status === 1 && tamperedInstall.status === 1 ? 'verified' : 'failed',
  },
  commands: [packageRun.command, signRun.command, verifyRun.command, installRun.command, tamperedVerify.command, tamperedInstall.command],
  limits: [
    'This audit verifies local Ed25519 signing and verification mechanics.',
    'It does not prove public key custody, maintainer identity, transparency logs, or marketplace trust.',
  ],
  checks,
}

fs.rmSync(tempRoot, { recursive: true, force: true })

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))

if (failed > 0) process.exit(1)
