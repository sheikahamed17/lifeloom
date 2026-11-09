/* eslint-disable @typescript-eslint/no-explicit-any */
// The mock Kysely chain is generic + recursive; typing each call site
// precisely would be ~50 lines of fixture-only type definitions. Test
// fixture, not production code — `any` is the right escape valve here.
import { describe, it, expect, vi } from 'vitest'
import { applyOps } from '@/lib/op-log'
import type { Op } from '@/types/ops'

// Mock auth and Cloudflare context for integration tests
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(() => ({
    env: {
      DB: { /* mock D1 */ },
      BETTER_AUTH_SECRET: 'test-secret-32-chars-minimum!!!',
      BETTER_AUTH_URL: 'http://localhost:3000',
    },
  })),
}))

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn(async (_req: Request) => {
    // Extract userId from request context (injected by test harness)
    const auth = (globalThis as any).__testAuth
    return auth ? { user: { id: auth.userId } } : null
  }),
}))

function mkOp(opts: Partial<Op> & { hlc: string; op_type: Op['op_type']; payload: Record<string, unknown> }): Op {
  return {
    id: opts.id ?? `op_${opts.hlc}`,
    hlc: opts.hlc,
    device_id: opts.device_id ?? 'd1',
    user_id: 'u1',
    entity_kind: 'widget',
    entity_id: 'w1',
    op_type: opts.op_type,
    payload: opts.payload,
    schema_version: 1,
  }
}

// ===== Test Harness for /api/sync integration tests =====
// In-memory mock database for testing server-side materialization.

interface DbTable {
  [key: string]: Record<string, unknown>[]
}

let mockDbInstance: DbTable = {}

function resetMockDb() {
  mockDbInstance = {
    op_log: [],
    widgets: [],
    categories: [],
    money_entries: [],
    recurring_rules: [],
    tasks: [],
    learning_entries: [],
    note_entries: [],
    journal_entries: [],
    people: [],
    expense_shares: [],
    insights: [],
  }
}

// Mock query builder for sync-integration tests
class MockQueryBuilder {
  private tableName: string
  private whereConditions: Array<[string, string, unknown]> = []
  private orderCol: string | null = null
  private orderDir: 'asc' | 'desc' = 'asc'
  private limitN: number | null = null

  constructor(tableName: string) {
    this.tableName = tableName
  }

  selectFrom(name: string) {
    this.tableName = name
    return this
  }

  where(col: string, op: string, val: unknown) {
    this.whereConditions.push([col, op, val])
    return this
  }

  select(_cols: string | string[]) {
    return this
  }

  selectAll() {
    return this
  }

  orderBy(col: string, dir: 'asc' | 'desc' = 'asc') {
    this.orderCol = col
    this.orderDir = dir
    return this
  }

  limit(n: number) {
    this.limitN = n
    return this
  }

  async execute() {
    // Mimic Cloudflare D1's hard limit of 100 bound parameters per query.
    // Each '='/'>' condition binds 1 param; an 'in' condition binds one per
    // array element. A query that exceeds 100 is rejected by D1 at runtime —
    // reproduce that here so the dedup-chunking regression is covered.
    const boundParams = this.whereConditions.reduce(
      (n, [, op, val]) => n + (op === 'in' ? (val as unknown[]).length : 1),
      0,
    )
    if (boundParams > 100) {
      throw new Error(`D1_ERROR: too many SQL variables (${boundParams} bound parameters exceed the 100 limit)`)
    }

    const table = mockDbInstance[this.tableName] || []
    let filtered = [...table]

    for (const [col, op, val] of this.whereConditions) {
      filtered = filtered.filter(row => {
        if (op === '=') return row[col] === val
        if (op === '>') return String(row[col]) > String(val)
        if (op === 'in') return (val as unknown[]).includes(row[col])
        return true
      })
    }

    if (this.orderCol) {
      const c = this.orderCol
      filtered.sort((a, b) => String(a[c]) < String(b[c]) ? -1 : String(a[c]) > String(b[c]) ? 1 : 0)
      if (this.orderDir === 'desc') filtered.reverse()
    }

    if (this.limitN != null) filtered = filtered.slice(0, this.limitN)

    return filtered
  }

  async executeTakeFirst() {
    return (await this.execute())[0] || null
  }
}

