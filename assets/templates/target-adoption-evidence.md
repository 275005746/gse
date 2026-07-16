# Target Project Adoption Evidence

Use this record when applying or testing GSE against a real target project without claiming broad certification.

```text
Target project:
Adoption path: existing repo | fresh install | update existing GSE | host adapter | fresh session
Project rules read:
Files inspected:
Files changed:
Commands run:
Detected project type:
Detected package manager:
Detected scripts:
Host/tool statuses:
Evidence status: result | verified | accepted | not ready
Accepted by:
Residual risks:
Next action:
```

## Rules

- Use `Files changed: none` for read-only adoption evidence.
- Treat discovered commands, package scripts, config files, and host rules as `documented` until executed.
- Treat tool availability as `unknown` unless the tool was actually checked in the current project/session.
- Do not claim arbitrary real-repo certification from one target-project adoption record.
- Do not claim host runtime support, subagent support, browser support, MCP support, CI support, release publication, or owner acceptance without direct evidence.
- Keep `accepted` separate from `verified`; use `Accepted by: not accepted` unless a real acceptance gate ran.
