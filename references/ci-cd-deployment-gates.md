# CI/CD and Deployment Gate Pack

Use this pack when a slice changes CI workflows, build scripts, deployment config, release automation, environment variables, observability, rollback, or public distribution claims.

## Triggers

- `.github/workflows/`, `Dockerfile`, deployment manifests, build scripts, release scripts, package metadata, environment templates, or hosting config changed.
- The slice outcome mentions CI, build, deploy, release, rollback, registry, package, tag, smoke, observability, monitor, incident, or environment behavior.
- The project profile names Vercel, Netlify, Render, Cloudflare, Docker, GitHub Actions, package registry, or release process.

## Minimum Gate

Use the cheapest gate that proves the claim:

- local config/script lint for CI syntax and command wiring;
- build/install smoke for package or build-path claims;
- real CI run only when claiming CI passed;
- deployment smoke only when claiming deployment works;
- rollback/known-risk notes for release-sensitive changes.

## Evidence Boundary

- Do not claim `verified-ci` unless a real CI workflow/config/run was inspected or executed.
- Do not claim deployment or release acceptance from local build-only evidence.
- Keep public release, marketplace, and host-native support as separate accepted/external gates.

## Acceptance Scenario Shape

```text
Given <branch/build/release/deploy precondition>
When <CI/build/package/deploy step> runs
Then <artifact/status/URL/rollback signal> proves the claim
Evidence: <CI/build/deploy/release command or accepted external record>
```

