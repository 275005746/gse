#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const packageDir = path.resolve(readArg('--package', process.cwd()))
const privateKeyPath = path.resolve(readArg('--private-key', path.join(packageDir, 'gse-signing-private.pem')))
const publicKeyPath = path.resolve(readArg('--public-key', path.join(packageDir, 'gse-signing-public.pem')))
const out = path.resolve(readArg('--out', path.join(packageDir, 'gse-package-signature.json')))
const generateKey = args.includes('--generate-key')
const jsonOnly = args.includes('--json')

function fail(message) {
  console.error(JSON.stringify({ packageDir, status: 'failed', error: message }, null, 2))
  process.exit(1)
}

function readManifest() {
  const manifestPath = path.join(packageDir, 'gse-package-manifest.json')
  if (!fs.existsSync(manifestPath)) fail('Missing gse-package-manifest.json.')
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''))
}

function fingerprint(pem) {
  return crypto.createHash('sha256').update(pem).digest('hex')
}

if (generateKey && (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath))) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
  fs.mkdirSync(path.dirname(privateKeyPath), { recursive: true })
  fs.writeFileSync(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), 'utf8')
  fs.writeFileSync(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }), 'utf8')
}

if (!fs.existsSync(privateKeyPath)) fail('Missing --private-key. Use --generate-key for local audit keys.')
if (!fs.existsSync(publicKeyPath)) fail('Missing --public-key. Use --generate-key for local audit keys.')

const manifest = readManifest()
if (!manifest?.integrity?.packageDigest) fail('Manifest is missing integrity.packageDigest.')

const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8')
const publicKeyPem = fs.readFileSync(publicKeyPath, 'utf8')
const payload = {
  schemaVersion: 1,
  packageName: manifest.packageName,
  label: manifest.label,
  fileCount: manifest.fileCount,
  packageDigest: manifest.integrity.packageDigest,
}
const payloadText = JSON.stringify(payload)
const signature = crypto.sign(null, Buffer.from(payloadText), privateKeyPem).toString('base64')
const signatureRecord = {
  schemaVersion: 1,
  algorithm: 'ed25519',
  signedAt: new Date().toISOString(),
  publicKeyFingerprint: fingerprint(publicKeyPem),
  payload,
  signature,
}

fs.writeFileSync(out, JSON.stringify(signatureRecord, null, 2) + '\n', 'utf8')

const report = {
  packageDir,
  privateKey: privateKeyPath,
  publicKey: publicKeyPath,
  signature: out,
  status: 'signed',
  algorithm: 'ed25519',
  publicKeyFingerprint: signatureRecord.publicKeyFingerprint,
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(JSON.stringify(report, null, 2))

