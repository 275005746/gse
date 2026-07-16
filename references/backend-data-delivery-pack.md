# Backend/API/Data Delivery Pack

Use this pack when a slice changes API contracts, server handlers, persistence, migrations, workers, queues, caches, sessions, imports/exports, or data compatibility.

## Triggers

- `api/`, `server/`, `routes/`, `controllers/`, `services/`, `db/`, `prisma/`, `migrations/`, `schema/`, `workers/`, `queues/`, `jobs/`, or backend config changed.
- The slice outcome mentions API, database, migration, schema, persistence, queue, worker, cache, session, idempotency, import, export, or contract behavior.
- The project profile names Postgres, Supabase, Prisma, Drizzle, Redis, queue, worker, REST, GraphQL, RPC, webhook, or backend framework.

## Minimum Gate

Choose the narrowest direct proof:

- contract/unit test for pure handler logic;
- API smoke for route, auth, validation, serialization, or error mapping;
- migration/rollback notes plus fixture data smoke for schema changes;
- idempotency/retry/cancel check for workers and queue processors.

## Evidence Boundary

- Use `verified-api` only for direct API/contract/runtime proof.
- Use `verified-component` for service-level or repository-level tests that do not exercise the API boundary.
- Use `external-required` for production migration, real deployment, or managed data-store claims that were not executed.

## Acceptance Scenario Shape

```text
Given <existing data/auth/session/precondition>
When <API call, worker event, migration, import, or export> runs
Then <contract/state/result/error/retry behavior> is observed
Evidence: <focused API/data/worker command>
```

