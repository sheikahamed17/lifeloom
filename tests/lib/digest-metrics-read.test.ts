import { describe, it, expect } from 'vitest'
import { readDigestMetrics } from '@/lib/digest-metrics-read'

describe('readDigestMetrics', () => {
  it('reads a full DigestMetrics blob', () => {
    const m = readDigestMetrics(JSON.stringify({
      currency: 'INR', spend_total: 132500, income_total: 8500000, top_categories: [{ name: 'Groceries', amount: 50000 }],
      tasks_completed: 3, tasks_created: 5, tasks_overdue: 2, skipped_currencies: [], entry_count: 9,
      learnings_added: 1, notes_added: 4, top_learning_tags: ['ts'], owed_total: 1000,
    }))
    expect(m).not.toBeNull()
    expect(m!.spend_total).toBe(132500)
    expect(m!.income_total).toBe(8500000)
    expect(m!.tasks_overdue).toBe(2)
    expect(m!.owed_total).toBe(1000)
  })

  it('accepts the legacy spend/income keys an older demo seed wrote', () => {
    const m = readDigestMetrics(JSON.stringify({ spend: 132500, income: 0, net: -132500, top_category: 'Groceries' }))
    expect(m!.spend_total).toBe(132500)
    expect(m!.income_total).toBe(0)
    expect(m!.currency).toBe('INR')
    expect(m!.top_categories).toEqual([])
    expect(m!.tasks_completed).toBe(0)
  })

  it('returns null totals instead of NaN when a figure is missing or not a number', () => {
    const m = readDigestMetrics(JSON.stringify({ currency: 'USD', spend_total: 'lots' }))
    expect(m!.spend_total).toBeNull()
    expect(m!.income_total).toBeNull()
    expect(m!.currency).toBe('USD')
  })

  it('returns null for unparseable or non-object metrics', () => {
    expect(readDigestMetrics('not json')).toBeNull()
    expect(readDigestMetrics('42')).toBeNull()
    expect(readDigestMetrics('null')).toBeNull()
  })
})
