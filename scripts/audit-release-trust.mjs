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

const trust = read('references/release-trust.md')
const template = read('assets/templates/release-trust-record.md')
const packaging = read('references/packaging.md')
const validate = read('scripts/validate-gse.mjs')

const checks = [
  check('TRUST01', 'release trust reference exists', exists('references/release-trust.md'), 'references/release-trust.md'),
  check('TRUST02', 'release trust template exists', exists('assets/templates/release-trust-record.md'), 'assets/templates/release-trust-record.md'),
  check('TRUST03', 'trust reference separates signed verified trusted', ['signed', 'verified', 'trusted', 'Do not claim `trusted` from signing alone.'].every((term) => trust.includes(term)), 'references/release-trust.md'),
  check('TRUST04', 'trust reference defines key custody and revocation', ['Key custody', 'Rotation policy', 'Revocation path', 'Do not commit private keys'].every((term) => trust.includes(term)), 'references/release-trust.md'),
  check('TRUST05', 'template captures owner acceptance and public key fingerprint', ['Public key fingerprint', 'Accepted by', 'Private key location', 'Verification command'].every((term) => template.includes(term)), 'release-trust-record.md'),
  check('TRUST06', 'packaging routes readers to signing and trust rules', packaging.includes('Signing And Verification') && packaging.includes('Release Trust'), 'references/packaging.md'),
  check('TRUST07', 'validator includes release trust audit', validate.includes('audit-release-trust.mjs'), 'scripts/validate-gse.mjs'),
]

const passed = checks.filter((item) => item.status === 'passed').length
const failed = checks.length - passed
const report = {
  root,
  generatedAt: new Date().toISOString(),
  summary: { status: failed === 0 ? 'passed' : 'failed', passed, failed, total: checks.length },
  workflows: { releaseTrustPolicy: failed === 0 ? 'verified' : 'failed' },
  limits: [
    'This audit verifies release trust policy and template coverage.',
    'It does not prove a real maintainer identity, key custody event, marketplace approval, or production release acceptance.',
  ],
  checks,
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))

if (failed > 0) process.exit(1)

