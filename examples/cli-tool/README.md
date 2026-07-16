# cli-tool fixture

Purpose: representative command-line package shape for GSE adoption tests.

Suggested checks:

- Run `node <gse>/scripts/discover-project-profile.mjs --target <fixture> --json`.
- Confirm package scripts are documented, not verified.
- Confirm CLI smoke, package validation, and release/publish signals are discovered from `package.json`.
- Confirm host capabilities remain `unknown` unless a host-specific adapter or current-session evidence exists.

No install or package publish is required for structural fixture use.
