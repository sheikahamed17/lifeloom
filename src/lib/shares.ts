import type { MoneyEntryRow } from '@/lib/dexie'

/**
 * Shared expenses — the pure maths.
 *
 * An `out` money entry can be shared with named people; each `expense_share`
 * says "this person owes this amount on this entry". Your share of an entry is
 * never stored: it is always `amount − Σ live shares`, so it cannot drift.
 *
 * Consumers see the SAME entries through one of two views:
 *
 * - **Spend view** (`withYourShare`): `amount` becomes your share. Totals,
 *   budgets, breakdowns, trends, anomalies, the digest and "ask your data" use
 *   this. An entry with no shares is returned as-is (same object), so screens
 *   without shares behave byte-for-byte as before.
 * - **Ledger view** (`withSettlements`): the full amount stays (the whole
 *   payment did leave the account) and every SETTLED share becomes a credit
 *   pseudo-entry into the account that received the repayment. Account
 *   balances and net worth use this. The pseudo-entries exist only inside the
 *   computation — they are never stored, listed or counted as income.
 */

export type ShareLike = {
  id: string
  money_entry_id: string
  person_id: string
  amount: number
  settled_at?: string | null
  settled_account_id?: string | null
  note?: string | null
  deleted_at?: string | null
}

export type PersonLike = { id: string; name: string; deleted_at?: string | null }

/** Shares that still exist (not tombstoned). */
export function liveShares<S extends ShareLike>(shares: S[]): S[] {
  return shares.filter(s => !s.deleted_at)
}

export function isSettled(share: ShareLike): boolean {
  return !!share.settled_at
}

/** Live shares grouped by the entry they belong to. */
export function sharesByEntry<S extends ShareLike>(shares: S[]): Map<string, S[]> {
  const map = new Map<string, S[]>()
  for (const s of shares) {
    if (s.deleted_at) continue
    const list = map.get(s.money_entry_id)
    if (list) list.push(s)
    else map.set(s.money_entry_id, [s])
  }
  return map
}

/** Σ amount of the live shares on one entry (settled or not — settling doesn't change what was theirs). */
export function sharesTotal(shares: ShareLike[] | undefined): number {
  let total = 0
  for (const s of shares ?? []) if (!s.deleted_at) total += s.amount
  return total
}

/** The part of an entry you actually spent: amount − Σ shares, clamped at 0. */
export type SpendRowLike = { id: string; amount: number; direction: 'in' | 'out' }

export function yourShare(entry: Pick<SpendRowLike, 'amount' | 'direction'>, shares: ShareLike[] | undefined): number {
  if (entry.direction !== 'out') return entry.amount
  return Math.max(0, entry.amount - sharesTotal(shares))
}

/**
 * Spend view: each shared `out` entry is returned with `amount` replaced by
 * your share. Unshared entries are returned unchanged (same reference).
 */
export function withYourShare<E extends SpendRowLike>(entries: E[], shares: ShareLike[]): E[] {
  if (shares.length === 0) return entries
  const byEntry = sharesByEntry(shares)
  if (byEntry.size === 0) return entries
  return entries.map(e => {
    const mine = byEntry.get(e.id)
    if (!mine || e.direction !== 'out') return e
    return { ...e, amount: yourShare(e, mine) }
  })
}

export const SETTLEMENT_ID_PREFIX = 'settlement:'

/**
 * Ledger view helper: one credit pseudo-entry per SETTLED share whose entry is
 * live, dated at `settled_at`, in the entry's currency, into the account that
 * received the repayment. Shares whose entry was deleted contribute nothing
 * (the owed maths joins through live entries, see `owedByPerson`).
 */
export function settlementEntries(entries: MoneyEntryRow[], shares: ShareLike[]): MoneyEntryRow[] {
  if (shares.length === 0) return []
  const byId = new Map<string, MoneyEntryRow>()
  for (const e of entries) if (!e.deleted_at) byId.set(e.id, e)
  const out: MoneyEntryRow[] = []
  for (const s of shares) {
    if (s.deleted_at || !s.settled_at || !s.settled_account_id) continue
    const entry = byId.get(s.money_entry_id)
    if (!entry) continue
    out.push({
      id: SETTLEMENT_ID_PREFIX + s.id,
      user_id: entry.user_id,
      amount: s.amount,
      currency: entry.currency,
      direction: 'in',
      category_id: null,
      description: entry.description,
      occurred_at: s.settled_at,
      source: 'manual',
      receipt_key: null,
      raw_input: null,
      recurring_rule_id: null,
      merchant: null,
      tags: [],
      account_id: s.settled_account_id,
      field_hlcs: {},
      deleted_at: null,
      created_at: s.settled_at,
      updated_at: s.settled_at,
    })
  }
  return out
}

