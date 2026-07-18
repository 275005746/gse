## Outcome

GSE-172 makes the portable entrypoint usable across sessions: a fresh agent can read `.gse/`, resume from the current Slice, use bounded `/gse continue`, and hand off the next action without relying on prior conversation history or inferring Host capability.

Roadmap anchor: `references/final-form-roadmap.md` (`final-form`) and `references/capability-execution-matrix.md` (`Task admission and bounded continuation`).

## Scope

In scope: cross-session `AGENTS.md` entry contract; state/current-Slice/evidence read order; bounded continuation command discovery; same-Plan-Unit continuity; evidence handoff requirements; host and external claim boundaries; entrypoint audit coverage; capability registry and Lite regressions.

Out of scope: host-native task creation, host worker dispatch, native slash-command support, registry publication, marketplace approval, public acceptance, or external release publication.

## Acceptance

- A new session is directed to read `.gse/state.json`, `.gse/current-slice.md`, and named evidence before planning.
- The active Slice contract and `nextAction` are explicitly authoritative for continuation.
- `/gse continue --json --compact` is the documented bounded resume route.
- Cross-session work remains under the same top-level Plan Unit unless a packet requires rollover or an owner decision.
- Handoff requires focused evidence, updated portable state, and an explicit next action without relying on prior conversation history.
- Portable outputs retain Host and external claim boundaries; external acceptance remains `publicAccepted: not-accepted` with three pending gates.

## Evidence Plan

- `node scripts/audit-agent-entrypoint.mjs --root . --json`
- `node scripts/audit-project-capability-registry.mjs --root . --target . --json`
- `node scripts/validate-gse.mjs --root . --profile lite --json`
- `git diff --check`

## Risk

- Cross-session instructions improve discoverability but do not prove another Host adopted or executed GSE.
- Portable continuation and task admission remain advisory; they cannot create or dispatch a host task or complete a host Goal.
- Local validation is not registry publication, marketplace approval, native slash-command evidence, or public acceptance.
- External owner/registry, marketplace, and other-host runtime gates remain pending and must be re-audited only after real evidence is attached.

## Next Action

Select and implement the next independently verifiable functional Slice under the same top-level Plan Unit; keep external acceptance as an owner-gated handoff.
