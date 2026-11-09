# Lifeloom — Shared expenses: "my share" and people who owe you (design)

**Status:** Implemented 2026-11-09 (branch `feat/shared-expenses`) — plan: `docs/superpowers/plans/2026-11-09-lifeloom-shared-expenses.md`. Deviations from this draft are listed at the end of the plan.
**Date:** 2026-11-09
**Owner:** Sheik

## Problem

When you pay for something on behalf of others — rent split with a flatmate, a dinner you
covered, a bill a friend transfers you half of — Lifeloom today records the whole payment as
*your* spend. The account balance is right (the full amount did leave your account), but
"Spent this month", budgets, analytics and the weekly digest are all inflated by money that
was never yours to spend. When the other person pays you back there is no honest way to
record it: logging it as income invents earnings, and not logging it leaves the balance wrong.

Concretely (Sheik's case): rent ₹20,000 paid to the landlord every month, half owed by his
brother-in-law, who transfers it back. Spend should show ₹10,000. The bank balance should
drop by ₹20,000 and recover ₹10,000 when he pays. Nothing should appear as income.

## Goals (v1)

1. A money entry can be **shared with named people**, each owing a stated amount. The part
   you actually spent — **your share** — is `amount − Σ shares`.
2. **Spend** everywhere (totals, budgets, breakdowns, trends, anomalies, digest, "ask your
   data") counts **your share**. **Account balances** keep counting the **full amount**.
3. A person's repayment **settles** their share: the balance of the receiving account goes
   up by that amount, the "owed to you" figure goes down, and **nothing is recorded as
   income**.
4. You can see **who owes you what**, per person and in total, and mark shares paid.
5. Capture understands it: *"rent 20000 split with Arun"*, *"dinner 2400 shared with Arun
   and Priya"*, *"Arun paid me 10000"*.
6. Works offline and syncs like everything else (op-log, per-field LWW).

## Non-goals (v1 — explicit)

- Shares on **income** entries, or people who owe *each other* (no group netting, no
  Splitwise-style ledgers between third parties). Only "someone owes *you*".
- A share in a **different currency** from its entry. Shares are in the entry's currency.
- **Partial** settlement by voice. The People page can settle any amount; capture settles
  whole shares only (see Capture).
- Reminders, messages or payment links to the other person.
- Interest, due dates, or "you owe someone" (money *you* borrowed). Deferred.
- Combining **Shared with** and **Split** in the same chip (mirrors the existing
  split-and-recurring rule). A shared entry can still be split later via edit; shares stay
  on the part they were attached to.

## Sign conventions (review carefully)

For an `out` entry `E` with amount `A` and shares `S₁…Sₙ` (minor units, entry currency):

- `yourShare(E) = A − Σ Sᵢ`, always `≥ 0` (the chip refuses shares that exceed `A`).
- **Spend** consumers use `yourShare(E)` in place of `E.amount`. An entry with no shares is
  unchanged (`yourShare = A`), so existing data and tests are unaffected.
- **Account balance** of `E.account_id`: `− A` (unchanged, the full payment left).
- **Settlement** of share `Sᵢ` into account `R` at time `t`: balance of `R` `+ Sᵢ.amount`
  from `t`. It is **not** a money entry, so it never appears in income, spend, budgets or
  category breakdowns. Net worth therefore moves by exactly `+ Sᵢ.amount` once.
- **Owed to you** = Σ unsettled shares (grouped by person), in each entry's currency,
  converted to primary for the headline the way net worth is.
- Deleting the entry tombstones its shares (they vanish from "owed to you"). Deleting a
  share returns its amount to your share. Editing the amount below Σ shares is blocked in
  the chip with "shares total ₹X, reduce them first".

## Architecture

### Two new entity kinds (the new-entity_kind gotcha — BOTH sides)

**`person`** — who can owe you money.

| field | type | notes |
|---|---|---|
| `name` | text | unique per user by case-insensitive name at capture time (server maps names → ids like `captureCategories`; one person per name, canonical id first) |
| `is_archived` | 0/1 | archived people are hidden from pickers, kept for history |

**`expense_share`** — one person's part of one entry.

| field | type | notes |
|---|---|---|
| `money_entry_id` | text | the `out` entry this share belongs to |
| `person_id` | text | who owes it |
| `amount` | int | minor units, entry currency, `> 0` |
| `settled_at` | text/null | ISO when marked paid; null = outstanding |
| `settled_account_id` | text/null | the account the repayment landed in (required when settled) |
| `note` | text/null | free text ("Nov rent") |

Why a separate `expense_share` row rather than a `my_share` column on money entries: it
carries the person and the settlement state, several people can share one entry, the
derived `yourShare` can never drift from the stored shares, and the existing `money` entity
and every consumer that only knows `amount` keep working. Why not a `direction: 'in'` entry
for the settlement: income would have to special-case it everywhere; a settlement is a
state change on the debt, not a transaction of yours.

Wiring, both sides, as the CLAUDE.md gotcha demands:

- `migrations/0030_people_and_expense_shares.sql`: `people` and `expense_shares` tables
  (+ `field_hlcs`, `deleted_at`, timestamps like every projection), indexes on
  `(user_id, money_entry_id)` and `(user_id, person_id)`.
- `src/lib/op-schemas/person.ts`, `expense-share.ts`; `PERSON_FIELDS`,
  `EXPENSE_SHARE_FIELDS` in `entity-fields.ts`.
- Server `materialize.ts`: `case 'person'`, `case 'expense_share'`.
- Client `sync-client.ts`: `applyLocalOp` cases **and** both tables in the Dexie
  transaction list. Dexie **version 15** adds `people` and `expense_shares` stores.
- `tests/sync-integration.test.ts`: round-trip both kinds; `tests/lib/sync-client*.test.ts`:
  the Dexie table list includes both (this is the half that's easy to forget).

### Pure math (`src/lib/shares.ts`, unit-tested)

```ts
yourShare(entry, sharesForEntry): number            // amount − Σ live shares, clamped ≥ 0
owedByPerson(shares, entriesById, people): OwedRow[] // unsettled, per person, per currency
settlementsForAccount(shares, accountId): {amount, at}[]
```

Spend consumers switch from `e.amount` to `yourShare(e, shares)` via a `sharesByEntry`
map built once per screen (`useExpenseShares(userId)` live query). Audited consumers:

- `spend-breakdown.ts`, `query-money-exec.ts` (totals, breakdown, delta, series),
  `spending-anomaly.ts`, `weekly-spend.ts`, `budget*.ts` (`computeBudgetProgress`),
  `digest-aggregate.ts`, `forecast.ts`, the analytics page, the money card total, the
  spend-trend widget, `ingest-notification.ts` (budget alert after an import).
- **Not** changed: `accounts.ts` entry delta (full amount), card summary, transfers.
- `accounts.ts` gains settlements: `accountBalance` adds `Σ settled shares into this
  account`; `netWorthSeries` places each settlement at `settled_at`.

Each helper gets a test asserting `Σ yourShare + Σ shares = Σ amount` over a fixture with
shared, unshared and settled entries, and that a settled share changes nothing in spend.

### Chip (create and edit)

In the money chip, `out` entries only, below the category row:

- **Shared with…** opens a people picker (existing people + "Add Arun" inline create).
- Each chosen person gets an amount field. Default: the remaining amount split **equally**
  among chosen people (so "split with Arun" on ₹20,000 shows Arun ₹10,000, you ₹10,000).
  Amounts are editable; the row shows **"Your share ₹X"** live and blocks confirm when
  `Σ shares > amount`.
- Hidden while **Split** mode is on, and Split is hidden once a share is added (v1 rule).
- Edit mode: existing shares load; removing one tombstones it; settled shares show as
  "paid" and can't be edited (settle/unsettle lives on the People page).

Confirm writes the entry op, then one `expense_share` create per person (same transaction
boundary as the split create path: sequential `applyLocalOp`, one `pushPullOnce`).

### Money list

A shared entry's row shows **"you ₹10,000"** as the primary amount and a pill
**"Arun owes ₹10,000"** (or **"Arun paid"** once settled). The full amount stays visible in
the row's secondary line so the balance story is readable. Tapping the pill opens the
People page scrolled to that person.

### People page (`/settings/people`, linked from Settings and from the pills)

- Per person: **owed total** (primary currency) and a list of outstanding shares
  (entry description, date, amount), oldest first, each with **Mark paid** → asks which
  account received it (default: ★ default account) → sets `settled_at`,
  `settled_account_id`. **Mark all paid** settles them in one go, one account.
- **History**: settled shares, collapsible. **Unsettle** reverts a mistake.
- Rename / archive a person. Archiving keeps their history.

### Dashboard

An **Owed to you** widget: headline total and the top three people. Reuses
`owedByPerson`. Hidden when nothing is outstanding.

### Capture (router + agents)

- **Money agent** gains optional `shared_with: [{ name, amount: number | null }]`.
  Cues: "split with X", "shared with X and Y", "X owes half", "X's share 500". `null`
  amounts → equal split of the remainder at confirm time (the chip's default), so the
  model never does arithmetic it can get wrong. The chip shows the people pre-filled and
  the user confirms, as with every capture.
- Server maps `name` → `person_id` through a `capturePeople` helper modelled on
  `captureCategories` (one per case-insensitive name, canonical id first, create when
  missing — the chip shows "new" on a person it will create).
- **New router intent `settle_share`**: "Arun paid me 10000", "got 10k back from Arun for
  rent". The agent returns `{ person_name, amount, hint }`; the client resolves it as a
  **plan**, like query intents: find Arun's outstanding shares oldest-first and settle those
  whose amounts sum exactly to `amount` (whole shares, FIFO). Exact match → confirmation
  chip "Settle Arun's rent (Nov) ₹10,000 into Everyday Bank" → confirm. No exact match →
  the chip opens the People page with the amount pre-filled; no guessing.
- **Demo** canned phrases: `rent 20000 split with Arun` and `Arun paid me 10000`, with
  seed data holding one outstanding share so the second phrase has something to settle.
  Canned payloads must satisfy the types exactly (see the Nov 8 demo crash).

### Weekly digest

"Owed to you: ₹10,000 (Arun)" line when non-zero; spend figures already use `yourShare`
via `digest-aggregate.ts`.

## Data flow

1. Capture "rent 20000 split with Arun" → router `log_money` → money agent returns amount
   20000, `shared_with: [{name:'Arun', amount:null}]` → server resolves/creates person →
   chip shows ₹20,000, Arun ₹10,000, **Your share ₹10,000** → confirm → `money` create op
   + `expense_share` create op → Dexie → sync.
2. Money tab: total spend counts ₹10,000; row shows "you ₹10,000 · Arun owes ₹10,000";
   dashboard balance for Everyday Bank is down ₹20,000; Owed to you ₹10,000.
3. "Arun paid me 10000" → `settle_share` plan → exact FIFO match → chip → confirm →
   `expense_share` update `{settled_at, settled_account_id}` → balance +₹10,000, Owed to
   you ₹0, income unchanged.

## Correctness invariants (tested)

- `Σ yourShare(E) + Σ shares(E) = E.amount` for every `out` entry.
- `yourShare ≥ 0`; the chip cannot produce shares exceeding the amount.
- Settling moves exactly one account by exactly the share amount, once; unsettling reverts
  it; neither changes any spend, income or category figure.
- A deleted entry contributes nothing to owed totals even if its shares are not tombstoned
  yet (owed math joins through live entries).
- An entry with no shares renders and aggregates byte-for-byte as before (regression fixtures
  from the existing tests pass unchanged).
- Two devices adding different people with the same name before syncing resolve to one
  person at capture (canonical id first), like categories.

## Testing

- Unit: `shares.ts` helpers; each updated aggregation helper with a shared fixture.
- Sync integration: both new kinds round-trip; Dexie transaction list includes both tables.
- Agent eval cases (`tests/agents/router-eval-cases.ts`): six `shared_with` phrasings, four
  `settle_share` phrasings, two negatives ("paid Arun 500 for lunch" is *your* spend, not a
  settlement).
- Demo: the two new canned phrases are covered by the existing "every DEMO_EXAMPLE has a
  working canned response" test plus `isQueryPlan`/payload type checks.

## Global constraints

- Cron triggers stay at 5; no new scheduled work.
- No new heavy dependency.
- Money amounts remain minor units; JPY whole.
- Category display resolution rules unchanged; people get the same "all people for display,
  active people for pickers" split as categories.
- Migration 0030 applies via `wrangler d1 migrations apply DB --remote` in the deploy
  workflow; the demo deploy runs the same.

## Deferred follow-ups (noted, not built)

- "You owe" (money you borrowed) as the mirror image; then per-person netting.
- Partial settlement by voice; settlement across several people in one payment.
- Recurring shares: a monthly rent rule that pre-fills Arun's half each month.
- A share-of-share: splitting an entry *and* sharing parts of it in one chip.
- Export: shares and settlements in the data export/backup (must be done before v1 ships
  if the backup format is to stay complete — decide at plan time).

## Rough plan (for the implementation plan doc)

1. Schema + both-sides wiring + Dexie v15 + round-trip tests.
2. `shares.ts` math + switch the aggregation helpers, test-first.
3. `accounts.ts` settlements.
4. Chip "Shared with" + people picker + money-row pills.
5. People page + dashboard widget.
6. Agents: `shared_with`, `settle_share`, `capturePeople`, eval cases, demo phrases.
7. Digest line, export, docs, screenshots.

Steps 1–3 are the risky half and ship first behind no flag (an entry without shares is
unchanged). Steps 4–5 make it usable; 6–7 make it pleasant.
