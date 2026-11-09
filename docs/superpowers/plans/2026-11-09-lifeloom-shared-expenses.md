# Shared expenses — implementation plan

**Spec:** `docs/superpowers/specs/2026-11-09-lifeloom-shared-expenses-design.md` (approved 2026-11-09).
**Goal:** a money entry can be shared with named people; spend counts *your share*, balances count the full amount, a repayment settles the share and is never income.

## Decisions carried from the spec

- Two new entity kinds: `person` and `expense_share`. `yourShare = amount − Σ live shares` is derived, never stored.
- Settlement = `{ settled_at, settled_account_id }` on the share. No money entry is written.
- Spend consumers use `yourShare`; `accounts.ts` keeps the full amount and adds settlements as credits to `settled_account_id`.
- Shared-with and Split are mutually exclusive in one chip. Voice settlement settles whole shares only, FIFO exact match.
- Export (Settings → Data) must include `people` and `expense_shares` before merge: a backup that drops debts is not a backup.

## Global constraints

- Gate before every commit: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
- New entity kinds → the `new-entity` skill checklist, BOTH sides, Dexie version 15, migration 0030.
- Fixtures without shares must aggregate byte-for-byte as before; every switched helper takes shares as an optional argument defaulting to "none".
- No new dependency; cron count unchanged; minor units everywhere.
- `git add` named files only.

## Tasks

1. **Schema + wiring** — `migrations/0030_people_and_expense_shares.sql`; `op-schemas/person.ts`, `op-schemas/expense-share.ts`; `PERSON_FIELDS`, `EXPENSE_SHARE_FIELDS`; `PersonRow`, `ExpenseShareRow`, Dexie v15 (`people: 'id, user_id'`, `expense_shares: 'id, user_id, money_entry_id, person_id'`), `resetDb`; Kysely tables; `materialize.ts` cases + union; `sync-client.ts` cases + transaction list; `ENTITY_KINDS`; demo `DATA_TABLES`. Tests: `tests/people-shares-roundtrip.test.ts` (create/update/delete both kinds on the client), `schema-fields-consistency` entries, sync-integration mock tables.
2. **Math** — `src/lib/shares.ts`: `yourShare`, `sharesByEntry`, `owedByPerson`, `settlementsForAccount`, `planEqualShares` (chip default), `planSettlement` (FIFO exact match). Test-first, including the `Σ yourShare + Σ shares = Σ amount` invariant.
3. **Spend consumers** — thread `sharesByEntry` through `spend-breakdown.ts`, `query-money-exec.ts`, `spending-anomaly.ts`, `weekly-spend.ts`, budget progress, `digest-aggregate.ts`, `forecast.ts`, analytics page, money card total, spend-trend widget, `ingest-notification.ts`. Each gets a shared-fixture test. `accounts.ts`: settlements in `accountBalance` and `netWorthSeries`.
4. **Chip + money list** — `useExpenseShares`, `usePeople`/`useAllPeople`; "Shared with…" picker with inline create; equal-split default; live "Your share"; blocked when Σ shares > amount; hidden with Split; edit mode loads/removes shares; confirm writes entry then share ops. Money row: "you ₹X" + per-person pill.
5. **People page + widget** — `/settings/people`: owed per person, Mark paid (account picker, default ★), Mark all paid, history + Unsettle, rename/archive. Settings link. Dashboard `owed-widget` via the widget catalog.
6. **Agents** — money agent `shared_with`; `capturePeople` (server, mirrors `captureCategories`); router intent `settle_share` + agent; client plan execution → confirmation chip or People page with amount pre-filled; eval cases; demo phrases + seed share.
7. **Digest, export, docs** — "Owed to you" digest line; export/import both tables; CHANGELOG; README feature line; memory note.

Steps 1–3 merge first (no visible change without shares), then 4–5, then 6–7.
