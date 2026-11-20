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
 *
 * **Repayments** are real money entries tagged with `settles_person_id`: a bank
 * credit from Arun (`in`), or Arun's money you gave back (`out`). They are real
 * movements, so the ledger view keeps them as they are; the spend view drops
 * them, so they are never income or spending; and `owedByPerson` offsets them
 * against what that person owes, oldest debt first. The offset is never
 * stored, so it can't drift: delete a repayment and the debt is back.
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

/** True for a repayment entry (money in from, or back out to, a person). */
export function isRepayment(e: { settles_person_id?: string | null }): boolean {
  return !!e.settles_person_id
}

/**
 * True when the entry was CREATED as a repayment (cash recorded on the People
 * page, or "Arun paid me 300"), not an existing entry tagged later. The create
 * op stamps every field with one HLC, so the tag and `source` share it; tagging
 * later gives the tag a newer one. Removing a created repayment deletes it;
 * removing a tag from anything else only untags it, so the user's own entry stays.
 */
export function createdAsRepayment(e: { settles_person_id?: string | null; field_hlcs?: Record<string, string> }): boolean {
  const hlcs = e.field_hlcs ?? {}
  return !!e.settles_person_id && !!hlcs.settles_person_id && hlcs.settles_person_id === hlcs.source
}

/** The part of an entry you actually spent: amount − Σ shares, clamped at 0. */
export type SpendRowLike = { id: string; amount: number; direction: 'in' | 'out'; settles_person_id?: string | null }

export function yourShare(entry: Pick<SpendRowLike, 'amount' | 'direction'>, shares: ShareLike[] | undefined): number {
  if (entry.direction !== 'out') return entry.amount
  return Math.max(0, entry.amount - sharesTotal(shares))
}

/**
 * Spend view: each shared `out` entry is returned with `amount` replaced by
 * your share, and repayments are left out (never income, never spending).
 * With no shares and no repayments the same array comes back.
 */
export function withYourShare<E extends SpendRowLike>(entries: E[], shares: ShareLike[]): E[] {
  const anyRepayment = entries.some(isRepayment)
  if (!anyRepayment && shares.length === 0) return entries
  const byEntry = sharesByEntry(shares)
  if (!anyRepayment && byEntry.size === 0) return entries
  const out: E[] = []
  for (const e of entries) {
    if (isRepayment(e)) continue
    const mine = byEntry.get(e.id)
    out.push(!mine || e.direction !== 'out' ? e : { ...e, amount: yourShare(e, mine) })
  }
  return out
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
  /** How much of `amount` repayments have covered so far (oldest debt first); always < amount. */
  paid: number
  currency: string
  occurred_at: string
  description: string | null
  note: string | null
}

/** A repayment entry, as the People page lists it. */
export type PersonRepayment = {
  entryId: string
  amount: number
  currency: string
  /** in: they paid you; out: you gave their money back. */
  direction: 'in' | 'out'
  occurred_at: string
  account_id: string | null
  source: MoneyEntryRow['source']
}

export type OwedRow = {
  personId: string
  name: string
  /** Net per currency (minor units): positive = they owe you, negative = you hold their money. Zeroes omitted. */
  byCurrency: Record<string, number>
  /** Shares not yet covered, oldest first. */
  shares: OwedShare[]
  /** Their repayment entries, newest first. */
  repayments: PersonRepayment[]
}

/**
 * Where each person stands: their unsettled live shares (joined through LIVE
 * `out` entries that aren't repayments themselves), minus what they repaid
 * (`in` repayments), plus what you gave back (`out` repayments), per currency.
 * Repayments cover the oldest shares first; covered shares drop out of
 * `shares`. People who are square in every currency are omitted. Sorted by
 * name for a stable UI.
 */
