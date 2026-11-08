---
name: new-entity
description: Add a new persisted entity_kind to Lifeloom's op-log sync (money·tasks·… → a new domain/table). Use whenever adding a synced entity like account/goal/transfer/habit — it wires BOTH the server materializer AND the client Dexie apply so the entity actually persists + syncs. Trigger on "add a new entity", "new entity_kind", "new synced table", "persist a new domain".
---

# Adding a new persisted `entity_kind`

Lifeloom syncs via an **op-log with per-field HLC last-writer-wins**. A new persisted entity kind only works if it is wired on **BOTH sides** — the client half is the one that's easy to forget, and a miss means ops apply on the server but silently never appear in the client Dexie (or vice-versa). This skill is the exact, complete checklist, mirroring the entities shipped this way: `account` (migration 0017), `goal` (0018), `transfer` (0019), `habit`/`habit_log` (0021).

## When NOT to use this
- Adding a **field to an existing** entity → that's the lighter "column" pattern (e.g. `match_hints` on account @0020, `schedule` on habit @0022): a migration `ALTER … ADD COLUMN`, add the field to the entity's `*_FIELDS` array + op-schema + Dexie Row + `db.ts`. **No** materialize/sync-client case change and **no** Dexie version bump (unindexed field). The generic `materializeRow_LWW(…, FIELDS)` + generic `applyOp` pick it up automatically.
- Adding a new **value to an existing enum** → needs none of this.

## The mirror
Copy the shape of an existing entity end-to-end. `account` is the cleanest reference — read all of: `src/lib/op-schemas/account.ts`, `ACCOUNT_FIELDS` in `src/lib/entity-fields.ts`, `case 'account'` in `src/lib/materialize.ts`, `case 'account'` + the transaction table list in `src/lib/sync-client.ts`, `AccountRow` + the `this.version(N).stores({ accounts: … })` line in `src/lib/dexie.ts`, the accounts table in `src/lib/db.ts`, and `migrations/0017_accounts.sql`.

## Checklist (ALL are required for a new entity kind)

1. **Migration** `migrations/NNNN_<name>.sql` — `CREATE TABLE IF NOT EXISTS <table> (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, …domain cols…, field_hlcs TEXT NOT NULL, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)` + `CREATE INDEX IF NOT EXISTS idx_<table>_user ON <table>(user_id)`. (Apply to remote D1 later with the `apply-migration` skill — one statement at a time, retry transient errors.)
2. **op-schema** `src/lib/op-schemas/<name>.ts` — a zod `…PayloadSchema` for the domain fields (mirror account.ts: strings `.min(1).max(N)`, enums from `SUPPORTED_CURRENCIES`, nullable/optional as appropriate). Arrays/objects (like `tags`, `splits`) are stored as a JSON string in D1 — see the tags special-case in `materializeRow_LWW`.
3. **`entity-fields.ts`** — add `<NAME>_FIELDS = […domain fields…] as const` (the whitelist that drives BOTH server materialize AND client apply). Do NOT include id/user_id/field_hlcs/deleted_at/created_at/updated_at.
4. **Dexie** `src/lib/dexie.ts` — add `<Name>Row` type; declare `<table>!: EntityTable<<Name>Row, 'id'>`; add a **NEW** `this.version(N+1).stores({ <table>: 'id, user_id[, indexes]' })` line (find the current highest `version(N)` — do NOT mutate an existing version's stores, that breaks installed clients); add `db.<table>.clear()` to `resetDb()`.
5. **`db.ts`** — add the Kysely `<table>` table interface (all columns incl. field_hlcs/deleted_at/…).
6. **`materialize.ts`** (server) — `case '<kind>': return materializeRow_LWW(db, op, userId, '<table>', <NAME>_FIELDS)` AND add `'<table>'` to the `tableName` union parameter type of `materializeRow_LWW`.
7. **`sync-client.ts`** (client) — `case '<kind>': { const current = await db.<table>.get(op.entity_id); const next = applyOp(current as never, op); await db.<table>.put(next as never); return }` AND **add `db.<table>` to the `db.transaction('rw', [ … ])` table-list array** (the most-forgotten step — miss it and every apply of that kind throws).
8. **`src/types/ops.ts`** — add `'<kind>'` to the `ENTITY_KINDS` const array.
9. **Round-trip test** — a create op materializes to the server D1 row AND the client Dexie row (both carry the fields); a per-field-LWW update (change one field, others intact); a delete op sets `deleted_at` both sides. Grep `tests/` for existing `AccountRow`/`GoalRow` literals that must now typecheck.

## Gotchas (these bite)
- **The `db.transaction` table list (step 7)** and **`tableName` union (step 6)** are the silent-failure spots — a missing entry throws or skips at runtime, not at build.
- **Dexie version bump (step 4)** must be a NEW version line; a new *table* needs it, a new unindexed *field* does not.
- After the checklist, run the FULL gate `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. Then apply the migration to remote D1 with the `apply-migration` skill (the Deploy workflow only auto-applies 0001–0004).
- Consider whether hooks/widgets/pages need the entity too (a Settings CRUD page mirrors `settings/accounts/page.tsx`; a dashboard widget mirrors `dashboard/accounts-widget.tsx` + the `widgets.ts` catalog + `widget-card.tsx` dispatcher).
