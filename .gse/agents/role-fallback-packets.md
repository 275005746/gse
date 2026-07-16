# Role Fallback Packets

These are the default auditable fallback packets for GSE self-development. They apply whether roles are executed by real subagents or sequentially by the coordinator.

| Role | Mode | Real delegation used | Tool status | Fallback output | Evidence | Stop condition | Write access |
|---|---|---|---|---|---|---|---|
| Planner | sequential-role | no | unknown | Slice plan with outcome, scope, acceptance, evidence, risk, and next action | `.gse/current-slice.md`, `.gse/state.json` | Goal, roadmap, or acceptance source is contradictory | docs/state only |
| Locator | sequential-role | no | unknown | File, symbol, command, and existing-test map | search output or locator notes | Required files cannot be found or ownership is unclear | read-only |
| Implementer | sequential-role | no | unknown | Bounded diff in assigned files | git diff and changed-file list | Target files have unsafe unrelated dirty changes | assigned files only |
| Verifier | sequential-role | no | unknown | Focused command results and evidence level | command output summary and `.gse/evidence/` record | Required focused check cannot run or fails without a repair path | evidence/test output only |
| Reviewer | sequential-role | no | unknown | Spec compliance and quality findings | review notes or explicit no-findings statement | Diff exceeds scope or missing tests are material | read-only |
| Docs/Evidence | sequential-role | no | unknown | Slice evidence, state, goal-map, and roadmap updates | `.gse/evidence/index.jsonl`, `.gse/evidence/YYYY-MM-DD.md` | Evidence cannot be recorded or JSONL is invalid | docs/evidence only |
| Release | sequential-role | no | unknown | Release, owner, external, CI, package, and host-runtime boundary check | final-readiness or public-acceptance audit summary | Local evidence is being used to claim owner/external support | docs/release only |
