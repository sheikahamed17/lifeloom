import { describe, it, expect, beforeEach } from 'vitest'
import { aggregateWeek } from '@/lib/digest-aggregate'
import type { Kysely } from 'kysely'
import type { DB } from '@/lib/db'

// Chainable mock that handles any number of .where() calls
function makeFakeDb(rowsByTable: Record<string, unknown[]>): Kysely<DB> {
  return {
    selectFrom: (table: string) => {
      const data = rowsByTable[table] ?? []
      let filters: Array<{ col: string; op: string; val: unknown }> = []

      const chain = {
        where: (col: string, op: string, val: unknown) => {
          filters = [...filters, { col, op, val }]
          return chain
        },
        selectAll: () => ({
          execute: async () => {
            return data.filter((row) => {
              const r = row as Record<string, unknown>
              for (const { col, op, val } of filters) {
                const cell = r[col]
                if (op === '>=' && (cell as string) < (val as string)) return false
                if (op === '<' && (cell as string) >= (val as string)) return false
                if (op === 'is' && val === null && cell !== null) return false
                if (op === '=' && cell !== val) return false
              }
              return true
            })
          },
        }),
      }
      return chain
    },
  } as unknown as Kysely<DB>
}

describe('aggregateWeek — shared expenses', () => {
  const userId = 'user-123'
  const bounds = { startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-08T00:00:00.000Z' }
  const rent = { id: 'm-rent', user_id: userId, amount: 2000000, currency: 'INR', direction: 'out', category_id: null, description: 'rent', occurred_at: '2026-11-02T10:00:00.000Z', source: 'manual', raw_input: null, recurring_rule_id: null, field_hlcs: '{}', deleted_at: null, created_at: '', updated_at: '', tags: '[]', merchant: null, account_id: null, receipt_key: null }
  const share = { id: 's1', user_id: userId, money_entry_id: 'm-rent', person_id: 'p-arun', amount: 1000000, settled_at: null, settled_account_id: null, note: null, deleted_at: null }

  it('spend counts your share; owed_total is what others still owe', async () => {
    const db = makeFakeDb({ money_entries: [rent], expense_shares: [share], categories: [], tasks: [], learning_entries: [], note_entries: [] })
    const m = await aggregateWeek(db, userId, bounds, 'INR')
    expect(m.spend_total).toBe(1000000)
    expect(m.owed_total).toBe(1000000)
  })

  it('a settled share: spend unchanged, nothing owed, nothing counted as income', async () => {
    const db = makeFakeDb({ money_entries: [rent], expense_shares: [{ ...share, settled_at: '2026-11-05T00:00:00.000Z', settled_account_id: 'acc' }], categories: [], tasks: [], learning_entries: [], note_entries: [] })
    const m = await aggregateWeek(db, userId, bounds, 'INR')
    expect(m.spend_total).toBe(1000000)
    expect(m.owed_total).toBe(0)
    expect(m.income_total).toBe(0)
  })
})

describe('aggregateWeek', () => {
  let fakeDb: Kysely<DB>
  const userId = 'user-123'
  const primaryCurrency = 'INR'
  const bounds = { startsAt: '2026-06-21T18:30:00.000Z', endsAt: '2026-06-28T18:30:00.000Z' }

  beforeEach(() => {
    fakeDb = makeFakeDb({
      money_entries: [
        {
          id: 'e1',
          user_id: userId,
          amount: 50000,
          currency: primaryCurrency,
          direction: 'out',
          category_id: 'cat-food',
          description: 'groceries',
          occurred_at: '2026-06-25T10:00:00.000Z',
          source: 'voice',
          raw_input: null,
          recurring_rule_id: null,
          field_hlcs: '{}',
          deleted_at: null,
          created_at: '2026-06-25T10:00:00.000Z',
          updated_at: '2026-06-25T10:00:00.000Z',
        },
        {
          id: 'e2',
          user_id: userId,
          amount: 30000,
          currency: primaryCurrency,
          direction: 'out',
          category_id: 'cat-food',
          description: 'lunch',
          occurred_at: '2026-06-26T12:00:00.000Z',
          source: 'manual',
          raw_input: null,
          recurring_rule_id: null,
          field_hlcs: '{}',
          deleted_at: null,
          created_at: '2026-06-26T12:00:00.000Z',
          updated_at: '2026-06-26T12:00:00.000Z',
        },
        {
          id: 'e3',
          user_id: userId,
          amount: 100000,
          currency: primaryCurrency,
          direction: 'in',
          category_id: 'cat-salary',
          description: 'bonus',
          occurred_at: '2026-06-23T09:00:00.000Z',
          source: 'manual',
          raw_input: null,
          recurring_rule_id: null,
          field_hlcs: '{}',
          deleted_at: null,
          created_at: '2026-06-23T09:00:00.000Z',
          updated_at: '2026-06-23T09:00:00.000Z',
        },
      ],
      tasks: [
        {
          id: 't1',
          user_id: userId,
          title: 'Task A',
          due_at: '2026-06-24T10:00:00.000Z',
          priority: 'high',
          completed_at: '2026-06-24T15:00:00.000Z',
          source: 'voice',
          raw_input: null,
          field_hlcs: '{}',
          deleted_at: null,
          created_at: '2026-06-15T10:00:00.000Z',
          updated_at: '2026-06-24T15:00:00.000Z',
        },
        {
          id: 't2',
          user_id: userId,
          title: 'Task B',
          due_at: '2026-06-30T10:00:00.000Z',
          priority: 'medium',
          completed_at: null,
          source: 'manual',
          raw_input: null,
          field_hlcs: '{}',
          deleted_at: null,
          created_at: '2026-06-25T10:00:00.000Z',
          updated_at: '2026-06-25T10:00:00.000Z',
        },
      ],
      categories: [
        { id: 'cat-food', user_id: userId, name: 'Food', kind: 'spend' },
        { id: 'cat-salary', user_id: userId, name: 'Salary', kind: 'income' },
      ],
      learning_entries: [
        {
          id: 'l1',
          user_id: userId,
          text: 'Learned about React hooks',
          tags: JSON.stringify(['react', 'javascript']),
          attribution: null,
          source: 'voice',
          occurred_at: '2026-06-25T14:00:00.000Z',
          field_hlcs: '{}',
          deleted_at: null,
          created_at: '2026-06-25T14:00:00.000Z',
          updated_at: '2026-06-25T14:00:00.000Z',
        },
        {
          id: 'l2',
          user_id: userId,
          text: 'Learned about TypeScript generics',
          tags: JSON.stringify(['typescript', 'react']),
          attribution: null,
          source: 'manual',
          occurred_at: '2026-06-26T16:00:00.000Z',
          field_hlcs: '{}',
          deleted_at: null,
          created_at: '2026-06-26T16:00:00.000Z',
          updated_at: '2026-06-26T16:00:00.000Z',
        },
      ],
      note_entries: [
        {
          id: 'n1',
          user_id: userId,
          title: 'Project ideas',
          body: 'Build a dashboard for team insights',
          tags: JSON.stringify(['projects']),
          source: 'voice',
          occurred_at: '2026-06-27T10:00:00.000Z',
          field_hlcs: '{}',
          deleted_at: null,
          created_at: '2026-06-27T10:00:00.000Z',
          updated_at: '2026-06-27T10:00:00.000Z',
        },
      ],
    })
  })

  it('aggregates money entries by category and currency', async () => {
    const metrics = await aggregateWeek(fakeDb, userId, bounds, primaryCurrency)
    expect(metrics.spend_total).toBe(80000) // 50000 + 30000
    expect(metrics.income_total).toBe(100000)
    expect(metrics.currency).toBe(primaryCurrency)
    expect(metrics.entry_count).toBe(3)
  })

  it('returns top 5 categories by spend amount', async () => {
    const metrics = await aggregateWeek(fakeDb, userId, bounds, primaryCurrency)
    expect(metrics.top_categories).toContainEqual(expect.objectContaining({ name: 'Food', amount: 80000 }))
  })

  it('counts completed tasks in window', async () => {
    const metrics = await aggregateWeek(fakeDb, userId, bounds, primaryCurrency)
    expect(metrics.tasks_completed).toBe(1) // t1 completed in window
  })

  it('counts created tasks in window', async () => {
    const metrics = await aggregateWeek(fakeDb, userId, bounds, primaryCurrency)
    expect(metrics.tasks_created).toBe(1) // t2 created in window
  })

  it('counts open tasks with due_at < ends_at as overdue', async () => {
    const metrics = await aggregateWeek(fakeDb, userId, bounds, primaryCurrency)
    expect(metrics.tasks_overdue).toBe(0) // t2.due_at is after endsAt
  })

  it('excludes deleted entries', async () => {
    const metrics = await aggregateWeek(fakeDb, userId, bounds, primaryCurrency)
    expect(metrics.entry_count).toBe(3)
  })

  it('returns empty skipped_currencies when all entries can convert', async () => {
    const metrics = await aggregateWeek(fakeDb, userId, bounds, primaryCurrency)
    expect(metrics.skipped_currencies).toEqual([])
  })

  it('counts learning entries in window', async () => {
    const metrics = await aggregateWeek(fakeDb, userId, bounds, primaryCurrency)
    expect(metrics.learnings_added).toBe(2)
  })

  it('counts note entries in window', async () => {
    const metrics = await aggregateWeek(fakeDb, userId, bounds, primaryCurrency)
    expect(metrics.notes_added).toBe(1)
  })

  it('returns top learning tags in frequency order (max 5)', async () => {
    const metrics = await aggregateWeek(fakeDb, userId, bounds, primaryCurrency)
    expect(metrics.top_learning_tags).toEqual(['react', 'javascript', 'typescript'])
  })

  it('reads double-encoded learning tags (legacy materialize bug) as real tags, not characters', async () => {
    const legacy = makeFakeDb({
      money_entries: [], tasks: [], categories: [], note_entries: [],
      learning_entries: [{
        id: 'l1', user_id: userId, text: 'Rust lifetimes',
        tags: JSON.stringify(JSON.stringify(['rust', 'memory'])),
        attribution: null, source: 'voice', occurred_at: '2026-06-25T14:00:00.000Z',
        field_hlcs: '{}', deleted_at: null, created_at: '2026-06-25T14:00:00.000Z', updated_at: '2026-06-25T14:00:00.000Z',
      }],
    })
    const metrics = await aggregateWeek(legacy, userId, bounds, primaryCurrency)
    expect(metrics.top_learning_tags).toEqual(['rust', 'memory'])
  })

  it('excludes deleted learning/note entries from count', async () => {
    const dbWithDeleted = makeFakeDb({
      money_entries: [],
      tasks: [],
      categories: [],
      learning_entries: [
        {
          id: 'l1',
          user_id: userId,
          text: 'Active learning',
          tags: JSON.stringify(['tag1']),
          attribution: null,
          source: 'voice',
          occurred_at: '2026-06-25T14:00:00.000Z',
          field_hlcs: '{}',
          deleted_at: null,
          created_at: '2026-06-25T14:00:00.000Z',
          updated_at: '2026-06-25T14:00:00.000Z',
        },
        {
          id: 'l2',
          user_id: userId,
          text: 'Deleted learning',
          tags: JSON.stringify(['tag1']),
          attribution: null,
          source: 'voice',
          occurred_at: '2026-06-26T14:00:00.000Z',
          field_hlcs: '{}',
          deleted_at: '2026-06-26T14:00:00.000Z',
          created_at: '2026-06-26T14:00:00.000Z',
          updated_at: '2026-06-26T14:00:00.000Z',
        },
      ],
      note_entries: [],
    })
    const metrics = await aggregateWeek(dbWithDeleted, userId, bounds, primaryCurrency)
    expect(metrics.learnings_added).toBe(1)
  })

  it('excludes learning entries outside the time window', async () => {
    const dbOutOfWindow = makeFakeDb({
      money_entries: [],
      tasks: [],
      categories: [],
      learning_entries: [
        {
          id: 'l1',
          user_id: userId,
          text: 'Before window',
          tags: JSON.stringify(['early']),
          attribution: null,
          source: 'voice',
          occurred_at: '2026-06-20T14:00:00.000Z', // before startsAt
          field_hlcs: '{}',
          deleted_at: null,
          created_at: '2026-06-20T14:00:00.000Z',
          updated_at: '2026-06-20T14:00:00.000Z',
        },
      ],
      note_entries: [],
    })
    const metrics = await aggregateWeek(dbOutOfWindow, userId, bounds, primaryCurrency)
    expect(metrics.learnings_added).toBe(0)
    expect(metrics.top_learning_tags).toEqual([])
  })
})
