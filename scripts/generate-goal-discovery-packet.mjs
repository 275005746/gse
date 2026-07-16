#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1] ?? fallback
}

function slug(value, fallback = 'goal-discovery') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || fallback
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
}

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '') : ''
}

function explicitConstraints(intent) {
  const rules = [
    { pattern: /(?:within|in)\s+([0-9]+\s+(?:day|days|week|weeks|month|months))/i, label: (match) => `Delivery window: ${match[1]}` },
    { pattern: /(?:within|in)\s+(two\s+weeks)/i, label: (match) => `Delivery window: ${match[1].toLowerCase()}` },
    { pattern: /(?:预算|budget)\s*[:：]?\s*([^,，。;；]+)/i, label: (match) => `Budget: ${match[1].trim()}` },
    { pattern: /(?:两周|2\s*周)/i, label: () => 'Delivery window: two weeks' },
    { pattern: /(?:local[- ]first|本地优先|本地存储)/i, label: () => 'Local-first storage' },
    { pattern: /(?:no subscription dependency|without subscription|不依赖订阅|无需订阅)/i, label: () => 'No subscription dependency' },
    { pattern: /(?:paid|付费|收费)/i, label: () => 'Must support a paid value proposition' },
  ]
  const found = []
  for (const rule of rules) {
    const match = rule.pattern.exec(intent)
    if (match) found.push({ source: 'explicit-intent', value: rule.label(match) })
  }
  return found.length > 0
    ? found
    : [{ source: 'inferred', value: 'Prefer the smallest independently verifiable first slice' }]
}

function buildPaths(goal) {
  return [
    {
      id: 'minimal-proof',
      title: 'Minimal proof',
      summary: `Prove the riskiest part of "${goal}" with the smallest usable slice.`,
      scope: 'One primary user path, one output, local state, and one focused verification route.',
      cost: { level: 'low', time: 'short', complexity: 'low' },
      benefit: 'Fastest learning cycle and lowest sunk cost before product direction is validated.',
      risks: ['May underrepresent the eventual product experience.', 'Foundation work may need revision after real feedback.'],
      assumptions: ['A narrow end-to-end result is enough to test the core value proposition.'],
      acceptance: ['A target user can complete the core job end to end.', 'The riskiest product assumption has direct evidence.'],
      evidencePlan: ['Run one focused automated check for the core behavior.', 'Capture one real output or runtime smoke result.'],
    },
    {
      id: 'balanced-delivery',
      title: 'Balanced delivery',
      summary: `Deliver a usable first version of "${goal}" while preserving a short feedback loop.`,
      scope: 'Primary flow, essential failure states, reusable boundaries, and lightweight product instrumentation.',
      cost: { level: 'medium', time: 'moderate', complexity: 'medium' },
      benefit: 'Balances credible user value, implementation quality, and learning speed.',
      risks: ['More scope can delay first evidence.', 'Some supporting features may not affect the core decision.'],
      assumptions: ['The target workflow is understood well enough to justify a small coherent product slice.'],
      acceptance: ['The primary workflow and important failure path are usable.', 'Acceptance checks cover behavior and product-facing output.'],
      evidencePlan: ['Run focused behavior and integration checks.', 'Collect a representative output and a short user-feedback prompt.'],
    },
    {
      id: 'foundation-first',
      title: 'Foundation first',
      summary: `Build durable foundations for repeated expansion of "${goal}" before optimizing speed to market.`,
      scope: 'Stable domain boundaries, extensible storage/contracts, core workflow, and recovery behavior.',
      cost: { level: 'high', time: 'longer', complexity: 'high' },
      benefit: 'Reduces rework when the product must support multiple workflows, teams, or integrations.',
      risks: ['Highest upfront cost and slowest market feedback.', 'Architecture may optimize for needs that never materialize.'],
      assumptions: ['Reuse, scale, or multiple follow-on slices are already likely enough to justify the investment.'],
      acceptance: ['Core contracts support the named follow-on scenarios.', 'Recovery and compatibility behavior are verified.'],
      evidencePlan: ['Run contract and integration tests.', 'Document an architecture decision and verify one extension scenario.'],
    },
  ]
}