export function owedByPerson(entries: MoneyEntryRow[], shares: ShareLike[], people: PersonLike[]): OwedRow[] {
  const spendById = new Map<string, MoneyEntryRow>()
  for (const e of entries) if (!e.deleted_at && e.direction === 'out' && !isRepayment(e)) spendById.set(e.id, e)
  const personById = new Map(people.map(p => [p.id, p]))
  const rows = new Map<string, OwedRow>()
  const rowFor = (personId: string): OwedRow => {
    let row = rows.get(personId)
    if (!row) {
      row = { personId, name: personById.get(personId)?.name ?? 'Someone', byCurrency: {}, shares: [], repayments: [] }
      rows.set(personId, row)
    }
    return row
  }

  for (const s of shares) {
    if (s.deleted_at || s.settled_at) continue
    const entry = spendById.get(s.money_entry_id)
    if (!entry) continue
    const row = rowFor(s.person_id)
    row.byCurrency[entry.currency] = (row.byCurrency[entry.currency] ?? 0) + s.amount
    row.shares.push({
      shareId: s.id, entryId: entry.id, amount: s.amount, paid: 0, currency: entry.currency,
      occurred_at: entry.occurred_at, description: entry.description, note: s.note ?? null,
    })
  }

  // Net repaid per person and currency: what came in from them minus what went back.
  const repaid = new Map<string, Map<string, number>>()
  for (const e of entries) {
    if (e.deleted_at || !e.settles_person_id) continue
    const row = rowFor(e.settles_person_id)
    const signed = e.direction === 'in' ? e.amount : -e.amount
    row.byCurrency[e.currency] = (row.byCurrency[e.currency] ?? 0) - signed
    row.repayments.push({
      entryId: e.id, amount: e.amount, currency: e.currency, direction: e.direction,
      occurred_at: e.occurred_at, account_id: e.account_id, source: e.source,
    })
    const byCurrency = repaid.get(e.settles_person_id) ?? new Map<string, number>()
    byCurrency.set(e.currency, (byCurrency.get(e.currency) ?? 0) + signed)
    repaid.set(e.settles_person_id, byCurrency)
  }

  for (const row of rows.values()) {
    row.shares.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    row.repayments.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    // Cover the oldest shares first with what they repaid; drop the fully covered ones.
    const left = new Map(repaid.get(row.personId) ?? [])
    row.shares = row.shares.filter(s => {
      const available = left.get(s.currency) ?? 0
      if (available <= 0) return true
      const used = Math.min(available, s.amount)
      left.set(s.currency, available - used)
      s.paid = used
      return used < s.amount
    })
    for (const [currency, amount] of Object.entries(row.byCurrency)) if (amount === 0) delete row.byCurrency[currency]
  }
  return Array.from(rows.values())
    .filter(r => Object.keys(r.byCurrency).length > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** A row's net split into what they owe you and what you hold for them (both positive), per currency. */
export function owesAndHolds(row: Pick<OwedRow, 'byCurrency'>): { owes: [string, number][]; holds: [string, number][] } {
  const owes: [string, number][] = []
  const holds: [string, number][] = []
  for (const [currency, amount] of Object.entries(row.byCurrency)) {
    if (amount > 0) owes.push([currency, amount])
    else if (amount < 0) holds.push([currency, -amount])
  }
  return { owes, holds }
}

/**
 * Money in that could be someone's repayment, for "Record a payment": live,
 * untagged `in` entries in `currency` from the last 60 days, the amount closest
 * to `amount` first, then newest. At most 5.
 */
export function repaymentCandidates<E extends MoneyEntryRow>(entries: E[], currency: string, amount: number, nowIso: string): E[] {
  const since = new Date(new Date(nowIso).getTime() - 60 * 24 * 60 * 60 * 1000).toISOString()
  return entries
    .filter(e => !e.deleted_at && e.direction === 'in' && !isRepayment(e) && e.currency === currency && e.occurred_at >= since)
    .sort((a, b) => Math.abs(a.amount - amount) - Math.abs(b.amount - amount) || b.occurred_at.localeCompare(a.occurred_at))
    .slice(0, 5)
}

const TWIN_WINDOW_MS = 10 * 24 * 60 * 60 * 1000

/**
 * The by-hand repayment (cash, typed or spoken: not email/SMS) that a bank
 * alert `credit` is probably the same money as: same amount, currency and
 * direction, within 10 days either side; the closest in time wins. Needs you
 * offers to merge them so one payment isn't counted twice.
 */
export function recordedTwin<E extends MoneyEntryRow>(credit: E, entries: E[]): E | null {
  const at = new Date(credit.occurred_at).getTime()
  let best: E | null = null
  let bestGap = Infinity
  for (const e of entries) {
    if (e.id === credit.id || e.deleted_at || !isRepayment(e) || e.source === 'email' || e.source === 'sms') continue
    if (e.amount !== credit.amount || e.currency !== credit.currency || e.direction !== credit.direction) continue
    const gap = Math.abs(new Date(e.occurred_at).getTime() - at)
    if (gap <= TWIN_WINDOW_MS && gap < bestGap) { best = e; bestGap = gap }
  }
  return best
}

/**
 * Headline "owed to you" in the primary currency: only what people owe you
 * (money you hold for someone doesn't reduce it). Unconvertible currencies are
 * reported, not guessed.
 */
export function owedTotal(
  rows: OwedRow[],
  toPrimary: (amount: number, currency: string) => number | null,
): { total: number; skipped: string[] } {
  let total = 0
  const skipped = new Set<string>()
  for (const row of rows) {
    for (const [currency, amount] of Object.entries(row.byCurrency)) {
      if (amount <= 0) continue
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
