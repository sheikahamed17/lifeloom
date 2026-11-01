/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { materializeRow } from '@/lib/materialize'
import type { Op } from '@/types/ops'

// D1 stand-in: one store keyed table:id; INSERT … ON CONFLICT DO UPDATE merges
// `updates` into the existing row like SQLite would.
let store: Map<string, Record<string, unknown>>
const db: any = {
  selectFrom: (table: string) => {
    const b: any = {
      where: (col: string, _op: string, val: unknown) => { if (col === 'id') b.key = `${table}:${val}`; return b },
      selectAll: () => b,
      executeTakeFirst: async () => store.get(b.key),
    }
    return b
  },
  insertInto: (table: string) => {
    const b: any = {
      values: (r: Record<string, unknown>) => { b.row = r; return b },
      onConflict: (fn: (oc: any) => void) => {
        const oc: any = { column: () => oc, doUpdateSet: (u: Record<string, unknown>) => { b.updates = u; return oc } }
        fn(oc)
        return b
      },
      execute: async () => {
        const key = `${table}:${b.row.id}`
        const existing = store.get(key)
        store.set(key, existing ? { ...existing, ...b.updates } : { ...b.row })
      },
    }
    return b
  },
}

let tick = 0
const op = (entity_kind: Op['entity_kind'], entity_id: string, op_type: Op['op_type'], payload: Record<string, unknown>): Op => ({
  id: `op${++tick}`, hlc: `${String(1_700_000_000_000 + tick).padStart(16, '0')}-000000-dev`,
  device_id: 'dev', user_id: 'u', entity_kind, entity_id, op_type, payload, schema_version: 1,
})
const moneyCreate = { amount: 100, currency: 'INR', direction: 'out', occurred_at: '2026-10-01T00:00:00.000Z', source: 'email' }

describe('materializeRow — tags are JSON-encoded exactly once', () => {
  beforeEach(() => { store = new Map(); tick = 0 })

  it('a partial update that does not touch tags leaves them single-encoded', async () => {
    await materializeRow(db, op('money', 'm1', 'create', { ...moneyCreate, tags: ['food'] }), 'u')
    await materializeRow(db, op('money', 'm1', 'update', { account_id: 'acc' }), 'u')
    await materializeRow(db, op('money', 'm1', 'update', { category_id: 'cat' }), 'u')
    expect(store.get('money_entries:m1')?.tags).toBe('["food"]')
  })

  it('heals an already double/triple-encoded row on its next write', async () => {
    await materializeRow(db, op('task', 't1', 'create', { title: 'x', priority: 'low', source: 'manual', tags: ['home'] }), 'u')
    const row = store.get('tasks:t1')!
    store.set('tasks:t1', { ...row, tags: JSON.stringify(JSON.stringify(JSON.stringify(['home']))) })   // legacy damage
    await materializeRow(db, op('task', 't1', 'update', { completed_at: '2026-10-02T00:00:00.000Z' }), 'u')
    expect(store.get('tasks:t1')?.tags).toBe('["home"]')
  })

  it('a newer tags write still replaces the tags', async () => {
    await materializeRow(db, op('learning', 'l1', 'create', { text: 't', source: 'voice', occurred_at: '2026-10-01T00:00:00.000Z', tags: ['a'] }), 'u')
    await materializeRow(db, op('learning', 'l1', 'update', { tags: ['b', 'c'] }), 'u')
    expect(store.get('learning_entries:l1')?.tags).toBe('["b","c"]')
  })

  it('applies to notes too, and leaves non-tag tables untouched', async () => {
    await materializeRow(db, op('note', 'n1', 'create', { body: 'b', source: 'voice', occurred_at: '2026-10-01T00:00:00.000Z', tags: ['wifi'] }), 'u')
    await materializeRow(db, op('note', 'n1', 'update', { title: 'Wifi' }), 'u')
    expect(store.get('note_entries:n1')?.tags).toBe('["wifi"]')

    await materializeRow(db, op('account', 'a1', 'create', { name: 'Neo 5872', type: 'liability', opening_balance: 0, currency: 'INR' }), 'u')
    await materializeRow(db, op('account', 'a1', 'update', { is_default: 1 }), 'u')
    expect(store.get('accounts:a1')?.name).toBe('Neo 5872')
    expect('tags' in store.get('accounts:a1')!).toBe(false)
  })
})
