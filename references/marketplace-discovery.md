# Agent Skill Discovery

Use this document when preparing GSE for discovery by other AI coding agents.

## Discovery contract

GSE is discoverable through its public source repository and its standard root Skill entrypoint:

```text
https://github.com/275005746/gse
SKILL.md
```

The npm package is a separate CLI installation channel:

```text
https://www.npmjs.com/package/@t275005746/gse
```

A directory such as a GitHub-based Agent Skill index may crawl or list the repository. The repository cannot mark that state locally. A listing is accepted only when a real public URL, index result, catalog record, or maintainer response exists.

## What a directory needs to expose

- `name`: `gse`
- a short description of Goal-Spec-Evidence Engineering;
- the public GitHub source URL;
- `SKILL.md` as the agent entrypoint;
- the npm CLI package URL;
- Node.js 18 or newer for the CLI;
- installation and continuation commands;
- supported claims and explicit host limitations.

## Installation paths

As a Skill, load the directory containing `SKILL.md` according to the host's own Skill convention. As a CLI, install:

```bash
npm install -g @t275005746/gse
gse status --target .
```

## Evidence states

Use these states and do not collapse them:

- `result`: local metadata or a draft listing exists;
- `verified`: local metadata and package checks pass;
- `accepted`: an external directory, catalog, registry, or owner has accepted the listing or publication;
- `external-required`: the external record has not been attached.

The local marketplace audit is a metadata check. It is not a marketplace approval check.

## Local validation

```bash
node scripts/audit-marketplace-discovery.mjs --root . --json
node scripts/audit-npm-package-metadata.mjs --root . --json
node scripts/audit-npm-tarball-install.mjs --root . --json
```

These commands do not publish GSE, submit a listing, create an index entry, or prove host-native installation.
