# Dispatch Packet

Use this when assigning work to a real subagent, another human/agent session, or a sequential role simulation in the main session.

Do not require this packet for tiny single-agent edits. Use it when delegation, role separation, file ownership, or review evidence matters.

## Execution Mode

- Mode: real-subagent | sequential-role | handoff-session
- Real delegation used: yes | no
- Host/tool used:
- Tool status: verified | documented | unknown | unavailable
- If not real-subagent, state fallback reason:
- Dispatch evidence:
- Fallback execution:
- Role output evidence:
- Claim boundary:

## Role

- Role: Coordinator | Planner | Product Analyst | Architect | Locator | Implementer | Verifier | Reviewer | QA | Docs/Evidence | Release | Other:
- Skill focus:
- Model/tool preference, if project-approved:

## Objective

- Outcome:
- Scope:
- Non-goals:
- User-visible impact:

## Required Context

Read these first:

1.
2.
3.

Do not read:

- Generated outputs:
- Historical logs:
- Unrelated modules:

Known assumptions:

- Verified facts:
- Design judgments:
- Open questions:

## File Ownership

- Allowed files:
- Forbidden files:
- Read-only files:
- Shared files requiring coordinator review:
- Pre-existing dirty files:
- Release condition:

Follow `references/file-ownership.md`. Do not overwrite user or unrelated agent changes.

## Task Instructions

- Steps to perform:
- Existing patterns to follow:
- Constraints:
- Performance/security/accessibility/privacy notes:

## Expected Output

Return a concise report with:

- Status: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
- Files inspected:
- Files changed:
- Summary of work:
- Verification run:
- Evidence produced:
- Residual risks:
- Questions or blockers:

## Verification

- Required focused test/smoke/check:
- Evidence status: result | verified | accepted
- Acceptable evidence level: result | verified-unit | verified-component | verified-api | verified-browser | verified-ci | accepted-owner | accepted-release | external-required
- What proves success:
- What would fail the task:

## Stop Conditions

Stop and report `NEEDS_CONTEXT` or `BLOCKED` if:

- Required context is missing or contradictory.
- Allowed files are insufficient for the requested change.
- Target files contain unrelated dirty changes that make merging unsafe.
- A tool claimed by the packet is unavailable.
- The task requires broader architecture or product judgment than assigned.

## Review Requirements

- Spec compliance review required: yes | no
- Code quality review required: yes | no
- QA/evidence review required: yes | no
- Coordinator integration required: yes | no

## Notes For Sequential Fallback

When no real subagent tool exists, use this packet as a role checklist in the main session. Say that no real delegation occurred if reporting delegation status matters. Keep role boundaries honest.

For repeatable role fallback packets, use `assets/templates/role-fallback-packet.md` and `references/role-dispatch-fallback.md`.
