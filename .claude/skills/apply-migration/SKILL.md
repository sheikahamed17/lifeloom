---
name: apply-migration
description: Apply a Lifeloom D1 migration (migrations/NNNN_*.sql) to the REMOTE Cloudflare D1 database, and verify it. Use after merging any migration numbered 0005 or higher — the Deploy workflow only auto-applies 0001–0004, so every later migration must be applied to remote D1 manually. Trigger on "apply the migration", "run the migration on prod/remote D1", "migrate remote".
disable-model-invocation: true
---

# Applying a Lifeloom migration to remote D1

The GitHub Deploy workflow **only auto-applies migrations 0001–0004**. Any migration **≥ 0005 must be applied to the remote D1 manually** after merge, or authenticated `/api/sync` starts 500-ing (materialize inserts into a column/table that doesn't exist). This skill codifies the exact, gotcha-laden process proven across migrations 0015–0022.

## Prereqs
- The migration file exists in `migrations/NNNN_<name>.sql` and is merged to `main`.
- The user is `wrangler login`'d (interactive browser auth — only the human can do this).

## The command form (avoids two known traps)
Run the wrangler **binary directly** to dodge the pnpm install-preflight (which can add stray deps + fail), and use `--command` NOT `--file` (`--file` returns OAuth 401s):

```bash
node node_modules/wrangler/bin/wrangler.js d1 execute pulse --remote --command "<ONE SQL STATEMENT>"
```

## Rules (each has burned us)
1. **One DDL statement per `--command`.** A single `--command` that batches a `CREATE TABLE` with its `CREATE INDEX` (or an `ALTER`) **fails and applies nothing**. Run the CREATE TABLE alone, then the CREATE INDEX alone, then any ALTER alone. (Two `ALTER`s in one command are fine, but when in doubt, one at a time.)
2. **Retry a lone "A request to the Cloudflare API failed".** This error is frequently **transient** — the exact same statement succeeds on a second try (seen on 0018 and 0021's CREATE TABLE). Retry once before assuming a real SQL problem. A `IF NOT EXISTS` on every CREATE makes retries idempotent.
3. **Verify after applying** with `pragma_table_info`, e.g.:
   ```bash
   node node_modules/wrangler/bin/wrangler.js d1 execute pulse --remote --command "SELECT count(*) AS cols FROM pragma_table_info('<table>')"
   # for an added column:
   node node_modules/wrangler/bin/wrangler.js d1 execute pulse --remote --command "SELECT count(*) AS has_col FROM pragma_table_info('<table>') WHERE name='<column>'"
   ```

## Recipe
1. Read `migrations/NNNN_<name>.sql` and split it into individual statements.
2. Apply each statement in order via a separate `--command` (retry a transient API failure once).
3. Verify with `pragma_table_info` that the table/column exists.
4. Smoke-test that sync still works: `/api/sync` unauth should return a clean **401** (not 500). A 500 after a schema change usually means a materialize/column mismatch — inspect `op_log` directly (`json_valid(payload)`, hlc format, entity_kinds) rather than trusting the possibly-stale server projection tables.

## Notes
- **op_log is the source of truth**; server materialized tables are projections and can be stale/divergent — never diagnose entity state from them, reconstruct from op_log (per id: latest-HLC delete? → gone; else active).
- Prod smoke-test HEAD-request page-200s do **not** exercise authenticated `/api/sync` — a sync/schema-breaking bug can ship undetected, so probe `/api/sync` unauth (expect 401) after any migration.
