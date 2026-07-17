# Change Brief

- Change ID: add-user-login
- Level 2 / Standard
- Snapshot date: 2026-07-16

## Intent
Add a clear user-login entry point for returning users while preserving existing navigation.

## Acceptance
- A user can submit an email and password from the login screen.
- Invalid credentials produce a non-sensitive error.
- Successful login returns the user to the requested destination.

## Security constraints
Do not log passwords, tokens, or full authentication responses. Rate-limit repeated failures and keep session handling on trusted boundaries.
