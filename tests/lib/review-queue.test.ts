import { describe, it, expect } from 'vitest'
import { reviewQueue } from '@/lib/review-queue'
import type { MoneyEntryRow } from '@/lib/dexie'

const base: MoneyEntryRow = {
  id: 'e', user_id: 'u', amount: 42000, currency: 'INR', direction: 'out', category_id: 'c1', description: 'Swiggy',
  occurred_at: '2026-11-10T08:00:00.000Z', source: 'email', receipt_key: null, raw_input: null, recurring_rule_id: null,
  merchant: null, tags: [], account_id: 'a1', field_hlcs: {}, deleted_at: null, created_at: '2026-11-10T08:00:00.000Z', updated_at: '2026-11-10T08:00:00.000Z',
}
const row = (over: Partial<MoneyEntryRow>): MoneyEntryRow => ({ ...base, ...over })
const ALERT = 'Rs 1,200 spent on HDFC Bank Card XX5872 at AMAZON on 10-11-26'

describe('reviewQueue', () => {
  it('lists imported entries with no category', () => {
    const q = reviewQueue([row({ id: 'x', category_id: null })], 1)
    expect(q).toEqual([{ entry: expect.objectContaining({ id: 'x' }), needsCategory: true, cardLast4: null }])
  })

  it('lists imported alerts whose card is not tied to an account, when accounts exist', () => {
    const q = reviewQueue([row({ id: 'y', account_id: null, raw_input: ALERT })], 2)
    expect(q).toHaveLength(1)
    expect(q[0].cardLast4).toBe('5872')
    expect(q[0].needsCategory).toBe(false)
  })

  it('does not ask "which account?" when the owner has no accounts yet', () => {
    expect(reviewQueue([row({ account_id: null, raw_input: ALERT })], 0)).toEqual([])
  })

  it('ignores manual, voice and receipt entries, deleted rows, and complete imports', () => {
    const q = reviewQueue([
      row({ id: 'm', source: 'manual', category_id: null }),
      row({ id: 'v', source: 'voice', category_id: null }),
      row({ id: 'd', category_id: null, deleted_at: '2026-11-11T00:00:00.000Z' }),
      row({ id: 'ok' }),
    ], 1)
    expect(q).toEqual([])
  })

  it('puts the newest first and flags both needs on one entry', () => {
    const q = reviewQueue([
      row({ id: 'old', category_id: null, occurred_at: '2026-11-01T00:00:00.000Z' }),
      row({ id: 'new', category_id: null, account_id: null, raw_input: ALERT, source: 'sms', occurred_at: '2026-11-12T00:00:00.000Z' }),
    ], 1)
    expect(q.map(i => i.entry.id)).toEqual(['new', 'old'])
    expect(q[0]).toMatchObject({ needsCategory: true, cardLast4: '5872' })
  })
})
