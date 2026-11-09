import { describe, it, expect } from 'vitest'
import { planSplitOfExisting, type SplitSource } from '@/lib/split-edit'

const rent: SplitSource = {
  amount: 2000000, currency: 'INR', direction: 'out',
  description: 'rent', merchant: 'Landlord', tags: ['home'],
  occurred_at: '2026-11-01T04:30:00.000Z', source: 'manual', raw_input: 'rent 20000',
  receipt_key: 'r/abc.jpg', account_id: 'acc-bank', split_group_id: null,
}

function ids(...list: string[]) {
  const queue = [...list]
  return () => {
    const next = queue.shift()
    if (!next) throw new Error('ran out of ids')
    return next
  }
}

describe('planSplitOfExisting — split an already-saved entry', () => {
  it('turns the saved entry into the first part and creates the rest in one new group', () => {
    const plan = planSplitOfExisting({
      entryId: 'm-rent',
      final: rent,
      allocations: [
        { category_id: 'cat-rent', amount: 1000000 },
        { category_id: 'cat-owed', amount: 1000000 },
      ],
      newId: ids('grp-1', 'm-part-2'),
    })

    expect(plan.groupId).toBe('grp-1')
    expect(plan.update.entity_id).toBe('m-rent')
    expect(plan.update.payload).toEqual({
      amount: 1000000, category_id: 'cat-rent',
      currency: 'INR', direction: 'out', description: 'rent', merchant: 'Landlord', tags: ['home'],
      occurred_at: '2026-11-01T04:30:00.000Z', account_id: 'acc-bank', split_group_id: 'grp-1',
    })
    // The update never touches source/raw_input/receipt/recurring: they stay as saved.
    expect(plan.update.payload).not.toHaveProperty('source')
    expect(plan.update.payload).not.toHaveProperty('receipt_key')
    expect(plan.update.payload).not.toHaveProperty('recurring_rule_id')

    expect(plan.creates).toHaveLength(1)
    expect(plan.creates[0].entity_id).toBe('m-part-2')
    expect(plan.creates[0].payload).toEqual({
      amount: 1000000, category_id: 'cat-owed',
      currency: 'INR', direction: 'out', description: 'rent', merchant: 'Landlord', tags: ['home'],
      occurred_at: '2026-11-01T04:30:00.000Z', account_id: 'acc-bank', split_group_id: 'grp-1',
      source: 'manual', raw_input: 'rent 20000', recurring_rule_id: null, receipt_key: 'r/abc.jpg',
    })
  })

  it('a three-way split creates two new parts and the parts sum back to the amount', () => {
    const plan = planSplitOfExisting({
      entryId: 'm1',
      final: { ...rent, amount: 90000 },
      allocations: [
        { category_id: 'a', amount: 30000 },
        { category_id: 'b', amount: 40000 },
        { category_id: null, amount: 20000 },
      ],
      newId: ids('g', 'p2', 'p3'),
    })
    expect(plan.creates.map(c => c.entity_id)).toEqual(['p2', 'p3'])
    const total = (plan.update.payload.amount as number) + plan.creates.reduce((n, c) => n + (c.payload.amount as number), 0)
    expect(total).toBe(90000)
    expect(plan.creates[1].payload.category_id).toBeNull()
  })

  it('an entry that is already a split part keeps its group instead of starting a new one', () => {
    const plan = planSplitOfExisting({
      entryId: 'm-part',
      final: { ...rent, amount: 50000, split_group_id: 'grp-existing' },
      allocations: [
        { category_id: 'a', amount: 20000 },
        { category_id: 'b', amount: 30000 },
      ],
      newId: ids('p-new'),            // no id is spent on a group
    })
    expect(plan.groupId).toBe('grp-existing')
    expect(plan.update.payload.split_group_id).toBe('grp-existing')
    expect(plan.creates[0].entity_id).toBe('p-new')
    expect(plan.creates[0].payload.split_group_id).toBe('grp-existing')
  })

  it('refuses an invalid split (one part, a zero part, or parts that do not sum to the amount)', () => {
    const base = { entryId: 'm1', final: rent, newId: ids('g', 'p') }
    expect(() => planSplitOfExisting({ ...base, allocations: [{ category_id: 'a', amount: 2000000 }] })).toThrow()
    expect(() => planSplitOfExisting({ ...base, allocations: [{ category_id: 'a', amount: 2000000 }, { category_id: 'b', amount: 0 }] })).toThrow()
    expect(() => planSplitOfExisting({ ...base, allocations: [{ category_id: 'a', amount: 1000000 }, { category_id: 'b', amount: 900000 }] })).toThrow()
  })
})
