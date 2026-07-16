# small-app fixture

Purpose: representative small web app shape for GSE bootstrap and project-profile discovery tests.

Suggested checks:

- Run `node <gse>/scripts/discover-project-profile.mjs --target <fixture> --json`.
- Confirm package scripts are documented, not verified.
- Confirm browser/Playwright and CI are detected from config files.
- Confirm `.env.example` is treated as secrets documentation without reading real secrets.

No install is required for structural fixture use.
