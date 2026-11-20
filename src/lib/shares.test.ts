import { describe, it, expect } from 'vitest'
import type { MoneyEntryRow } from '@/lib/dexie'
import {
  yourShare, withYourShare, settlementEntries, withSettlements, owedByPerson, owedTotal,
  equalShares, isSharesValid, sharesByEntry, SETTLEMENT_ID_PREFIX, type ShareLike,
  isRepayment, owesAndHolds, repaymentCandidates, recordedTwin, createdAsRepayment,
} from './shares'
import { computeSpendBreakdown } from './spend-breakdown'
import { accountBalance, netWorthSeries } from './accounts'

const row = (o: Partial<MoneyEntryRow>): MoneyEntryRow => ({
  id: 'x', user_id: 'u', amount: 0, currency: 'INR', direction: 'out', category_id: null, description: null,
  occurred_at: '2026-11-01T04:30:00.000Z', source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null,
  merchant: null, tags: [], account_id: 'acc-bank', field_hlcs: {}, deleted_at: null, created_at: '', updated_at: '', ...o,
})
const share = (o: Partial<ShareLike> & { id: string; money_entry_id: string }): ShareLike => ({
  person_id: 'p-arun', amount: 0, settled_at: null, settled_account_id: null, note: null, deleted_at: null, ...o,
})

// Sheik's case: rent ₹20,000, half owed by Arun; a dinner shared with two people; an unshared coffee.
const rent = row({ id: 'm-rent', amount: 2000000, description: 'rent', category_id: 'cat-rent' })
const dinner = row({ id: 'm-dinner', amount: 240000, description: 'dinner', category_id: 'cat-food', occurred_at: '2026-11-03T15:00:00.000Z' })
const coffee = row({ id: 'm-coffee', amount: 12000, description: 'coffee', category_id: 'cat-food', occurred_at: '2026-11-04T08:00:00.000Z' })
const salary = row({ id: 'm-salary', amount: 10000000, direction: 'in', description: 'salary' })
const entries = [rent, dinner, coffee, salary]
const shares: ShareLike[] = [
  share({ id: 's-rent', money_entry_id: 'm-rent', amount: 1000000, note: 'Nov rent' }),
  share({ id: 's-dinner-arun', money_entry_id: 'm-dinner', amount: 80000 }),
  share({ id: 's-dinner-priya', money_entry_id: 'm-dinner', person_id: 'p-priya', amount: 80000 }),
]
const people = [{ id: 'p-arun', name: 'Arun' }, { id: 'p-priya', name: 'Priya' }]

describe('yourShare / withYourShare (spend view)', () => {
  it('your share is amount − Σ shares; unshared and income entries are untouched', () => {
    const by = sharesByEntry(shares)
    expect(yourShare(rent, by.get('m-rent'))).toBe(1000000)
    expect(yourShare(dinner, by.get('m-dinner'))).toBe(80000)
    expect(yourShare(coffee, by.get('m-coffee'))).toBe(12000)
    expect(yourShare(salary, undefined)).toBe(10000000)
  })

  it('invariant: Σ yourShare + Σ shares = Σ amount over every out entry', () => {
    const view = withYourShare(entries, shares)
    const outAmount = entries.filter(e => e.direction === 'out').reduce((n, e) => n + e.amount, 0)
    const outMine = view.filter(e => e.direction === 'out').reduce((n, e) => n + e.amount, 0)
    const owed = shares.reduce((n, s) => n + s.amount, 0)
    expect(outMine + owed).toBe(outAmount)
  })

  it('clamps at zero when shares exceed the amount (never negative spend)', () => {
    expect(yourShare(coffee, [share({ id: 'x', money_entry_id: 'm-coffee', amount: 99999 })])).toBe(0)
  })

  it('a settled share still reduces your share (settling changes the debt, not what you spent)', () => {
    const settled = shares.map(s => ({ ...s, settled_at: '2026-11-05T10:00:00.000Z', settled_account_id: 'acc-bank' }))
    expect(withYourShare(entries, settled).find(e => e.id === 'm-rent')?.amount).toBe(1000000)
  })

  it('tombstoned shares are ignored', () => {
    const dead = shares.map(s => ({ ...s, deleted_at: '2026-11-05T00:00:00.000Z' }))
    expect(withYourShare(entries, dead).find(e => e.id === 'm-rent')?.amount).toBe(2000000)
  })

  it('returns the same array and the same objects when there is nothing to apply (regression guard)', () => {
    expect(withYourShare(entries, [])).toBe(entries)
    const view = withYourShare(entries, shares)
    expect(view.find(e => e.id === 'm-coffee')).toBe(coffee)
    expect(view.find(e => e.id === 'm-salary')).toBe(salary)
  })

  it('feeds the existing spend breakdown without changing it: rent counts ₹10,000 not ₹20,000', () => {
    const resolve = (id: string | null) => (id === 'cat-rent' ? { name: 'Rent', icon: null } : id === 'cat-food' ? { name: 'Food', icon: null } : null)
    const bd = computeSpendBreakdown(withYourShare(entries, shares), { resolve, toPrimary: e => e.amount })
    expect(bd.spend).toBe(1000000 + 80000 + 12000)
    expect(bd.rows.find(r => r.name === 'Rent')?.amount).toBe(1000000)
    expect(bd.income).toBe(10000000)
  })
})

