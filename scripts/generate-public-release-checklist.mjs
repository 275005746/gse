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

function hasArg(name) {
  return args.includes(name)
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const out = path.resolve(readArg('--out', path.join(root, '.gse', 'acceptance', 'public-release-checklist.md')))
const manifestPath = path.resolve(readArg('--manifest', path.join(root, '.gse', 'acceptance', 'release-status-manifest.json')))
const displayRoot = readArg('--display-root', '<gse-root>')
const jsonOnly = hasArg('--json')
const dryRun = hasArg('--dry-run')
const force = hasArg('--force')

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
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

function parseJson(text, label) {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`)
  }
}

function readManifest() {
  if (!fs.existsSync(manifestPath)) {
    const generated = run(process.execPath, [
      path.join(root, 'scripts', 'generate-release-status-manifest.mjs'),
      '--root', root,
      '--out', manifestPath,
      '--force',
      '--json',
    ])
    if (generated.status !== 0) {
      throw new Error(`release status manifest generation failed: ${generated.stderr || generated.stdout}`)
    }
  }
  return parseJson(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''), 'release status manifest')
}

function gateByArea(gates, area) {
  return gates.find((gate) => gate.area === area)
}

function safeCommand(command) {
  return (command ?? '').replaceAll('__GSE__', displayRoot)
}

function renderCommandBlock(command) {
  return ['```text', safeCommand(command), '```']
}

function renderPhase(lines, number, title, gate, actions) {
  lines.push(`### ${number}. ${title}`)
  lines.push('')
  if (gate) {
    lines.push(`- Gate: ${gate.area}`)
    lines.push(`- Status: ${gate.status}`)
    lines.push(`- Required evidence: ${gate.requiredEvidence}`)
  } else {
    lines.push('- Gate: local preparation')
    lines.push('- Status: verified locally before public handoff')
  }
  for (const action of actions) lines.push(`- ${action}`)
  if (gate?.preflightCommand) {
    lines.push('')
    lines.push('Preflight:')
    lines.push('')
    lines.push(...renderCommandBlock(gate.preflightCommand))
  }
  if (gate?.recordCommand) {
    lines.push('')
    lines.push('Record accepted evidence:')
    lines.push('')
    lines.push(...renderCommandBlock(gate.recordCommand))
  }
  lines.push('')
}

function render(manifest) {
  const gates = manifest.publicAcceptance?.pendingGates ?? []
  const lines = []
  lines.push('# GSE Public Release Checklist')
  lines.push('')
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push('Source manifest: `.gse/acceptance/release-status-manifest.json`')
  lines.push('')
  lines.push('## Boundary')
  lines.push('')
  lines.push(`- Public accepted: ${manifest.publicAcceptance?.publicAccepted ?? manifest.claimBoundary?.publicAccepted ?? 'unknown'}`)
  lines.push(`- Pending owner/external gates: ${gates.length}`)
  lines.push('- This checklist is an execution runway. It does not publish, approve, or accept a release by itself.')
  lines.push('- A gate is complete only after real accepted evidence is recorded and final readiness is re-audited.')
  lines.push('')
  lines.push('## Runway')
  lines.push('')
  renderPhase(lines, '01', 'Prepare the release bundle', null, [
    'Run `/gse release` as a dry-run before writing a bundle.',
    'Run `/gse release --execute --out <bundle>` only for the bundle that will be handed off.',
    'Keep `npm publish --dry-run`, tarball install, checksum, provenance, and signing evidence attached to the bundle.',
  ])
  renderPhase(lines, '02', 'Publish and configure the public repository', gateByArea(gates, 'Public repository settings'), [
    'Create or update the public repository.',
    'Enable issues, pull requests, visible security policy, branch protection, required checks, review before merge, conversation resolution, force-push restriction, and deletion restriction.',
  ])
  renderPhase(lines, '03', 'Approve the public security contact', gateByArea(gates, 'Public security contact'), [
    'Choose the owner-approved vulnerability disclosure path.',
    'Make the contact public and ensure the security policy points to it.',
  ])
  renderPhase(lines, '04', 'Run public CI on the release commit', gateByArea(gates, 'Public CI run'), [
    'Run the public workflow on the release commit.',
    'Record the public run URL, commit SHA, branch, required checks, and successful conclusion.',
  ])
  renderPhase(lines, '05', 'Publish the registry package', gateByArea(gates, 'Public registry publication'), [
    'Publish only after the public repository and CI evidence are available.',
    'Record package URL, version, artifact digest, publication date, and installability proof.',
  ])
  renderPhase(lines, '06', 'Publish or submit marketplace listing', gateByArea(gates, 'Marketplace approval'), [
    'Submit the marketplace/catalog listing after registry or package installability is proven.',
    'Record listing URL, approval/publication status, review date, version, and installability proof.',
  ])
  renderPhase(lines, '07', 'Record native slash-command evidence', gateByArea(gates, 'Native slash command'), [
    'Use a real host runtime that supports native slash commands.',
    'Record transcript, screenshot, host log, or equivalent proof that does not rely on portable text routing.',
  ])
  renderPhase(lines, '08', 'Record other host runtime invocation evidence', gateByArea(gates, 'Other host runtime invocation'), [
    'Use each claimed non-native host runtime directly.',
    'Record accepted evidence without generated-pointer-only proof.',
  ])
  lines.push('## Final Verification')
  lines.push('')
  lines.push('- `node scripts/run-gse-command.mjs --root ' + displayRoot + ' --target ' + displayRoot + ' --command "/gse probe --public-repo-url __PUBLIC_REPO_URL__ --security-contact-url __SECURITY_CONTACT_URL__ --public-ci-run-url __PUBLIC_CI_RUN_URL__ --registry-package-url __REGISTRY_PACKAGE_URL__ --marketplace-url __MARKETPLACE_LISTING_URL__ --native-host-evidence __NATIVE_HOST_EVIDENCE__ --other-host-evidence __OTHER_HOST_EVIDENCE__" --json`')
  for (const command of manifest.verificationCommands ?? []) {
    lines.push('- `' + safeCommand(command) + '`')
  }
  lines.push('- `node scripts/audit-public-acceptance-readiness.mjs --root ' + displayRoot + ' --json`')
  lines.push('- `node scripts/audit-final-readiness.mjs --root ' + displayRoot + ' --json`')
  lines.push('- `node scripts/audit-release-bundle.mjs --root ' + displayRoot + ' --json`')
  lines.push('')
  lines.push('## Stop Conditions')
  lines.push('')
  lines.push('- Stop if any evidence value is a placeholder, local path, example URL, or private-only URL.')
  lines.push('- Stop if public CI did not run against the release commit.')
  lines.push('- Stop if a host invocation only proves generated pointer files or portable text routing while claiming native slash-command support.')
  lines.push('- Stop if public acceptance is still `not-accepted` after recording evidence; rerun the readiness doctor and fix the named gate.')
  lines.push('')
  return lines.join('\n')
}

let status = 'written'
let errors = []
let checklist = ''
try {
  const manifest = readManifest()
  checklist = render(manifest)
  if (!dryRun) {
    if (fs.existsSync(out) && !force) throw new Error(`output already exists, use --force: ${out}`)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, checklist, 'utf8')
  } else {
    status = 'ready'
  }
} catch (error) {
  status = 'failed'
  errors = [error.message]
}

const report = {
  root,
  out,
  manifest: manifestPath,
  dryRun,
  status,
  errors,
  publicReleaseChecklist: status === 'failed' ? 'failed' : dryRun ? 'ready' : 'written',
}

if (jsonOnly) {
  console.log(JSON.stringify(report, null, 2))
} else if (status === 'failed') {
  console.error(errors.join('\n'))
}

process.exit(status === 'failed' ? 1 : 0)