const root = path.resolve(readArg('--root', path.join(import.meta.dirname, '..')))
const target = path.resolve(readArg('--target', process.cwd()))
const intent = String(readArg('--intent', '') || '').trim()
const execute = args.includes('--execute')
const jsonOnly = args.includes('--json')

if (!intent) {
  const failure = {
    status: 'missing-intent',
    error: 'Natural-language goal intent is required.',
    usage: 'node scripts/generate-goal-discovery-packet.mjs --target <project-root> --intent "<goal>" --json',
  }
  console.log(jsonOnly ? JSON.stringify(failure, null, 2) : `${failure.error}\n${failure.usage}`)
  process.exit(1)
}

const state = readJson(path.join(target, '.gse', 'state.json'))
const profile = readText(path.join(target, '.gse', 'project-profile.md'))
const goalMap = readText(path.join(target, '.gse', 'goal-map.md'))
const sessionId = slug(readArg('--session-id', '') || `${slug(intent, 'goal')}-${crypto.createHash('sha256').update(intent).digest('hex').slice(0, 8)}`)
const sessionRelativePath = path.posix.join('.gse', 'discovery', `${sessionId}.json`)
const sessionPath = path.join(target, ...sessionRelativePath.split('/'))
const paths = buildPaths(intent)
const constraints = explicitConstraints(intent)

const packet = {
  schemaVersion: 1,
  status: 'awaiting-choice',
  sessionId,
  intent,
  interpretedGoal: intent,
  projectContext: {
    projectName: state?.projectName ?? path.basename(target),
    phase: state?.phase ?? null,
    canonicalGoalSource: state?.canonicalGoalSource ?? null,
    projectProfilePresent: Boolean(profile),
    goalMapPresent: Boolean(goalMap),
  },
  constraints,
  unknowns: [
    'Who is the first target user and what situation triggers this need?',
    'Which success signal will justify continuing after the first slice?',
    'Which scope is explicitly excluded from the first delivery?',
  ],
  paths,
  comparison: paths.map(({ id, title, cost, benefit, risks }) => ({ id, title, cost, benefit, risks })),
  recommendation: {
    pathId: 'minimal-proof',
    reason: 'Start with the least costly path that can produce direct user and runtime evidence; choose a heavier path only when its assumptions are already supported.',
  },
  choicePrompt: `Choose one path with /gse discover --session ${sessionId} --select minimal-proof|balanced-delivery|foundation-first`,
  nextAction: execute
    ? `Review the saved session, then choose a path with --session ${sessionId} --select <path-id>.`
    : `Persist this discovery session with --execute before selecting a path.`,
  persistence: {
    requested: execute,
    written: false,
    path: sessionRelativePath,
  },
  claimBoundary: 'This packet structures discovery and tradeoffs. It does not validate market demand, user acceptance, or the correctness of inferred strategy.',
}

if (execute) {
  if (!fs.existsSync(path.join(target, '.gse'))) {
    packet.status = 'missing-gse'
    packet.error = 'Target must contain .gse before a discovery session can be persisted.'
    console.log(jsonOnly ? JSON.stringify(packet, null, 2) : packet.error)
    process.exit(1)
  }
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true })
  packet.persistence.written = true
  if (fs.existsSync(sessionPath)) {
    const existing = readJson(sessionPath)
    if (existing?.intent !== intent) {
      packet.status = 'session-conflict'
      packet.error = `Discovery session already exists with different intent: ${sessionRelativePath}`
      console.log(jsonOnly ? JSON.stringify(packet, null, 2) : packet.error)
      process.exit(1)
    }
  } else {
    fs.writeFileSync(sessionPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8')
  }
}

if (jsonOnly) console.log(JSON.stringify(packet, null, 2))
else {
  console.log(`Goal: ${packet.interpretedGoal}`)
  for (const item of paths) console.log(`- ${item.id}: ${item.summary}`)
  console.log(packet.choicePrompt)
}