class MockDb {
  selectFrom(name: string) {
    return new MockQueryBuilder(name)
  }

  insertInto(name: string) {
    return {
      values: (row: Record<string, unknown>) => {
        return {
          onConflict: (fn: (oc: any) => any) => {
            // Mock the conflict builder
            const oc = {
              column: (_col: string) => {
                return {
                  doNothing: () => ({
                    async execute() {
                      // Insert only if id doesn't exist (doNothing on conflict)
                      const table = mockDbInstance[name] || []
                      const idx = table.findIndex(r => r.id === row.id)
                      if (idx < 0) {
                        table.push(row)
                      }
                      mockDbInstance[name] = table
                    }
                  }),
                  doUpdateSet: (updates: Record<string, unknown>) => {
                    return {
                      async execute() {
                        // Simple upsert: find by id and update, else insert
                        const table = mockDbInstance[name] || []
                        const idx = table.findIndex(r => r.id === row.id)
                        if (idx >= 0) {
                          table[idx] = { ...table[idx], ...updates }
                        } else {
                          table.push(row)
                        }
                        mockDbInstance[name] = table
                      }
                    }
                  }
                }
              }
            }
            // Call the function with mock oc
            const result = fn(oc)
            return result
          },
          async execute() {
            // Simple insert without conflict handling
            const table = mockDbInstance[name] || []
            const idx = table.findIndex(r => r.id === row.id)
            if (idx >= 0) {
              table[idx] = { ...table[idx], ...row }
            } else {
              table.push(row)
            }
            mockDbInstance[name] = table
          }
        }
      }
    }
  }
}

function createMockKysely() {
  return new MockDb()
}

// Mock createDb to return our mock
vi.mock('@/lib/db', () => ({
  createDb: vi.fn(() => createMockKysely()),
}))