describe('settlementEntries / withSettlements (ledger view)', () => {
  const settledRent = [{ ...shares[0], settled_at: '2026-11-05T10:00:00.000Z', settled_account_id: 'acc-bank' }, shares[1], shares[2]]
  const bank = { id: 'acc-bank', name: 'Bank', type: 'asset' as const, opening_balance: 5000000, currency: 'INR', icon: null }

  it('an outstanding share produces no pseudo-entry; a settled one produces one credit into the receiving account', () => {
    expect(settlementEntries(entries, shares)).toEqual([])
    const credits = settlementEntries(entries, settledRent)
    expect(credits).toHaveLength(1)
    expect(credits[0]).toMatchObject({
      id: SETTLEMENT_ID_PREFIX + 's-rent', direction: 'in', amount: 1000000, currency: 'INR',
      account_id: 'acc-bank', occurred_at: '2026-11-05T10:00:00.000Z', category_id: null,
    })
  })

  it('balance: the full rent leaves the account, the repayment comes back once; spend view is untouched', () => {
    const before = accountBalance(bank, withSettlements(entries, shares), [], e => e.amount)
    expect(before).toBe(5000000 - 2000000 - 240000 - 12000 + 10000000)
    const after = accountBalance(bank, withSettlements(entries, settledRent), [], e => e.amount)
    expect(after - before).toBe(1000000)
    // Unsettling reverts it exactly.
    expect(accountBalance(bank, withSettlements(entries, shares), [], e => e.amount)).toBe(before)
  })

  it('a settlement into a different account credits that account, not the one that paid', () => {
    const wallet = { ...bank, id: 'acc-wallet', opening_balance: 0 }
    const s = [{ ...shares[0], settled_at: '2026-11-05T10:00:00.000Z', settled_account_id: 'acc-wallet' }]
    const ledger = withSettlements(entries, s)
    expect(accountBalance(wallet, ledger, [], e => e.amount)).toBe(1000000)
    expect(accountBalance(bank, ledger, [], e => e.amount)).toBe(accountBalance(bank, entries, [], e => e.amount))
  })

  it('net worth series places the settlement at settled_at', () => {
    const ledger = withSettlements(entries, settledRent)
    const periods = [
      { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z', label: 'Oct' },
      { from: '2026-11-01T00:00:00.000Z', to: '2026-11-05T00:00:00.000Z', label: 'early Nov' },
      { from: '2026-11-05T00:00:00.000Z', to: '2026-12-01T00:00:00.000Z', label: 'Nov' },
    ]
    const current = 1234
    const pts = netWorthSeries(current, ledger, new Set(['acc-bank']), periods, e => e.amount)
    // Before the settlement the series is ₹10,000 lower than after it.
    expect(pts[2].net - pts[1].net).toBe(1000000)
  })

  it('a settled share whose entry was deleted contributes nothing', () => {
    const gone = entries.map(e => (e.id === 'm-rent' ? { ...e, deleted_at: '2026-11-06T00:00:00.000Z' } : e))
    expect(settlementEntries(gone, settledRent)).toEqual([])
  })

  it('a settled share with no receiving account is treated as outstanding', () => {
    const half = [{ ...shares[0], settled_at: '2026-11-05T10:00:00.000Z', settled_account_id: null }]
    expect(settlementEntries(entries, half)).toEqual([])
  })

  it('returns the same array when nothing is settled (regression guard)', () => {
    expect(withSettlements(entries, shares)).toBe(entries)
  })
})

describe('owedByPerson / owedTotal', () => {
  it('groups outstanding shares per person and currency, oldest first, sorted by name', () => {
    const rows = owedByPerson(entries, shares, people)
    expect(rows.map(r => r.name)).toEqual(['Arun', 'Priya'])
    expect(rows[0].byCurrency).toEqual({ INR: 1080000 })
    expect(rows[0].shares.map(s => s.shareId)).toEqual(['s-rent', 's-dinner-arun'])
    expect(rows[0].shares[0]).toMatchObject({ entryId: 'm-rent', amount: 1000000, currency: 'INR', description: 'rent', note: 'Nov rent' })
    expect(rows[1].byCurrency).toEqual({ INR: 80000 })
  })

  it('settled shares and shares on deleted entries drop out; a person with nothing outstanding is omitted', () => {
    const settled = shares.map(s => (s.id === 's-dinner-priya' ? { ...s, settled_at: '2026-11-05T10:00:00.000Z', settled_account_id: 'acc-bank' } : s))
    expect(owedByPerson(entries, settled, people).map(r => r.name)).toEqual(['Arun'])
    const gone = entries.map(e => (e.id === 'm-rent' ? { ...e, deleted_at: 'x' } : e))
    expect(owedByPerson(gone, shares, people)[0].byCurrency).toEqual({ INR: 80000 })
  })

  it('an unknown person id still shows (as "Someone") rather than losing the debt', () => {
    expect(owedByPerson(entries, shares, [])[0].name).toBe('Someone')
  })

  it('headline total converts per currency and reports what it could not convert', () => {
    const rows = owedByPerson(entries, [...shares, share({ id: 's-usd', money_entry_id: 'm-usd', amount: 500 })], people)
    const withUsd = owedByPerson([...entries, row({ id: 'm-usd', amount: 5000, currency: 'USD' })], [...shares, share({ id: 's-usd', money_entry_id: 'm-usd', amount: 500 })], people)
    expect(rows[0].byCurrency.USD).toBeUndefined()
    const t = owedTotal(withUsd, (amt, cur) => (cur === 'INR' ? amt : null))
    expect(t.total).toBe(1080000 + 80000)
    expect(t.skipped).toEqual(['USD'])
  })
})

describe('equalShares / isSharesValid', () => {
  it('splits between you and the others: 20000 with one person → 10000 each', () => {
    expect(equalShares(2000000, 1)).toEqual([1000000])
    expect(equalShares(240000, 2)).toEqual([80000, 80000])
  })
  it('rounding remainder stays yours, so Σ shares ≤ amount', () => {
    const s = equalShares(100, 2)                      // 33 each, you keep 34
    expect(s).toEqual([33, 33])
    expect(isSharesValid(100, s)).toBe(true)
  })
  it('no people or nothing to split → no shares', () => {
    expect(equalShares(500, 0)).toEqual([])
    expect(equalShares(0, 2)).toEqual([])
  })
  it('rejects a zero share, a fractional share, or shares exceeding the amount', () => {
    expect(isSharesValid(100, [50, 50])).toBe(true)
    expect(isSharesValid(100, [50, 0])).toBe(false)
    expect(isSharesValid(100, [50.5, 10])).toBe(false)
    expect(isSharesValid(100, [60, 50])).toBe(false)
  })
})

// Repayments are real money entries tagged with the person (settles_person_id):
// `in` = they paid you, `out` = you gave their money back.
describe('repayments (bank credits tagged to a person)', () => {
  const tickets = row({ id: 'm-tickets', amount: 60000, description: 'movie tickets', occurred_at: '2026-11-06T10:00:00.000Z' })
  const ticketShare = share({ id: 's-tickets', money_entry_id: 'm-tickets', amount: 60000 })
  const credit = (o: Partial<MoneyEntryRow>) => row({ direction: 'in', source: 'email', settles_person_id: 'p-arun', ...o })

  it('isRepayment is true only for tagged entries', () => {
    expect(isRepayment(credit({ id: 'c' }))).toBe(true)
    expect(isRepayment(salary)).toBe(false)
  })

  it('spend view drops repayments in both directions, so they are never income or spending', () => {
    const back = credit({ id: 'c-back', amount: 30000 })
    const returned = row({ id: 'r-out', amount: 5000, settles_person_id: 'p-arun' })
    const view = withYourShare([coffee, salary, back, returned], [])
    expect(view.map(e => e.id)).toEqual(['m-coffee', 'm-salary'])
  })

  it('spend view without shares or repayments is the same array (screens unchanged)', () => {
    const list = [coffee, salary]
    expect(withYourShare(list, [])).toBe(list)
  })

  it('a partial repayment lowers what they owe and marks the oldest share part-paid', () => {
    const rows = owedByPerson([rent, tickets, credit({ id: 'c1', amount: 300000, occurred_at: '2026-11-07T10:00:00.000Z' })],
      [share({ id: 's-rent', money_entry_id: 'm-rent', amount: 1000000 }), ticketShare], people)
    expect(rows[0].byCurrency).toEqual({ INR: 1000000 + 60000 - 300000 })
    expect(rows[0].shares.map(s => [s.shareId, s.paid])).toEqual([['s-rent', 300000], ['s-tickets', 0]])
    expect(rows[0].repayments.map(r => r.entryId)).toEqual(['c1'])
  })

  it('a repayment that covers whole shares removes them from the outstanding list', () => {
    const rows = owedByPerson([tickets, credit({ id: 'c1', amount: 60000 })], [ticketShare], people)
    expect(rows).toEqual([])   // settled up: nothing owed either way
  })

  it('an advance (paid you before you paid) means you hold their money, until the spend arrives', () => {
    const advance = credit({ id: 'c-adv', amount: 60000, occurred_at: '2026-11-01T10:00:00.000Z' })
    const before = owedByPerson([advance], [], people)
    expect(before[0].byCurrency).toEqual({ INR: -60000 })
    expect(owesAndHolds(before[0])).toEqual({ owes: [], holds: [['INR', 60000]] })
    // The tickets cost 550, so you still hold 50 of Arun's…
    const cheaper = row({ id: 'm-tickets', amount: 55000, occurred_at: '2026-11-06T10:00:00.000Z' })
    const after = owedByPerson([advance, cheaper], [share({ id: 's-t', money_entry_id: 'm-tickets', amount: 55000 })], people)
    expect(after[0].byCurrency).toEqual({ INR: -5000 })
    // …until you give it back.
    const gaveBack = row({ id: 'r-out', amount: 5000, settles_person_id: 'p-arun' })
    expect(owedByPerson([advance, cheaper, gaveBack], [share({ id: 's-t', money_entry_id: 'm-tickets', amount: 55000 })], people)).toEqual([])
  })

  it('repayments only offset debts in the same currency', () => {
    const usd = row({ id: 'm-usd', amount: 5000, currency: 'USD' })
    const rows = owedByPerson([usd, credit({ id: 'c-inr', amount: 1000 })], [share({ id: 's-usd', money_entry_id: 'm-usd', amount: 5000 })], people)
    expect(rows[0].byCurrency).toEqual({ USD: 5000, INR: -1000 })
  })

  it('deleted repayments are ignored', () => {
    const gone = credit({ id: 'c-gone', amount: 60000, deleted_at: 'x' })
    expect(owedByPerson([tickets, gone], [ticketShare], people)[0].byCurrency).toEqual({ INR: 60000 })
  })

  it('a repayment entry is never itself treated as a shared spend', () => {
    const odd = row({ id: 'm-odd', amount: 1000, settles_person_id: 'p-arun' })
    const rows = owedByPerson([odd], [share({ id: 's-odd', money_entry_id: 'm-odd', amount: 1000 })], people)
    expect(rows[0].shares).toEqual([])
    expect(rows[0].byCurrency).toEqual({ INR: 1000 })   // only the "gave back" counts
  })

  it('owedTotal counts only what people owe you, not money you hold for them', () => {
    const rows = owedByPerson([rent, credit({ id: 'c-priya', amount: 5000, settles_person_id: 'p-priya' })],
      [share({ id: 's-rent', money_entry_id: 'm-rent', amount: 1000000 })], people)
    expect(owedTotal(rows, amt => amt).total).toBe(1000000)
  })

  it('repaymentCandidates: untagged money in, same currency, last 60 days, closest amount first', () => {
    const now = '2026-11-20T00:00:00.000Z'
    const list = [
      row({ id: 'a', direction: 'in', amount: 30000, occurred_at: '2026-11-18T00:00:00.000Z' }),
      row({ id: 'b', direction: 'in', amount: 60000, occurred_at: '2026-11-10T00:00:00.000Z' }),
      row({ id: 'c', direction: 'in', amount: 60000, occurred_at: '2026-08-01T00:00:00.000Z' }),          // too old
      row({ id: 'd', direction: 'in', amount: 60000, currency: 'USD', occurred_at: '2026-11-15T00:00:00.000Z' }), // other currency
      row({ id: 'e', direction: 'in', amount: 60000, settles_person_id: 'p-priya', occurred_at: '2026-11-15T00:00:00.000Z' }), // already a repayment
      row({ id: 'f', direction: 'out', amount: 60000, occurred_at: '2026-11-15T00:00:00.000Z' }),
      row({ id: 'g', direction: 'in', amount: 60000, deleted_at: 'x', occurred_at: '2026-11-15T00:00:00.000Z' }),
    ]
    expect(repaymentCandidates(list, 'INR', 60000, now).map(e => e.id)).toEqual(['b', 'a'])
  })
})

describe('recordedTwin (a by-hand repayment the bank alert duplicates)', () => {
  const alert = row({ id: 'bank', direction: 'in', amount: 30000, source: 'email', occurred_at: '2026-11-12T10:00:00.000Z' })
  const byHand = (o: Partial<MoneyEntryRow>) => row({ id: 'hand', direction: 'in', amount: 30000, source: 'manual', settles_person_id: 'p-arun', occurred_at: '2026-11-11T10:00:00.000Z', ...o })

  it('finds a manual or voice repayment of the same amount and currency within 10 days', () => {
    expect(recordedTwin(alert, [alert, byHand({})])?.id).toBe('hand')
    expect(recordedTwin(alert, [alert, byHand({ source: 'voice', occurred_at: '2026-11-20T10:00:00.000Z' })])?.id).toBe('hand')
  })

  it('ignores other amounts, currencies, directions, imported or untagged entries, deleted ones, and anything over 10 days away', () => {
    for (const o of [
      { amount: 30001 }, { currency: 'USD' }, { direction: 'out' as const }, { source: 'sms' as const },
      { settles_person_id: null }, { deleted_at: 'x' }, { occurred_at: '2026-10-31T09:00:00.000Z' },
    ]) expect(recordedTwin(alert, [alert, byHand(o)])).toBeNull()
  })

  it('picks the closest in time when there are several', () => {
    const far = byHand({ id: 'far', occurred_at: '2026-11-05T10:00:00.000Z' })
    const near = byHand({ id: 'near', occurred_at: '2026-11-12T08:00:00.000Z' })
    expect(recordedTwin(alert, [far, near])?.id).toBe('near')
  })
})

describe('createdAsRepayment', () => {
  it('is true when the tag came with the create (same HLC as source)', () => {
    expect(createdAsRepayment({ settles_person_id: 'p', field_hlcs: { source: 'h1', amount: 'h1', settles_person_id: 'h1' } })).toBe(true)
  })

  it('is false for an entry tagged later, an untagged one, or one with no clocks', () => {
    expect(createdAsRepayment({ settles_person_id: 'p', field_hlcs: { source: 'h1', settles_person_id: 'h2' } })).toBe(false)
    expect(createdAsRepayment({ settles_person_id: null, field_hlcs: { source: 'h1', settles_person_id: 'h1' } })).toBe(false)
    expect(createdAsRepayment({ settles_person_id: 'p' })).toBe(false)
  })
})
