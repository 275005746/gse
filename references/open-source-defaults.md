# GSE Open-Source Defaults

Use this reference when preparing GSE for a public repository or when a project asks to follow the mainstream open-source path.

## Recommended Default

GSE's owner-approved default route is:

- License: MIT.
- Repository: public GitHub repository.
- CI: GitHub Actions with required checks.
- Security: `SECURITY.md` plus GitHub Security Advisory or another owner-approved public disclosure path.
- Release channel: GitHub Release first; package registry or marketplace only after real publication evidence exists.
- Command UX: portable `/gse ...` commands, with native slash-command claims only after a host runtime record proves native execution.

## Why This Default

- MIT is widely understood by open-source tool users and keeps integration friction low.
- GitHub public repository plus GitHub Actions gives public, linkable evidence for repository settings and CI.
- GitHub Release provides a simple first public channel without pretending a registry or marketplace approved the package.
- Portable `/gse ...` command semantics work across hosts even when native slash-command APIs differ.

## Claim Boundaries

- A local `LICENSE` file proves the license text exists; accepted license status requires an owner-approved release record.
- A local GitHub Actions workflow file does not prove public CI. Use a real public run URL and `scripts/record-public-ci-run.mjs`.
- A local `SECURITY.md` does not prove a public security contact. Use `scripts/record-public-security-contact.mjs` after the disclosure path is public and owner-approved.
- A generated package or release bundle does not prove public publication. Use `scripts/record-public-channel-publication.mjs` after a real channel URL exists.
- Generated host adapter pointers do not prove native slash commands. Use `scripts/record-host-invocation.mjs` with real host evidence.

## Minimal Public Release Order

1. Record the owner-approved MIT license decision.
2. Publish or mirror GSE into a public GitHub repository.
3. Enable repository settings: issues, pull requests, security policy visibility, branch protection, required checks, review before merge, conversation resolution, force-push restriction, and deletion restriction.
4. Run public GitHub Actions and record the run URL, commit SHA, branch, and required checks.
5. Create a GitHub Release and record the release URL.
6. Record host runtime invocation evidence for each claimed host.
7. Re-run final readiness and public acceptance audits.
