# Marketplace Discovery

Use this when preparing GSE for a public catalog, skill marketplace, plugin listing, GitHub release page, or internal agent-workflow registry.

Discovery metadata should help people find and evaluate GSE without overstating trust.

## Required Metadata

- Name and display name.
- Short tagline and summary.
- Categories and keywords that describe the workflow naturally.
- Entrypoints for humans and agents.
- Validation commands.
- Distribution and signing references.
- Host support status with honest labels.
- Boundaries and unverified claims.

The canonical local metadata file is:

```text
assets/marketplace/gse-listing.json
```

## Search Language

Use normal explanatory language around terms such as agentic engineering, spec-driven development, SDD, AI coding agents, goal maps, evidence gates, change control, and role-based execution. Do not add isolated search-term blocks that read like keyword stuffing.

## Trust Boundary

Discovery metadata is not marketplace approval.

A listing can be:

- `result`: drafted metadata exists.
- `verified`: metadata passes local audit and matches package validation.
- `accepted`: the target marketplace, catalog owner, or release owner accepts it.

## Validation

Run:

```text
node <skill>/scripts/audit-marketplace-discovery.mjs --root <skill> --json
```

For release trust, also use `references/release-trust.md`.
