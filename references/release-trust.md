# Release Trust

Use this when preparing GSE for public, shared, or marketplace-style distribution.

GSE signing mechanics prove that a package matches a signed manifest. They do not prove maintainer identity, public key custody, account security, or marketplace trust. Treat those as release governance.

## Required Release Trust Record

For every public release, record:

- Release label and package digest.
- Public key fingerprint.
- Maintainer or release owner.
- Signing machine or signing environment.
- Key custody location.
- Rotation policy.
- Revocation path if a key is compromised.
- Verification command used by a fresh install.
- Accepted by owner or release authority.

Use `assets/templates/release-trust-record.md`.

## Key Custody Rules

Key custody is a release owner responsibility.

- Do not commit private keys.
- Do not package private keys.
- Do not generate production keys inside a temporary audit folder.
- Store production private keys in a host secret store, hardware-backed key store, or explicitly approved private release environment.
- Publish public keys and fingerprints with release notes.
- Rotate keys when custody changes, maintainer access changes, or compromise is suspected.
- Keep an owner-approved revocation note for retired keys.

## Verification Rules

A release can claim:

- `signed`: a package signature exists.
- `verified`: `verify-gse-package.mjs` passes against the published public key.
- `trusted`: signed and verified, with an owner-accepted release trust record.

Do not claim `trusted` from signing alone.
