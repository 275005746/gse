#!/usr/bin/env node
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const root = path.resolve(path.join(import.meta.dirname, '..'))

function readArg(name, fallback = null) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  return args[index + 1] ?? fallback
}

function hasValueArg(name) {
  const index = args.indexOf(name)
  return index !== -1 && args[index + 1] && !args[index + 1].startsWith('--')
}

function stripRunnerArgs(values) {
  const stripped = []
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index]
    if (item === '--root' || item === '--target' || item === '--command') {
      index += 1
      continue
    }
    stripped.push(item)
  }
  return stripped
}

function commandFromArgs(values) {
  const explicit = readArg('--command')
  if (explicit) return explicit

  const commandParts = stripRunnerArgs(values)
    .filter((item) => item !== '--json' && item !== '--execute')

  if (commandParts.length === 0 || commandParts[0] === 'help' || commandParts[0] === '--help' || commandParts[0] === '-h') {
    return '/gse help'
  }

  const first = commandParts[0]
  if (first === '/gse') return commandParts.join(' ')
  if (first.startsWith('/gse ')) return first
  if (first.toLowerCase() === 'gse') return '/' + commandParts.join(' ')
  return '/gse ' + commandParts.join(' ')
}

const target = path.resolve(readArg('--target', process.cwd()))
const runnerArgs = [
  path.join(root, 'scripts', 'run-gse-command.mjs'),
  '--root', hasValueArg('--root') ? path.resolve(readArg('--root')) : root,
  '--target', target,
  '--command', commandFromArgs(args),
]

if (args.includes('--json')) runnerArgs.push('--json')
if (args.includes('--execute')) runnerArgs.push('--execute')

const result = spawnSync(process.execPath, runnerArgs, {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
})

process.exit(result.status ?? 1)
