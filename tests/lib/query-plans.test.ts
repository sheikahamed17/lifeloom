import { describe, it, expect } from 'vitest'
import { isQueryPlan, QUERY_KINDS } from '@/lib/query-plans'
import type { QueryMoneyPlan, QueryTaskPlan, QueryLearningPlan, QueryNotesPlan } from '@/lib/query-plans'
import type { ChipDraft } from '@/components/confirmation-chip'

describe('isQueryPlan', () => {
  it('returns true for query_money plan', () => {
    const plan: QueryMoneyPlan = {
      kind: 'query_money',
      mode: 'total',
      direction: 'out',
      category_name: null,
      period: { from: '2026-01-01T00:00:00Z', to: '2026-01-31T23:59:59Z', label: 'Jan' },
    }
    expect(isQueryPlan(plan)).toBe(true)
  })

  it('rejects a query_money plan without a period (the answer card filters on period.from/to)', () => {
    expect(isQueryPlan({ kind: 'query_money', mode: 'total', direction: 'out', category_name: null, period: null })).toBe(false)
    expect(isQueryPlan({ kind: 'query_money', mode: 'total', direction: 'out', category_name: null })).toBe(false)
    expect(isQueryPlan({ kind: 'query_money', mode: 'total', direction: 'out', category_name: null, period: { from: '2026-01-01T00:00:00Z' } })).toBe(false)
  })

  it('returns true for query_task plan', () => {
    const plan: QueryTaskPlan = {
      kind: 'query_task',
      status: 'open',
      period: null,
    }
    expect(isQueryPlan(plan)).toBe(true)
  })

  it('returns true for query_learning plan', () => {
    const plan: QueryLearningPlan = {
      kind: 'query_learning',
      search: null,
      tags: [],
      period: null,
    }
    expect(isQueryPlan(plan)).toBe(true)
  })

  it('returns true for query_notes plan', () => {
    const plan: QueryNotesPlan = {
      kind: 'query_notes',
      search: 'test',
      tags: ['tag1'],
      period: { from: '2026-01-01T00:00:00Z', to: '2026-01-31T23:59:59Z', label: 'Jan' },
    }
    expect(isQueryPlan(plan)).toBe(true)
  })

  it('returns false for money ChipDraft', () => {
    const draft: ChipDraft = {
      kind: 'money',
      amount: 100,
      currency: 'USD',
      direction: 'out',
      occurred_at: new Date().toISOString(),
      source: 'manual',
      raw_input: null,
    }
    expect(isQueryPlan(draft)).toBe(false)
  })

  it('returns false for task ChipDraft', () => {
    const draft: ChipDraft = {
      kind: 'task',
      title: 'Test task',
      priority: 'medium',
      source: 'manual',
      raw_input: null,
      tags: [],
    }
    expect(isQueryPlan(draft)).toBe(false)
  })

  it('returns false for learning ChipDraft', () => {
    const draft: ChipDraft = {
      kind: 'learning',
      text: 'Test learning',
      attribution: null,
      tags: [],
      occurred_at: new Date().toISOString(),
      source: 'manual',
    }
    expect(isQueryPlan(draft)).toBe(false)
  })

  it('returns false for note ChipDraft', () => {
    const draft: ChipDraft = {
      kind: 'note',
      body: 'Test note',
      tags: [],
      occurred_at: new Date().toISOString(),
      source: 'manual',
    }
    expect(isQueryPlan(draft)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isQueryPlan(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isQueryPlan(undefined)).toBe(false)
  })

  it('returns false for empty object', () => {
    expect(isQueryPlan({})).toBe(false)
  })

  it('returns false for object with unknown kind', () => {
    expect(isQueryPlan({ kind: 'unknown' })).toBe(false)
  })

  it('returns false for non-object', () => {
    expect(isQueryPlan('query_money')).toBe(false)
    expect(isQueryPlan(42)).toBe(false)
    expect(isQueryPlan(true)).toBe(false)
  })
})

describe('QUERY_KINDS', () => {
  it('contains all four query kinds', () => {
    expect(QUERY_KINDS).toEqual(['query_money', 'query_task', 'query_learning', 'query_notes'])
  })

  it('has length 4', () => {
    expect(QUERY_KINDS).toHaveLength(4)
  })
})
