#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

const target = path.resolve(readArg('--target', process.cwd()))
const hostArg = readArg('--host', 'all')
const force = args.includes('--force')
const dryRun = args.includes('--dry-run')
const jsonOnly = args.includes('--json')

const portableReadOrder = [
  'Project instructions such as AGENTS.md, CLAUDE.md, README, or repository-specific rules.',
  '.gse/README.md',
  '.gse/project-profile.md',
  '.gse/state.json',
  '.gse/goal-map.md',
  '.gse/quality-gates.md',
]

const continuationProtocolContent = `## Host-Native Continuation

Read the compact /gse continue result and consume its continuationPacket only when protocol is gse-host-native-continuation.

- Preserve the same topLevelPlanUnitId; do not create a new top-level task from nextAction alone.
- Continue in the active host Goal only when stopOutcome is continue-now and canAutoContinue is true.
- When requiresHostReinjection is true, return the bounded reinjection prompt through the host's normal turn flow.
- Stop on await-decision, blocked, rollover-required, or top-level-complete; the host owns permissions, cancellation, rollover, and Goal lifecycle.
- Unknown capability is host-turn-controlled. Adapter presence proves only generated file shape, not runtime acknowledgement or dispatch.
- Never invoke another Agent host or a GSE-owned execution process.`

function portablePointerContent({ title, hostName, extraNotes = [] }) {
  const notes = extraNotes.length
    ? '\n\nHost-specific notes:\n\n' + extraNotes.map((item) => '- ' + item).join('\n')
    : ''
  return `# ${title}

Source of truth: .gse/.

This file is a ${hostName} pointer for GSE. It does not prove native /gse slash-command support or verified runtime tools.

Read in order:

${portableReadOrder.map((item, index) => `${index + 1}. ${item}`).join('\n')}

Route /gse ..., gse: ..., and "continue with GSE" requests through references/commands.md in the installed GSE skill.

Portable execution path:

\`\`\`text
node <gse-skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse help"
\`\`\`

Capability status vocabulary: verified, documented, unknown, unavailable.

Do not mark subagents, MCP, browser, LSP/index, hooks, workers, model routing, or native slash commands as verified unless this host/session produced current evidence.

${continuationProtocolContent}
${notes}
`
}

