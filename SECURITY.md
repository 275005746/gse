# Security Policy

GSE is an agent workflow skill and scaffold. Security reports may involve scripts, generated project files, host adapters, package/install behavior, signing, release trust, or documentation that could cause unsafe claims.

## Supported Scope

Security-relevant areas include:

- Package, install, URL install, manifest integrity, signing, and verification scripts.
- Generated host adapters and command pointers.
- Tool permission guidance, MCP/tool routing guidance, and release trust policy.
- Evidence, logs, and templates that could leak secrets or raw provider payloads.
- Documentation that could cause agents to bypass owner approval, license decisions, or unsupported host boundaries.

## Reporting

Until a public security contact is chosen, do not publish exploit details in public issues.

Use the project owner's private reporting channel. If no channel exists, record the issue privately in the maintainers' current coordination channel and mark the public release status as blocked until a contact path exists.

Minimum report contents:

- Affected GSE version, release label, or commit.
- Affected file or generated artifact.
- Reproduction steps.
- Impact and likely affected users or hosts.
- Whether secrets, credentials, private prompts, provider payloads, or user data are involved.
- Suggested mitigation if known.

## Handling

- Do not claim a fix is verified until a focused reproduction or audit proves the changed behavior.
- Do not publish a release if signing, package integrity, or owner trust evidence is contradicted.
- If a public package may be affected, use `references/release-trust.md` and `assets/templates/release-trust-record.md` to record revocation, rotation, and follow-up.
- If a project-local GSE scaffold is affected, notify the affected project session or maintainer with the exact files and validation commands.

## Current Limits

- No public vulnerability disclosure address has been owner-approved yet.
- Public marketplace approval and registry publication are not verified.
- Host-native slash-command support is not verified unless a host-specific invocation record exists.
