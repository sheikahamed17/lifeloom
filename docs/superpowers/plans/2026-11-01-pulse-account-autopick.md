# Account auto-pick v2 — design & plan

**Goal:** Stop hand-tagging accounts. Ingested bank/card alerts land on the right account with zero setup beyond naming the account with its last-4; unknown cards are learned in one tap; past alerts get backfilled; manual/voice entries start on a default account.

**Context:** v1 (`2026-08-22-pulse-ingest-account-match.md`) added `match_hints` + `matchAccountFromText`. In practice it tagged nothing for a user whose accounts are named `Tata Neo 5872` etc. with empty hints — the matcher only reads `match_hints`. v1 also had latent false-positive / ambiguity issues (below).

## Design decisions (resolved with the user)

1. **Name digits are implicit hints.** Any standalone 4-digit group in an account's `name` counts as a card/account identifier. `Tata Neo 5872` works with no hint configured.
2. **Digit identifiers must appear in card/account context.** v1 substring-matched `5872` anywhere — `Rs 5872.00`, `Rs.15872`, a UPI ref. v2 extracts *identifiers* from the alert: a 4–6 digit run (digit-bounded) immediately preceded by a mask (`x1234`, `XX1234`, `**1234`, `•1234`, `...1234`) or a keyword (`ending`, `ending in`, `card`, `card no.`, `a/c`, `a/c no`, `acct`, `account`). An identifier's value is its **last 4**. A digit hint matches iff its last-4 is in that set. All-digit hints shorter than 4 are ignored.
3. **Keyword hints unchanged** (case-insensitive substring), but **rank below** a digit match.
4. **No silent guessing.** Score each account (digit match 2, keyword match 1). The unique top scorer wins; a tie → `null` (v1: oldest account won silently — e.g. hint `hdfc` on three HDFC accounts).
5. **Unknown-card pill.** A money row from `sms`/`email` with no `account_id` whose `raw_input` has an identifier shows `💳 •5872 — which account?`. Picking an account tags the entry, appends `5872` to that account's `match_hints` (skipped if already covered or it would exceed 200 chars), and retags other untagged alerts that now match.
6. **Backfill.** Settings → Accounts → "Re-scan past alerts": scan untagged `sms`/`email` entries' stored `raw_input` with the same matcher, show the count, apply as `money` update ops (`{ account_id }` only). Never overwrites an existing account.
7. **Default account.** New account column `is_default` (0/1), ★ toggle on Settings → Accounts (starring one un-stars the others). The money chip in **create** mode pre-selects it when the draft has no account; an explicit choice (including "No account") wins; **edit** mode never applies it. Ingested alerts never fall back to the default (wrong card is worse than none). Multi-device double-star → most recently updated starred active account wins.

## Global constraints

- Gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all green.
- `is_default` is a new column on the existing `account` entity (the `match_hints` pattern): migration `0027`, `ACCOUNT_FIELDS`, `AccountPayloadSchema`, `AccountRow` (Dexie, unindexed → no version bump), Kysely `AccountsTable`. No materialize/sync-client case change. Column is `INTEGER NOT NULL DEFAULT 0`; the schema never allows `null`.
- Matching stays deterministic and pure (no LLM change). Ingest stays best-effort (account lookup failure never fails ingest).
- `git add` named files only; don't push without the user.

## Tasks

1. **Matcher v2** — `src/lib/account-match.ts`: `extractAlertIdentifiers(text)`, `accountTokens(account)`, `matchAccountFromText` (scored, tie → null), `planAccountBackfill(entries, accounts)`, `addHintDigits(hints, last4)`. Test-first incl. real HDFC alert formats + fast-check (an amount/ref digit run is never an identifier).
2. **Ingest wiring** — route passes `name` through (already `selectAll`); route tests for name-digit match + amount false positive.
3. **`is_default` field** — migration 0027 + types + `pickDefaultAccount` / `resolveDraftAccountId` pure helpers + round-trip test.
4. **Settings → Accounts** — ★ default toggle, "Re-scan past alerts" (scan → count → apply), hint help text mentioning name digits.
5. **Money chip** — default account pre-select in create mode.
6. **Money list** — unknown-card pill + inline account picker → tag + learn + retag.
7. **Gate + review.** Post-merge: apply migration 0027 to remote D1 (deploy workflow runs `migrations apply`).