const adapters = {
  claude: {
    nativeSlashCommand: true,
    relativePath: path.join('.claude', 'commands', 'gse.md'),
    content: `# /gse

Use GSE for this project.

Read in order:

1. Project instructions such as AGENTS.md, CLAUDE.md, or repository-specific rules.
2. .gse/README.md
3. .gse/project-profile.md
4. .gse/state.json
5. .gse/goal-map.md
6. .gse/quality-gates.md

Route the user's arguments through references/commands.md in the installed GSE skill.

Portable execution path:

\`\`\`text
node <gse-skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse help"
\`\`\`

Do not duplicate the goal map, evidence log, or quality gates in .claude/.
Do not mark tools, subagents, MCP, browser, LSP, hooks, or slash commands as verified unless this session checked them.

${continuationProtocolContent}

Expected command shapes:

- /gse help
- /gse init
- /gse adopt
- /gse continue
- /gse change
- /gse slice
- /gse verify
- /gse audit
- /gse close
`,
  },
  codex: {
    nativeSlashCommand: false,
    relativePath: path.join('.codex', 'gse-command.md'),
    content: `# GSE Command Adapter For Codex

Source of truth: .gse/.

This file is a Codex-facing pointer, not proof of a native project-level /gse slash-command mechanism.

Use the installed GSE skill and references/commands.md when the user writes /gse ..., gse: ..., or asks to continue with GSE.

Portable execution path:

\`\`\`text
node <gse-skill>/scripts/run-gse-command.mjs --target <project-root> --command "/gse help"
\`\`\`

Read in order:

1. AGENTS.md
2. .gse/README.md
3. .gse/project-profile.md
4. .gse/state.json
5. .gse/goal-map.md
6. .gse/quality-gates.md

Capability status vocabulary: verified, documented, unknown, unavailable.

${continuationProtocolContent}
`,
  },
  hermes: {
    nativeSlashCommand: false,
    relativePath: path.join('.gse', 'host-adapters', 'hermes-runtime.md'),
    content: portablePointerContent({
      title: 'Hermes/AION Runtime GSE Adapter',
      hostName: 'Hermes/AION-style runtime',
      extraNotes: [
        'Keep user-facing product identity in the product docs; runtime names belong only to internal implementation notes.',
        'Treat workers, memory, tools, model routing, and browser loops as unknown until the target project records evidence.',
      ],
    }),
  },
  workbuddy: {
    nativeSlashCommand: false,
    relativePath: path.join('.gse', 'host-adapters', 'workbuddy.md'),
    content: portablePointerContent({
      title: 'WorkBuddy GSE Adapter',
      hostName: 'WorkBuddy-style IDE agent',
      extraNotes: [
        'Use the IDE or plugin command surface only after the project records how WorkBuddy discovers this file.',
        'Keep local tool, MCP, index, browser, and subagent claims unknown until checked in that workspace.',
      ],
    }),
  },
  copilot: {
    nativeSlashCommand: false,
    relativePath: path.join('.github', 'copilot-instructions.md'),
    content: portablePointerContent({
      title: 'GitHub Copilot GSE Adapter',
      hostName: 'GitHub Copilot-style assistant',
      extraNotes: [
        'Use this repository instruction file as a short pointer to the project-local GSE workspace.',
        'Keep issue, PR, CI, and repository settings claims unknown until the public repository records evidence.',
      ],
    }),
  },
  gemini: {
    nativeSlashCommand: false,
    relativePath: 'GEMINI.md',
    content: portablePointerContent({
      title: 'Gemini GSE Adapter',
      hostName: 'Gemini-style assistant',
      extraNotes: [
        'Use this file as a short pointer when the host reads repository-level Gemini instructions.',
        'Keep command, tool, MCP, browser, and subagent claims unknown until the current host records evidence.',
      ],
    }),
  },
  generic: {
    nativeSlashCommand: false,
    relativePath: path.join('.gse', 'host-adapters', 'generic-agent.md'),
    content: portablePointerContent({
      title: 'Generic Agent GSE Adapter',
      hostName: 'generic or unknown agent host',
      extraNotes: [
        'Use this adapter when a host has no known native command location yet.',
        'Replace this file with a host-specific adapter only after that host has a real folder, hook, command, skill, plugin, or MCP mechanism.',
      ],
    }),
  },
}

function writeFile(relativePath, content) {
  const fullPath = path.join(target, relativePath)
  if (fs.existsSync(fullPath) && !force) return { status: 'skipped', fullPath }
  if (!dryRun) {
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content.trimStart().replace(/\n/g, '\r\n'), 'utf8')
  }
  return { status: dryRun ? 'would-write' : 'written', fullPath }
}

const hosts = hostArg === 'all' ? Object.keys(adapters) : hostArg.split(',').map((item) => item.trim()).filter(Boolean)
const invalid = hosts.filter((host) => !adapters[host])
if (invalid.length) {
  console.error('Invalid --host value: ' + invalid.join(', ') + '. Expected claude, codex, hermes, workbuddy, copilot, gemini, generic, or all.')
  process.exit(1)
}

const results = hosts.map((host) => {
  const adapter = adapters[host]
  const write = writeFile(adapter.relativePath, adapter.content)
  return {
    host,
    nativeSlashCommand: adapter.nativeSlashCommand,
    verificationLevel: 'generated-shape-only',
    status: write.status,
    path: write.fullPath,
    relativePath: adapter.relativePath.replace(/\\/g, '/'),
  }
})

const report = {
  target,
  dryRun,
  force,
  hosts,
  results,
  limits: [
    'Claude adapter emits a native project slash-command file under .claude/commands.',
    'Codex adapter is a skill/text-command pointer until a project-level native slash-command file mechanism is verified.',
    'Hermes, WorkBuddy, Copilot, Gemini, and generic adapters are portable pointers only; they do not prove host runtime invocation.',
  ],
}

console.log(JSON.stringify(report, null, 2))