/** Ledger view: the real entries plus a credit pseudo-entry per settled share. */
export function withSettlements<E extends MoneyEntryRow>(entries: E[], shares: ShareLike[]): MoneyEntryRow[] {
  const credits = settlementEntries(entries, shares)
  return credits.length === 0 ? entries : [...entries, ...credits]
}

export type OwedShare = {
  shareId: string
  entryId: string
  amount: number
  currency: string
  occurred_at: string
  description: string | null
  note: string | null
}

export type OwedRow = {
  personId: string
  name: string
  /** Outstanding total per currency (minor units). */
  byCurrency: Record<string, number>
  /** Outstanding shares, oldest first. */
  shares: OwedShare[]
}

/**
 * Who owes you what: unsettled live shares joined through LIVE entries,
 * grouped by person, per currency, oldest entry first. People with nothing
 * outstanding are omitted. Sorted by name for a stable UI.
 */
export function owedByPerson(entries: MoneyEntryRow[], shares: ShareLike[], people: PersonLike[]): OwedRow[] {
  const entryById = new Map<string, MoneyEntryRow>()
  for (const e of entries) if (!e.deleted_at && e.direction === 'out') entryById.set(e.id, e)
  const personById = new Map(people.map(p => [p.id, p]))
  const rows = new Map<string, OwedRow>()
  for (const s of shares) {
    if (s.deleted_at || s.settled_at) continue
    const entry = entryById.get(s.money_entry_id)
    if (!entry) continue
    let row = rows.get(s.person_id)
    if (!row) {
      row = { personId: s.person_id, name: personById.get(s.person_id)?.name ?? 'Someone', byCurrency: {}, shares: [] }
      rows.set(s.person_id, row)
    }
    row.byCurrency[entry.currency] = (row.byCurrency[entry.currency] ?? 0) + s.amount
    row.shares.push({
      shareId: s.id, entryId: entry.id, amount: s.amount, currency: entry.currency,
      occurred_at: entry.occurred_at, description: entry.description, note: s.note ?? null,
    })
  }
  for (const row of rows.values()) row.shares.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
  return Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name))
}

/** Headline "owed to you" in the primary currency; unconvertible currencies are reported, not guessed. */
export function owedTotal(
  rows: OwedRow[],
  toPrimary: (amount: number, currency: string) => number | null,
): { total: number; skipped: string[] } {
  let total = 0
  const skipped = new Set<string>()
  for (const row of rows) {
    for (const [currency, amount] of Object.entries(row.byCurrency)) {
      const conv = toPrimary(amount, currency)
      if (conv === null) skipped.add(currency)
      else total += conv
    }
  }
  return { total, skipped: Array.from(skipped) }
}

/**
 * Chip default: split `amount` equally between you and `people` others, so
 * "rent 20000 split with Arun" gives Arun 10000 and you 10000. Each other
 * person gets floor(amount / (people + 1)); the rounding remainder stays
 * yours, so Σ shares never exceeds the amount.
 */
export function equalShares(amount: number, people: number): number[] {
  if (people <= 0 || amount <= 0) return []
  const each = Math.floor(amount / (people + 1))
  return new Array<number>(people).fill(each)
}

/** True when the shares can sit on an entry of `amount`: all positive, Σ ≤ amount. */
export function isSharesValid(amount: number, shareAmounts: number[]): boolean {
  if (shareAmounts.some(a => !Number.isInteger(a) || a <= 0)) return false
  return shareAmounts.reduce((n, a) => n + a, 0) <= amount
}

/**
 * Voice settlement: "Arun paid me 10000" settles whole shares only, oldest
 * first, and only when a prefix of his outstanding shares sums EXACTLY to the
 * amount. Returns the share ids to settle, or null when no exact prefix exists
 * (the UI then opens the People page instead of guessing).
 */
export function planSettlement(outstandingOldestFirst: { shareId: string; amount: number }[], amount: number): string[] | null {
  if (amount <= 0) return null
  let sum = 0
  const ids: string[] = []
  for (const s of outstandingOldestFirst) {
    sum += s.amount
    ids.push(s.shareId)
    if (sum === amount) return ids
    if (sum > amount) return null
  }
  return null
}
