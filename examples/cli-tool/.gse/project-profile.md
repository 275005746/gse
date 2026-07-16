# CLI Tool Project Profile

Status: fixture documentation only.

## Identity

- Repository type: JavaScript/TypeScript CLI package.
- Primary interface: package `bin` command.
- User-visible risk: command output, exit codes, package install/update, and release notes.

## Adoption Notes

- Preserve existing package scripts and release metadata.
- Treat `smoke`, `release:dry-run`, and `bin` entries as `documented` until executed.
- Keep package manager, registry, signing, and publish permissions as `unknown` unless checked in the target project.

## Suggested Evidence

- Profile discovery result from `scripts/discover-project-profile.mjs`.
- Focused CLI smoke such as `npm run smoke` or project equivalent.
- Package dry-run evidence such as `npm pack --dry-run` when release scope is involved.