async function withTestUser(
  fn: (opts: {
    userId: string
    callSync: (payload: any) => Promise<any>
    testDb: MockDb
  }) => Promise<void>,
) {
  resetMockDb()
  const userId = 'test-user-' + Math.random().toString(36).slice(2, 8)

  // Set auth context for this user
  ;(globalThis as any).__testAuth = { userId }

  // Import route (it's mocked to use our mock db)
  const { POST } = await import('../src/app/api/sync/route')

  const callSync = async (payload: any) => {
    const req = new Request('http://localhost/api/sync', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(req)
    const data = await response.json()
    return data
  }

  const testDb = createMockKysely()

  try {
    await fn({
      userId,
      callSync,
      testDb,
    })
  } finally {
    ;(globalThis as any).__testAuth = null
  }
}

describe('two-device convergence', () => {
  it('two devices writing different fields concurrently converge to the same state', () => {
    const d1Op = mkOp({ hlc: '0000000000000010-000000-d1', device_id: 'd1', op_type: 'create', payload: { label: 'init' } })
    // d2 sees d1's create after it has already issued an update on a different field
    const d2Op = mkOp({ hlc: '0000000000000020-000000-d2', device_id: 'd2', op_type: 'update', payload: { color: 'red' } })
    const d1Op2 = mkOp({ hlc: '0000000000000030-000000-d1', device_id: 'd1', op_type: 'update', payload: { size: 'L' } })

    // Device 1 applies in d1, d2, d3 order
    const final1 = applyOps(undefined, [d1Op, d2Op, d1Op2])
    // Device 2 receives in d2, d1, d3 order (different network ordering)
    const final2 = applyOps(undefined, [d2Op, d1Op, d1Op2])

    // With byte-perfect determinism from T13, no need to strip created_at/updated_at
    expect(final1).toEqual(final2)
    expect(final1?.label).toBe('init')
    expect(final1?.color).toBe('red')
    expect(final1?.size).toBe('L')
  })

  it('same field written by two devices: higher HLC wins regardless of arrival order', () => {
    const d1 = mkOp({ hlc: '0000000000000010-000000-d1', device_id: 'd1', op_type: 'create', payload: { label: 'd1-label' } })
    const d2 = mkOp({ hlc: '0000000000000020-000000-d2', device_id: 'd2', op_type: 'update', payload: { label: 'd2-label' } })

    const order1 = applyOps(undefined, [d1, d2])
    const order2 = applyOps(undefined, [d2, d1])

    expect(order1?.label).toBe('d2-label')
    expect(order2?.label).toBe('d2-label')
  })
})

describe('/api/sync — Phase 1 entity kinds', () => {
  it('persists a money entry and includes it in the next pull', async () => {
    await withTestUser(async ({ userId, callSync, testDb }) => {
      const op = {
        id: 'op-m1',
        hlc: '0000000000000001-000000-d1',
        device_id: 'd1',
        user_id: userId,
        entity_kind: 'money',
        entity_id: 'm1',
        op_type: 'create' as const,
        payload: {
          amount: 8000,
          currency: 'INR',
          direction: 'out' as const,
          occurred_at: '2026-06-18T14:30:00Z',
          source: 'manual' as const,
          description: 'chai',
        },
        schema_version: 1,
      }
      const push = await callSync({ device_id: 'd1', new_ops: [op] })
      expect(push.applied_ack).toEqual(['op-m1'])

      const pull = await callSync({ device_id: 'd2', new_ops: [] })
      expect(pull.new_ops_from_server).toHaveLength(1)
      expect(pull.new_ops_from_server[0].entity_kind).toBe('money')

      const rows = await testDb.selectFrom('money_entries').where('user_id', '=', userId).selectAll().execute()
      expect(rows).toHaveLength(1)
      expect(rows[0].amount).toBe(8000)
    })
  })

  it('round-trips split_group_id on a money entry (split part)', async () => {
    await withTestUser(async ({ userId, callSync, testDb }) => {
      const op = {
        id: 'op-split-1',
        hlc: '0000000000000001-000000-d1',
        device_id: 'd1',
        user_id: userId,
        entity_kind: 'money',
        entity_id: 'ms1',
        op_type: 'create' as const,
        payload: {
          amount: 1500, currency: 'INR', direction: 'out' as const,
          occurred_at: '2026-09-01T10:00:00Z', source: 'manual' as const,
          category_id: 'cat-groceries', split_group_id: 'grp-1',
        },
        schema_version: 1,
      }
      await callSync({ device_id: 'd1', new_ops: [op] })

      const pull = await callSync({ device_id: 'd2', new_ops: [] })
      expect(pull.new_ops_from_server[0].payload.split_group_id).toBe('grp-1')

      const rows = await testDb.selectFrom('money_entries').where('user_id', '=', userId).selectAll().execute()
      expect(rows[0].split_group_id).toBe('grp-1')
    })
  })

  it('persists a category entry', async () => {
    await withTestUser(async ({ userId, callSync, testDb }) => {
      const op = {
        id: 'op-c1',
        hlc: '0000000000000001-000000-d1',
        device_id: 'd1',
        user_id: userId,
        entity_kind: 'category',
        entity_id: 'c1',
        op_type: 'create' as const,
        payload: { name: 'Food', kind: 'spend' as const, sort_order: 0, icon: '🍴' },
        schema_version: 1,
      }
      await callSync({ device_id: 'd1', new_ops: [op] })
      const rows = await testDb.selectFrom('categories').where('user_id', '=', userId).selectAll().execute()
      expect(rows).toHaveLength(1)
      expect(rows[0].name).toBe('Food')
    })
  })

  it('materializes a category create that omits is_archived without writing an explicit NULL', async () => {
    await withTestUser(async ({ userId, callSync, testDb }) => {
      // Category create ops omit the optional is_archived (op schema: .optional()).
      const op = {
        id: 'op-c2',
        hlc: '0000000000000001-000000-d1',
        device_id: 'd1',
        user_id: userId,
        entity_kind: 'category',
        entity_id: 'c2',
        op_type: 'create' as const,
        payload: { name: 'Groceries', kind: 'spend' as const, sort_order: 1 },
        schema_version: 1,
      }
      await callSync({ device_id: 'd1', new_ops: [op] })
      const rows = await testDb.selectFrom('categories').where('user_id', '=', userId).selectAll().execute()
      expect(rows).toHaveLength(1)
      // Regression (prod SQLITE_CONSTRAINT: NOT NULL categories.is_archived):
      // the old `merged[f] ?? null` wrote an explicit NULL for the omitted
      // is_archived, bypassing the column DEFAULT 0. The materialized row must
      // NOT carry an explicit null — the field is omitted so the DB default applies.
      expect(rows[0].is_archived).not.toBeNull()
    })
  })

  it('persists a widget entry with type and sort_order', async () => {
    await withTestUser(async ({ userId, callSync, testDb }) => {
      const op = {
        id: 'op-w1',
        hlc: '0000000000000001-000000-d1',
        device_id: 'd1',
        user_id: userId,
        entity_kind: 'widget' as const,
        entity_id: 'widget-spent',
        op_type: 'create' as const,
        payload: { type: 'spent', sort_order: 2, label: null },
        schema_version: 1,
      }
      const push = await callSync({ device_id: 'd1', new_ops: [op] })
      expect(push.applied_ack).toEqual(['op-w1'])

      // Verify server-side materialization
      const rows = await testDb.selectFrom('widgets').where('user_id', '=', userId).selectAll().execute()
      expect(rows).toHaveLength(1)
      expect(rows[0].type).toBe('spent')
      expect(rows[0].sort_order).toBe(2)
      expect(rows[0].label).toBeNull()

      // Verify client-side round-trip: op is included in next pull (generic applyOp propagates type/sort_order)
      const pull = await callSync({ device_id: 'd2', new_ops: [] })
      expect(pull.new_ops_from_server).toHaveLength(1)
      const pulledOp = pull.new_ops_from_server[0]
      expect(pulledOp.entity_kind).toBe('widget')
      expect(pulledOp.payload.type).toBe('spent')
      expect(pulledOp.payload.sort_order).toBe(2)
    })
  })

  it('persists a recurring rule', async () => {
    await withTestUser(async ({ userId, callSync, testDb }) => {
      const op = {
        id: 'op-r1',
        hlc: '0000000000000001-000000-d1',
        device_id: 'd1',
        user_id: userId,
        entity_kind: 'recurring',
        entity_id: 'r1',
        op_type: 'create' as const,
        payload: {
          amount: 2500000,
          currency: 'INR',
          direction: 'out' as const,
          period: 'monthly' as const,
          interval_count: 1,
          anchor_at: '2026-06-01T00:00:00Z',
          next_due_at: '2026-07-01T00:00:00Z',
          end_condition_kind: 'never' as const,
          is_active: 1,
        },
        schema_version: 1,
      }
      await callSync({ device_id: 'd1', new_ops: [op] })
      const rows = await testDb.selectFrom('recurring_rules').where('user_id', '=', userId).selectAll().execute()
      expect(rows).toHaveLength(1)
      expect(rows[0].period).toBe('monthly')
      expect(rows[0].next_due_at).toBe('2026-07-01T00:00:00Z')
    })
  })
})

describe('/api/sync — Phase 2 task entity_kind', () => {
  it('persists a task entry and includes it in the next pull', async () => {
    await withTestUser(async ({ userId, callSync, testDb }) => {
      const op = {
        id: 'op-task-1',
        hlc: '0000000000000001-000000-d1',
        device_id: 'd1', user_id: userId,
        entity_kind: 'task',
        entity_id: 'task-1',
        op_type: 'create',
        payload: {
          title: 'call mom',
          due_at: '2026-06-19T15:00:00.000Z',
          priority: 'medium',
          source: 'voice',
          raw_input: 'remind me to call mom tomorrow at 3',
        },
        schema_version: 1,
      }
      const push = await callSync({ device_id: 'd1', new_ops: [op] })
      expect(push.applied_ack).toEqual(['op-task-1'])

      const pull = await callSync({ device_id: 'd2', new_ops: [] })
      expect(pull.new_ops_from_server).toHaveLength(1)
      expect(pull.new_ops_from_server[0].entity_kind).toBe('task')

      // Server-side row materialized
      const rows = await testDb.selectFrom('tasks').where('user_id', '=', userId).selectAll().execute()
      expect(rows).toHaveLength(1)
      expect(rows[0].title).toBe('call mom')
      expect(rows[0].priority).toBe('medium')
    })
  })
})

describe('/api/sync — Phase 3 insight materialization', () => {
  it('materializes a create insight op to D1 insights table', async () => {
    await withTestUser(async ({ userId, callSync, testDb }) => {
      const op = {
        id: 'op-insight-1',
        hlc: '0000000000000001-000000-d1',
        device_id: 'd1',
        user_id: userId,
        entity_kind: 'insight',
        entity_id: 'insight-1',
        op_type: 'create' as const,
        payload: {
          period: 'weekly',
          starts_at: '2026-06-21T18:30:00.000Z',
          ends_at: '2026-06-28T18:30:00.000Z',
          summary: 'Great week!',
          metrics: JSON.stringify({ spend_total: 5000 }),
        },
        schema_version: 1,
      }
      const push = await callSync({ device_id: 'd1', new_ops: [op] })
      expect(push.applied_ack).toEqual(['op-insight-1'])

      const pull = await callSync({ device_id: 'd2', new_ops: [] })
      expect(pull.new_ops_from_server).toHaveLength(1)
      expect(pull.new_ops_from_server[0].entity_kind).toBe('insight')

      // Server-side row materialized
      const rows = await testDb.selectFrom('insights').where('user_id', '=', userId).selectAll().execute()
      expect(rows).toHaveLength(1)
      expect(rows[0].summary).toBe('Great week!')
      expect(rows[0].period).toBe('weekly')
    })
  })
})

describe('/api/sync — Learning domain', () => {
  it('persists a learning entry and includes it in the next pull', async () => {
    await withTestUser(async ({ userId, callSync, testDb }) => {
      const op = {
        id: 'op-learning-1',
        hlc: '0000000000000001-000000-d1',
        device_id: 'd1',
        user_id: userId,
        entity_kind: 'learning',
        entity_id: 'learning-1',
        op_type: 'create' as const,
        payload: {
          text: 'The borrow checker prevents data races',
          tags: ['Rust', 'concurrency'],
          attribution: 'Rust book',
          occurred_at: '2026-07-08T10:00:00.000Z',
          source: 'voice',
        },
        schema_version: 1,
      }
      const push = await callSync({ device_id: 'd1', new_ops: [op] })
      expect(push.applied_ack).toEqual(['op-learning-1'])

      const pull = await callSync({ device_id: 'd2', new_ops: [] })
      expect(pull.new_ops_from_server).toHaveLength(1)
      expect(pull.new_ops_from_server[0].entity_kind).toBe('learning')

      // Server-side row materialized
      const rows = await testDb.selectFrom('learning_entries').where('user_id', '=', userId).selectAll().execute()
      expect(rows).toHaveLength(1)
      expect(rows[0].text).toBe('The borrow checker prevents data races')
      expect(rows[0].attribution).toBe('Rust book')
      expect(rows[0].source).toBe('voice')

      // tags JSON round-trips correctly
      const tags = JSON.parse(rows[0].tags as string)
      expect(tags).toEqual(['Rust', 'concurrency'])
    })
  })

  it('whole-array tags LWW: second op with newer HLC replaces entire tags array', async () => {
    await withTestUser(async ({ userId, callSync, testDb }) => {
      // Initial create
      const op1 = {
        id: 'op-learning-2a',
        hlc: '0000000000000001-000000-d1',
        device_id: 'd1',
        user_id: userId,
        entity_kind: 'learning',
        entity_id: 'learning-2',
        op_type: 'create' as const,
        payload: {
          text: 'Learning about TypeScript',
          tags: ['TypeScript', 'JavaScript'],
          attribution: null,
          occurred_at: '2026-07-08T11:00:00.000Z',
          source: 'manual',
        },
        schema_version: 1,
      }
      await callSync({ device_id: 'd1', new_ops: [op1] })

      // Second op with newer HLC updates only tags
      const op2 = {
        id: 'op-learning-2b',
        hlc: '0000000000000002-000000-d1',
        device_id: 'd1',
        user_id: userId,
        entity_kind: 'learning',
        entity_id: 'learning-2',
        op_type: 'update' as const,
        payload: {
          tags: ['TypeScript', 'Web Development', 'Frontend'],
        },
        schema_version: 1,
      }
      await callSync({ device_id: 'd1', new_ops: [op2] })

      // Verify whole-array LWW: tags are completely replaced
      const rows = await testDb.selectFrom('learning_entries').where('user_id', '=', userId).selectAll().execute()
      expect(rows).toHaveLength(1)
      const tags = JSON.parse(rows[0].tags as string)
      expect(tags).toEqual(['TypeScript', 'Web Development', 'Frontend'])
      // Verify other fields are unchanged
      expect(rows[0].text).toBe('Learning about TypeScript')
    })
  })
})

describe('/api/sync — Journal domain', () => {
  it('persists a journal entry (body + mood) and includes it in the next pull', async () => {
    await withTestUser(async ({ userId, callSync, testDb }) => {
      const op = {
        id: 'op-journal-1',
        hlc: '0000000000000001-000000-d1',
        device_id: 'd1',
        user_id: userId,
        entity_kind: 'journal',
        entity_id: 'j1',
        op_type: 'create' as const,
        payload: { body: 'Shipped the journal domain today', mood: '🙂', occurred_at: '2026-09-01T10:00:00Z', source: 'manual' },
        schema_version: 1,
      }
      const push = await callSync({ device_id: 'd1', new_ops: [op] })
      expect(push.applied_ack).toEqual(['op-journal-1'])

      const pull = await callSync({ device_id: 'd2', new_ops: [] })
      expect(pull.new_ops_from_server[0].entity_kind).toBe('journal')

      const rows = await testDb.selectFrom('journal_entries').where('user_id', '=', userId).selectAll().execute()
      expect(rows).toHaveLength(1)
      expect(rows[0].body).toBe('Shipped the journal domain today')
      expect(rows[0].mood).toBe('🙂')
    })
  })

  it('per-field LWW: a mood-only update leaves the body intact', async () => {
    await withTestUser(async ({ userId, callSync, testDb }) => {
      await callSync({ device_id: 'd1', new_ops: [{
        id: 'op-j2a', hlc: '0000000000000001-000000-d1', device_id: 'd1', user_id: userId,
        entity_kind: 'journal', entity_id: 'j2', op_type: 'create',
        payload: { body: 'Original body', mood: '😐', occurred_at: '2026-09-01T10:00:00Z', source: 'manual' },
        schema_version: 1,
      }] })
      await callSync({ device_id: 'd1', new_ops: [{
        id: 'op-j2b', hlc: '0000000000000002-000000-d1', device_id: 'd1', user_id: userId,
        entity_kind: 'journal', entity_id: 'j2', op_type: 'update',
        payload: { mood: '😀' },
        schema_version: 1,
      }] })
      const rows = await testDb.selectFrom('journal_entries').where('user_id', '=', userId).selectAll().execute()
      expect(rows).toHaveLength(1)
      expect(rows[0].mood).toBe('😀')
      expect(rows[0].body).toBe('Original body')
    })
  })
})

describe('/api/sync — Shared expenses (person + expense_share)', () => {
  it('persists a person and an expense_share and includes both in the next pull', async () => {
    await withTestUser(async ({ userId, callSync, testDb }) => {
      const push = await callSync({ device_id: 'd1', new_ops: [
        {
          id: 'op-person-1', hlc: '0000000000000001-000000-d1', device_id: 'd1', user_id: userId,
          entity_kind: 'person', entity_id: 'p1', op_type: 'create' as const,
          payload: { name: 'Arun', is_archived: 0 }, schema_version: 1,
        },
        {
          id: 'op-share-1', hlc: '0000000000000002-000000-d1', device_id: 'd1', user_id: userId,
          entity_kind: 'expense_share', entity_id: 's1', op_type: 'create' as const,
          payload: { money_entry_id: 'm-rent', person_id: 'p1', amount: 1000000, settled_at: null, settled_account_id: null, note: 'Nov rent' },
          schema_version: 1,
        },
      ] })
      expect(push.applied_ack).toEqual(['op-person-1', 'op-share-1'])

      const pull = await callSync({ device_id: 'd2', new_ops: [] })
      expect(pull.new_ops_from_server.map((o: { entity_kind: string }) => o.entity_kind)).toEqual(['person', 'expense_share'])

      const people = await testDb.selectFrom('people').where('user_id', '=', userId).selectAll().execute()
      expect(people).toHaveLength(1)
      expect(people[0].name).toBe('Arun')
      const shares = await testDb.selectFrom('expense_shares').where('user_id', '=', userId).selectAll().execute()
      expect(shares).toHaveLength(1)
      expect(shares[0].money_entry_id).toBe('m-rent')
      expect(shares[0].amount).toBe(1000000)
      expect(shares[0].settled_at).toBeNull()
    })
  })

  it('per-field LWW: settling a share leaves amount and person intact', async () => {
    await withTestUser(async ({ userId, callSync, testDb }) => {
      await callSync({ device_id: 'd1', new_ops: [{
        id: 'op-s2a', hlc: '0000000000000001-000000-d1', device_id: 'd1', user_id: userId,
        entity_kind: 'expense_share', entity_id: 's2', op_type: 'create',
        payload: { money_entry_id: 'm1', person_id: 'p1', amount: 2400 }, schema_version: 1,
      }] })
      await callSync({ device_id: 'd1', new_ops: [{
        id: 'op-s2b', hlc: '0000000000000002-000000-d1', device_id: 'd1', user_id: userId,
        entity_kind: 'expense_share', entity_id: 's2', op_type: 'update',
        payload: { settled_at: '2026-11-05T10:00:00Z', settled_account_id: 'acc-bank' }, schema_version: 1,
      }] })
      const rows = await testDb.selectFrom('expense_shares').where('user_id', '=', userId).selectAll().execute()
      expect(rows).toHaveLength(1)
      expect(rows[0].settled_at).toBe('2026-11-05T10:00:00Z')
      expect(rows[0].settled_account_id).toBe('acc-bank')
      expect(rows[0].amount).toBe(2400)
      expect(rows[0].person_id).toBe('p1')
    })
  })
})

describe('/api/sync — Notes domain', () => {
  it('persists a note entry and includes it in the next pull', async () => {
    await withTestUser(async ({ userId, callSync, testDb }) => {
      const op = {
        id: 'op-note-1',
        hlc: '0000000000000001-000000-d1',
        device_id: 'd1',
        user_id: userId,
        entity_kind: 'note',
        entity_id: 'note-1',
        op_type: 'create' as const,
        payload: {
          title: 'Quick note',
          body: 'The wifi password is hunter2',
          tags: ['network', 'home'],
          occurred_at: '2026-07-08T10:00:00.000Z',
          source: 'voice',
        },
        schema_version: 1,
      }
      const push = await callSync({ device_id: 'd1', new_ops: [op] })
      expect(push.applied_ack).toEqual(['op-note-1'])

      const pull = await callSync({ device_id: 'd2', new_ops: [] })
      expect(pull.new_ops_from_server).toHaveLength(1)
      expect(pull.new_ops_from_server[0].entity_kind).toBe('note')

      // Server-side row materialized
      const rows = await testDb.selectFrom('note_entries').where('user_id', '=', userId).selectAll().execute()
      expect(rows).toHaveLength(1)
      expect(rows[0].title).toBe('Quick note')
      expect(rows[0].body).toBe('The wifi password is hunter2')
      expect(rows[0].source).toBe('voice')

      // tags JSON round-trips correctly
      const tags = JSON.parse(rows[0].tags as string)
      expect(tags).toEqual(['network', 'home'])
    })
  })

  it('whole-array tags LWW: second op with newer HLC replaces entire tags array', async () => {
    await withTestUser(async ({ userId, callSync, testDb }) => {
      // Initial create
      const op1 = {
        id: 'op-note-2a',
        hlc: '0000000000000001-000000-d1',
        device_id: 'd1',
        user_id: userId,
        entity_kind: 'note',
        entity_id: 'note-2',
        op_type: 'create' as const,
        payload: {
          title: 'Note about meetings',
          body: 'Had a great standup meeting today',
          tags: ['work', 'meeting'],
          occurred_at: '2026-07-08T11:00:00.000Z',
          source: 'manual',
        },
        schema_version: 1,
      }
      await callSync({ device_id: 'd1', new_ops: [op1] })

      // Second op with newer HLC updates only tags
      const op2 = {
        id: 'op-note-2b',
        hlc: '0000000000000002-000000-d1',
        device_id: 'd1',
        user_id: userId,
        entity_kind: 'note',
        entity_id: 'note-2',
        op_type: 'update' as const,
        payload: {
          tags: ['work', 'standup', 'productive'],
        },
        schema_version: 1,
      }
      await callSync({ device_id: 'd1', new_ops: [op2] })

      // Verify whole-array LWW: tags are completely replaced
      const rows = await testDb.selectFrom('note_entries').where('user_id', '=', userId).selectAll().execute()
      expect(rows).toHaveLength(1)
      const tags = JSON.parse(rows[0].tags as string)
      expect(tags).toEqual(['work', 'standup', 'productive'])
      // Verify other fields are unchanged
      expect(rows[0].body).toBe('Had a great standup meeting today')
      expect(rows[0].title).toBe('Note about meetings')
    })
  })
})

describe('/api/sync — D1 bound-parameter limit (dedup chunking)', () => {
  it('does not 500 when a client pushes more than 100 new ops in one sync', async () => {
    await withTestUser(async ({ userId, callSync, testDb }) => {
      // A wedged client accumulates unsynced ops; once it re-pushes >100 at
      // once, the dedup query `id IN (...)` binds >100 params. D1 rejects that
      // (mock throws above), which — before chunking — surfaced as a 500 that
      // never marks anything synced, permanently wedging sync.
      const ops = Array.from({ length: 150 }, (_, i) => ({
        id: `op-bulk-${i}`,
        hlc: `${String(i + 1).padStart(16, '0')}-000000-d1`,
        device_id: 'd1',
        user_id: userId,
        entity_kind: 'money' as const,
        entity_id: `m-${i}`,
        op_type: 'create' as const,
        payload: { amount: 100, currency: 'INR', direction: 'out' as const, occurred_at: '2026-08-01T00:00:00Z', source: 'manual' as const },
        schema_version: 1,
      }))

      const push = await callSync({ device_id: 'd1', new_ops: ops })

      // Must succeed (no 500) and ack every op so the client can mark them synced.
      expect(push.error).toBeUndefined()
      expect(push.applied_ack).toHaveLength(150)

      // All 150 persisted to the op_log exactly once.
      const rows = await testDb.selectFrom('op_log').where('user_id', '=', userId).selectAll().execute()
      expect(rows).toHaveLength(150)
    })
  })

  it('still dedups correctly across chunk boundaries when re-pushing a large batch', async () => {
    await withTestUser(async ({ userId, callSync, testDb }) => {
      const mk = (i: number) => ({
        id: `op-dd-${i}`,
        hlc: `${String(i + 1).padStart(16, '0')}-000000-d1`,
        device_id: 'd1',
        user_id: userId,
        entity_kind: 'money' as const,
        entity_id: `m-${i}`,
        op_type: 'create' as const,
        payload: { amount: 100, currency: 'INR', direction: 'out' as const, occurred_at: '2026-08-01T00:00:00Z', source: 'manual' as const },
        schema_version: 1,
      })
      const ops = Array.from({ length: 130 }, (_, i) => mk(i))
      await callSync({ device_id: 'd1', new_ops: ops })
      // Re-push the exact same 130 ops — dedup must recognise all as existing,
      // creating no duplicates, across the 90-id chunk boundary.
      const repush = await callSync({ device_id: 'd1', new_ops: ops })
      expect(repush.error).toBeUndefined()
      const rows = await testDb.selectFrom('op_log').where('user_id', '=', userId).selectAll().execute()
      expect(rows).toHaveLength(130)
    })
  })
})

describe('/api/sync — incremental (bounded)', () => {
  it('only returns ops newer than the client cursor, and dedups a re-pushed op', async () => {
    await withTestUser(async ({ userId, callSync }) => {
      const mk = (id: string, hlc: string) => ({
        id, hlc, device_id: 'd1', user_id: userId, entity_kind: 'money', entity_id: id,
        op_type: 'create' as const,
        payload: { amount: 100, currency: 'INR', direction: 'out' as const, occurred_at: '2026-08-01T00:00:00Z', source: 'manual' as const },
        schema_version: 1,
      })
      await callSync({ device_id: 'd1', new_ops: [mk('op-1', '0000000000000001-000000-d1')] })
      const push2 = await callSync({ device_id: 'd1', new_ops: [mk('op-2', '0000000000000002-000000-d1')] })
      expect(push2.applied_ack).toEqual(['op-2'])

      // Cursor after op-1 → pull returns only op-2 (not the whole log)
      const pull = await callSync({ device_id: 'd2', last_synced_hlc: '0000000000000001-000000-d1', new_ops: [] })
      expect(pull.new_ops_from_server.map((o: {id: string}) => o.id)).toEqual(['op-2'])

      // Re-pushing op-1 (already known) creates no duplicate; op_log stays 2
      await callSync({ device_id: 'd1', new_ops: [mk('op-1', '0000000000000001-000000-d1')] })
      const all = await callSync({ device_id: 'd3', new_ops: [] })
      expect(all.new_ops_from_server).toHaveLength(2)
      expect(pull.server_hlc).toBe('0000000000000002-000000-d1')
    })
  })
})
