# Interaction Design

- Change ID: add-user-login
- Level 2 / Standard
- Snapshot date: 2026-07-16

## Flow
Present email, password, submit, and recovery affordances in a single responsive form. Preserve entered email after a validation error but clear the password field.

## Acceptance
The focus order is predictable, the submit state prevents duplicate requests, and the generic error remains readable without exposing authentication internals.

## Security constraints
Use an obscured password control, avoid sensitive values in URLs, and ensure recovery links cannot bypass authorization checks.
