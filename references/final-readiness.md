# Final Readiness Matrix

Use this when deciding whether GSE can be called open-source-ready, installable, and cross-host usable.

This matrix is a claim boundary. It separates local verified capability from owner-required or external evidence. Do not collapse these states into a single "done" label.

## Status Vocabulary

- `verified`: GSE has current local evidence from scripts, records, or package/install audits.
- `owner-required`: the owner must make or approve a decision before the claim can become accepted.
- `external-required`: a marketplace, public registry, host runtime, security contact, CI, or other external system must provide evidence.
- `not-claimed`: GSE deliberately does not claim this capability.

## Readiness Areas

The table below describes the baseline/status source for each row. The current truth is computed by `scripts/audit-final-readiness.mjs`; record-driven rows can promote from `owner-required` or `external-required` to `verified` only after accepted evidence records exist.

| Area | Accepted claim requires | Status source / baseline |
|---|---|---|
| Skill structure | `SKILL.md`, references, scripts, assets, metadata, and validator pass | verified |
| Project scaffold | `init-project`, project doctor, state, goal map, evidence index, close gate | verified |
| Local install | package, install, installed-copy validation, package CLI entrypoint, and installed short CLI status command | verified |
| npm tarball install | real local npm tarball creation, install into a clean consumer project, installed `gse` bin execution, and installed README audit | verified |
| npm publish dry-run | npm publish dry-run keeps package identity, CLI bin metadata, required runtime files, and integrity fields without harmful metadata auto-correction | verified |
| URL install | remote URL install, installed-copy validation, URL-installed short CLI status command, manifest integrity, and tamper rejection | verified |
| Signing | package signing, verification, signed install, and tamper rejection | verified |
| Open-source collaboration | README, contributing, security, support, changelog, public release metadata | verified |
| CI workflow template | public repository workflow file plus local CI-readiness audit | verified |
| Public CI run record | pending and accepted public CI run record mechanics | verified |
| Public collaboration templates | issue and PR templates that require outcome, scope, evidence, risk, and claim boundaries | verified |
| Public repository settings record | pending, verified, and accepted repository settings record mechanics | verified |
| Public CI run | real public CI run URL or status-check evidence | record-driven external gate |
| Public repository settings | real repository URL, issue/PR settings, branch protection, required checks, and maintainer acceptance | record-driven external gate |
| License decision | owner-selected license or explicit not-public decision | record-driven owner gate |
| Public security contact record | pending and accepted public security contact record mechanics | verified |
| Public security contact | owner-approved vulnerability disclosure path | record-driven owner gate |
| Public channel publication record | pending, registry publication, and marketplace approval record mechanics | verified |
| Public registry publication | real public package or registry publication evidence | record-driven external gate |
| Marketplace approval | real marketplace/catalog approval or publication evidence | record-driven external gate |
| Portable command execution | `run-gse-command.mjs` command semantics audit | verified |
| Host adapters | generated adapter files and compatibility matrix audit | verified |
| Native slash command | optional per-host adapter claim; verified only if a host invocation record proves native slash support | not claimed by GSE core |
| Other host runtime invocation | verified invocation records per host | record-driven external gate |

Do not read the baseline column as live status. For example, once the owner-selected license record is accepted, the audit reports `License decision` as `verified` even though the row remains an owner-gated claim type.

## Audit Command

```text
node <gse-skill>/scripts/audit-final-readiness.mjs --root <gse-skill>
```

The audit must report external and owner gates as incomplete unless corresponding records exist. It is valid for the audit to pass while still reporting `owner-required` or `external-required`; passing means the matrix is honest and complete, not that every external gate is satisfied.

Accepted owner/external records promote final rows only when the record contains accepted evidence and the relevant boundary proof. For example, a public CI row requires an accepted public CI run record with a successful conclusion and required-check proof; a registry row requires accepted publication evidence with registry proof. Native slash command support is a per-host optional adapter claim, not a GSE core completion gate; claim it only after a host invocation record proves native slash-command support.

Use the promotion audit to verify that this path still works:

```text
node <gse-skill>/scripts/audit-final-readiness-promotion.mjs --root <gse-skill>
```

## Acceptance Packet

When owner-required or external-required rows remain, generate a handoff packet instead of burying follow-up work in prose:

```text
node <gse-skill>/scripts/generate-final-acceptance-packet.mjs --root <gse-skill> --out <gse-skill>/.gse/acceptance/final-acceptance-packet.md --force
```

The packet lists the verified local capabilities, every pending owner/external gate, the exact next evidence action, and the anti-overclaim rules. It is a continuation artifact, not acceptance by itself.

## Completion Boundary

GSE can be described as locally verified and release-ready for handoff when the matrix passes and the verified rows have evidence.

GSE can be described as publicly accepted only after:

- owner-selected license or explicit not-public decision is recorded,
- public security contact policy is approved when public release is intended,
- public repository settings evidence exists when a public source repository is claimed,
- public CI run evidence exists when public CI is claimed,
- registry or marketplace publication evidence exists when those channels are claimed,
- native slash-command support is recorded per host before it is claimed by that host adapter.
