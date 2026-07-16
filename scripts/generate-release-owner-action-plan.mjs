#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

function hasArg(name) {
  return args.includes(name)
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const manifestPath = path.resolve(readArg('--manifest', path.join(root, '.gse', 'acceptance', 'release-status-manifest.json')))
const out = path.resolve(readArg('--out', path.join(root, '.gse', 'acceptance', 'release-owner-action-plan.md')))
const jsonOnly = hasArg('--json')
const dryRun = hasArg('--dry-run')
const force = hasArg('--force')

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) throw new Error(`${label} does not exist: ${filePath}`)
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`)
  }
}

function groupByOwner(gates) {
  const order = [
    'project owner',
    'repository owner',
    'external CI',
    'external registry',
    'external marketplace',
    'host runtime',
  ]
  const groups = new Map()
  for (const gate of gates) {
    const owner = gate.owner || 'unknown owner'
    if (!groups.has(owner)) groups.set(owner, [])
    groups.get(owner).push(gate)
  }
  return [...groups.entries()].sort((a, b) => {
    const ai = order.indexOf(a[0])
    const bi = order.indexOf(b[0])
    if (ai === -1 && bi === -1) return a[0].localeCompare(b[0])
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

function ownerDisplay(owner) {
  const labels = {
    'project owner': 'Project Owner',
    'repository owner': 'Repository Owner',
    'external CI': 'External CI',
    'external registry': 'External Registry',
    'external marketplace': 'External Marketplace',
    'host runtime': 'Host Runtime',
  }
  return labels[owner] ?? owner
}

function render(manifest) {
  const pendingGates = manifest.publicAcceptance?.pendingGates ?? []
  const groups = groupByOwner(pendingGates)
  const lines = []
  lines.push('# GSE Release Owner Action Plan')
  lines.push('')
  lines.push('Generated: ' + new Date().toISOString())
  lines.push('Source manifest: `.gse/acceptance/release-status-manifest.json`')
  lines.push('')
  lines.push('## Current Status')
  lines.push('')
  lines.push('- Public accepted: ' + (manifest.publicAcceptance?.publicAccepted ?? manifest.claimBoundary?.publicAccepted ?? 'unknown'))
  lines.push('- Verified rows: ' + (manifest.readiness?.verified?.length ?? 0))
  lines.push('- Owner-required rows: ' + (manifest.readiness?.ownerRequired?.length ?? 0))
  lines.push('- External-required rows: ' + (manifest.readiness?.externalRequired?.length ?? 0))
  lines.push('- Native slash-command records: ' + (manifest.hostRuntime?.nativeSlashCommandRecords ?? 'unknown'))
  lines.push('- Portable text-command records: ' + (manifest.hostRuntime?.portableTextCommandRecords ?? 'unknown'))
  lines.push('')
  lines.push('## Claim Boundary')
  lines.push('')
  lines.push('- Local validation does not mean public acceptance.')
  lines.push('- Portable command execution is the GSE core command path.')
  lines.push('- Native slash-command support requires a real host invocation record only when a host adapter claims it.')
  lines.push('- Owner and external gates must be recorded with accepted evidence before GSE can claim accepted public release readiness.')
  lines.push('')
  lines.push('## Action Groups')
  lines.push('')
  if (groups.length === 0) {
    lines.push('No pending owner or external gates were reported by the manifest.')
    lines.push('')
  }
  for (const [owner, gates] of groups) {
    lines.push('### ' + ownerDisplay(owner))
    lines.push('')
    for (const gate of gates) {
      lines.push('#### ' + gate.area)
      lines.push('')
      lines.push('- Status: ' + gate.status)
      lines.push('- Current evidence: ' + gate.currentEvidence)
      lines.push('- Required evidence: ' + gate.requiredEvidence)
      lines.push('- Record command:')
      lines.push('')
      lines.push('```text')
      lines.push(gate.recordCommand)
      lines.push('```')
      lines.push('')
      lines.push('- Preflight command:')
      lines.push('')
      lines.push('```text')
      lines.push(gate.preflightCommand ?? `${gate.recordCommand} --dry-run --json`)
      lines.push('```')
      lines.push('')
    }
  }
  lines.push('## Verification After Actions')
  lines.push('')
  for (const command of manifest.verificationCommands ?? []) {
    lines.push('- `' + command + '`')
  }
  lines.push('- `node scripts/generate-release-status-manifest.mjs --root __GSE__ --out __GSE__/.gse/acceptance/release-status-manifest.json --force --json`')
  lines.push('- `node scripts/generate-release-owner-action-plan.mjs --root __GSE__ --force --json`')
  lines.push('- `node scripts/audit-release-owner-action-plan.mjs --root __GSE__ --json`')
  lines.push('')
  lines.push('## Limits')
  lines.push('')
  lines.push('- This plan is generated from the current release status manifest.')
  lines.push('- It does not select a license, publish a package, configure a repository, run public CI, approve a marketplace listing, or prove optional host-native slash-command support.')
  return lines.join('\n') + '\n'
}

let manifest
let content
try {
  manifest = readJson(manifestPath, 'release status manifest')
  content = render(manifest)
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', root, manifest: manifestPath, out, error: error.message }, null, 2))
  process.exit(1)
}

if (!dryRun) {
  if (fs.existsSync(out) && !force) {
    console.error(JSON.stringify({ status: 'exists', root, manifest: manifestPath, out, error: 'output exists; pass --force to overwrite' }, null, 2))
    process.exit(1)
  }
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, content, 'utf8')
}

const report = {
  status: dryRun ? 'ready' : 'written',
  root,
  manifest: manifestPath,
  out,
  dryRun,
  summary: {
    publicAccepted: manifest.publicAcceptance?.publicAccepted ?? manifest.claimBoundary?.publicAccepted ?? 'unknown',
    actionGroups: groupByOwner(manifest.publicAcceptance?.pendingGates ?? []).length,
    pendingGates: manifest.publicAcceptance?.pendingGates?.length ?? 0,
  },
}

if (jsonOnly) console.log(JSON.stringify(report, null, 2))
else console.log(content)
