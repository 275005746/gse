#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { isPlaceholderEvidence } from './lib/evidence-placeholders.mjs'

const args = process.argv.slice(2)

function readArg(name, fallback = '') {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

function hasArg(name) {
  return args.includes(name)
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const jsonOnly = hasArg('--json')
const allowLocalFixture = hasArg('--allow-local-fixture')
const timeoutMs = Number(readArg('--timeout-ms', '5000'))

const inputs = [
  { area: 'Public repository settings', kind: 'url', flag: '--public-repo-url', value: readArg('--public-repo-url') },
  { area: 'Public security contact', kind: 'url', flag: '--security-contact-url', value: readArg('--security-contact-url') },
  { area: 'Public CI run', kind: 'url', flag: '--public-ci-run-url', value: readArg('--public-ci-run-url') },
  { area: 'Public registry publication', kind: 'url', flag: '--registry-package-url', value: readArg('--registry-package-url') },
  { area: 'Marketplace approval', kind: 'url', flag: '--marketplace-url', value: readArg('--marketplace-url') },
  { area: 'Native slash command', kind: 'evidence', flag: '--native-host-evidence', value: readArg('--native-host-evidence') },
  { area: 'Other host runtime invocation', kind: 'evidence', flag: '--other-host-evidence', value: readArg('--other-host-evidence') },
].filter((item) => String(item.value ?? '').trim())

function isLocalUrl(value) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')
  } catch {
    return false
  }
}

function isHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

async function probeUrl(value) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000)
  try {
    let response = await fetch(value, { method: 'HEAD', redirect: 'follow', signal: controller.signal })
    if (response.status === 405 || response.status === 403) {
      response = await fetch(value, { method: 'GET', redirect: 'follow', signal: controller.signal })
    }
    return {
      reachable: response.status >= 200 && response.status < 500,
      statusCode: response.status,
      finalUrl: response.url,
    }
  } catch (error) {
    return {
      reachable: false,
      error: error?.name === 'AbortError' ? 'timeout' : String(error?.message ?? error),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function probeEvidence(value) {
  if (isHttpUrl(value)) return null
  const fullPath = path.isAbsolute(value) ? value : path.resolve(root, value)
  return {
    reachable: fs.existsSync(fullPath),
    path: fullPath,
    type: fs.existsSync(fullPath) ? 'file' : 'missing',
  }
}

const probes = []
for (const item of inputs) {
  const placeholder = isPlaceholderEvidence(item.value)
  const local = isLocalUrl(item.value)
  const errors = []
  if (placeholder && !(allowLocalFixture && local)) errors.push(`${item.flag} must be real public evidence, not a placeholder, fixture, local, or example value`)
  if (item.kind === 'url' && !isHttpUrl(item.value)) errors.push(`${item.flag} must be an http or https URL`)
  if (item.kind === 'url' && local && !allowLocalFixture) errors.push(`${item.flag} must not be local evidence`)
  if (item.kind === 'evidence' && !isHttpUrl(item.value) && !fs.existsSync(path.isAbsolute(item.value) ? item.value : path.resolve(root, item.value))) {
    errors.push(`${item.flag} must be an http/https URL or an existing evidence file`)
  }
  probes.push({ ...item, placeholder, local, errors })
}

for (const probe of probes) {
  if (probe.errors.length) continue
  if (probe.kind === 'url' || isHttpUrl(probe.value)) {
    probe.network = await probeUrl(probe.value)
    if (!probe.network.reachable) probe.errors.push(`${probe.flag} is not reachable`)
  } else {
    probe.file = probeEvidence(probe.value)
    if (!probe.file.reachable) probe.errors.push(`${probe.flag} evidence file is not reachable`)
  }
}

const failed = probes.filter((item) => item.errors.length > 0).length
const ready = probes.length > 0 && failed === 0
const report = {
  root,
  generatedAt: new Date().toISOString(),
  status: probes.length === 0 ? 'waiting-for-input' : ready ? 'ready' : 'failed',
  summary: {
    checked: probes.length,
    ready: probes.length - failed,
    failed,
    allowLocalFixture,
  },
  probes: probes.map((item) => ({
    area: item.area,
    flag: item.flag,
    kind: item.kind,
    value: item.value,
    placeholder: item.placeholder,
    local: item.local,
    status: item.errors.length === 0 ? 'ready' : 'failed',
    network: item.network,
    file: item.file,
    errors: item.errors,
  })),
  limits: [
    'This probe checks supplied owner/external evidence locations before record creation.',
    'It does not publish GSE, configure repository settings, approve marketplace listings, or mark final readiness accepted.',
    'Accepted gates still require the matching record script and final readiness promotion.',
  ],
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# GSE Public External Gate Probe')
  lines.push('')
  lines.push('Generated: ' + data.generatedAt)
  lines.push('Status: ' + data.status)
  lines.push('')
  lines.push('## Probes')
  lines.push('')
  if (data.probes.length === 0) lines.push('- No evidence inputs supplied.')
  for (const probe of data.probes) {
    lines.push('- ' + probe.area + ': ' + probe.status + ' (' + probe.flag + ')')
    if (probe.network) lines.push('  - HTTP status: ' + probe.network.statusCode)
    if (probe.file) lines.push('  - File: ' + probe.file.path)
    for (const error of probe.errors) lines.push('  - Error: ' + error)
  }
  lines.push('')
  lines.push('## Limits')
  lines.push('')
  for (const item of data.limits) lines.push('- ' + item)
  return lines.join('\n') + '\n'
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(renderMarkdown(report))

if (report.status === 'failed') process.exit(1)
