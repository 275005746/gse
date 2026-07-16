# Domain Model

Use this when GSE needs to consume or update a project's domain language, glossary, context files, or ADRs.

## Purpose

Long-running agent work fails when project language drifts. GSE keeps a small domain model layer so future agents can use the project's own words instead of rediscovering or renaming concepts every session.

## Source Files

Read these in order when relevant:

1. `.gse/project-profile.md` for the project identity and known docs.
2. `CONTEXT.md` for a single-context project glossary.
3. `CONTEXT-MAP.md` for monorepos or multi-domain projects.
4. `docs/adr/` or context-specific ADR folders for decisions.
5. Product specs only after glossary/ADR context is understood.

Do not read all context files in a large monorepo. Use `CONTEXT-MAP.md` or project-profile evidence to pick the relevant context.

## File Roles

| File | Purpose | Should Not Contain |
|---|---|---|
| `.gse/project-profile.md` | Short project identity, commands, tools, gates, and doc map | Full glossary, implementation specs, large logs |
| `CONTEXT.md` | Domain glossary and ubiquitous language | Implementation details, task lists, transient notes |
| `CONTEXT-MAP.md` | Map from subsystem/domain to its context and ADR files | Detailed definitions that belong in each context |
| `docs/adr/*.md` | Durable architectural or product decisions | Ordinary implementation notes or temporary preferences |
| `.gse/changes/*` | Current change outcome, scope, acceptance, evidence | Canonical domain definitions |

## Single-Context Project

Use one root `CONTEXT.md` when the project has one dominant domain language.

```text
project/
  CONTEXT.md
  docs/adr/
  .gse/project-profile.md
```

`CONTEXT.md` should define terms like:

- Canonical term.
- Meaning in this project.
- Terms not to use.
- Important relationships to other terms.
- A short example scenario when it prevents ambiguity.

## Multi-Context Project

Use `CONTEXT-MAP.md` when one glossary would mix unrelated domains.

```text
project/
  CONTEXT-MAP.md
  apps/admin/CONTEXT.md
  services/billing/CONTEXT.md
  services/billing/docs/adr/
  docs/adr/
```

`CONTEXT-MAP.md` should map:

- Context name.
- Path to context file.
- Related code paths.
- Related ADR path.
- Owner or review expectation when known.

## When To Update The Domain Model

Update domain files only when the change is durable:

- A term is ambiguous, overloaded, or repeatedly explained.
- The user resolves a naming conflict.
- Code and user language disagree about a domain concept.
- A new durable product concept is introduced.
- A future agent would likely make a wrong assumption without the note.

Do not update domain files for:

- Temporary implementation details.
- One-off task notes.
- Test fixtures that are not domain examples.
- Preferences that belong in project profile or quality gates.

## ADR Boundary

Create or suggest an ADR only when all are true:

1. Hard to reverse: changing later has meaningful cost.
2. Surprising without context: future agents or maintainers would ask why.
3. Real trade-off: there were plausible alternatives.

If any condition is missing, record the fact in the change evidence or project profile instead of creating an ADR.

## Conflict Handling

If project language conflicts:

1. Quote the conflicting sources by path.
2. Do not silently choose one.
3. Ask or propose the smallest resolution.
4. Record the resolved canonical term in the right context file.
5. If the resolution is hard to reverse and surprising, create or propose an ADR.

## GSE Integration

- `project-profile.md` points agents to the relevant context and ADR files.
- `spec-workflow.md` should use canonical domain terms from context files.
- `quality-gates.md` can require domain-language checks for high-risk changes.
- `evidence-taxonomy.md` still decides whether the domain update is result, verified, or accepted.

## Evidence Examples

Result:

- Added a new glossary entry to `CONTEXT.md`.

Verified:

- Checked the changed spec and code references use the canonical term.
- Confirmed no conflicting term remains in touched files.

Accepted:

- User, domain owner, reviewer, or policy accepts the new canonical term.

