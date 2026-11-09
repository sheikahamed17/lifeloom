import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/lib/dexie'
import { generateOp, applyLocalOp } from '@/lib/sync-client'

const U = 'u1'

describe('person + expense_share round-trip (client-side)', () => {
  beforeEach(async () => { await resetDb() })

  it('person: create persists to client Dexie', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'person', entity_id: 'p1', op_type: 'create',
      payload: { name: 'Arun', is_archived: 0 },
      user_id: U,
    }))
    const p = await db.people.get('p1')
    expect(p?.id).toBe('p1')
    expect(p?.user_id).toBe(U)
    expect(p?.name).toBe('Arun')
    expect(p?.is_archived).toBe(0)
    expect(p?.field_hlcs).toBeDefined()
    expect(p?.deleted_at).toBeNull()
  })

  it('person: rename via per-field LWW keeps is_archived', async () => {
    await applyLocalOp(await generateOp({ entity_kind: 'person', entity_id: 'p1', op_type: 'create', payload: { name: 'Arun', is_archived: 0 }, user_id: U }))
    await applyLocalOp(await generateOp({ entity_kind: 'person', entity_id: 'p1', op_type: 'update', payload: { name: 'Arun K' }, user_id: U }))
    const p = await db.people.get('p1')
    expect(p?.name).toBe('Arun K')
    expect(p?.is_archived).toBe(0)
  })

  it('expense_share: create persists to client Dexie with an outstanding (null) settlement', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'expense_share', entity_id: 's1', op_type: 'create',
      payload: { money_entry_id: 'm-rent', person_id: 'p1', amount: 1000000, settled_at: null, settled_account_id: null, note: 'Nov rent' },
      user_id: U,
    }))
    const s = await db.expense_shares.get('s1')
    expect(s?.money_entry_id).toBe('m-rent')
    expect(s?.person_id).toBe('p1')
    expect(s?.amount).toBe(1000000)
    expect(s?.settled_at).toBeNull()
    expect(s?.settled_account_id).toBeNull()
    expect(s?.note).toBe('Nov rent')
    expect(s?.deleted_at).toBeNull()
  })

  it('expense_share: settling is an update of settled_at + settled_account_id only; amount/person intact', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'expense_share', entity_id: 's1', op_type: 'create',
      payload: { money_entry_id: 'm-rent', person_id: 'p1', amount: 1000000 },
      user_id: U,
    }))
    await applyLocalOp(await generateOp({
      entity_kind: 'expense_share', entity_id: 's1', op_type: 'update',
      payload: { settled_at: '2026-11-05T10:00:00.000Z', settled_account_id: 'acc-bank' },
      user_id: U,
    }))
    const s = await db.expense_shares.get('s1')
    expect(s?.settled_at).toBe('2026-11-05T10:00:00.000Z')
    expect(s?.settled_account_id).toBe('acc-bank')
    expect(s?.amount).toBe(1000000)
    expect(s?.person_id).toBe('p1')
  })

  it('expense_share: delete tombstones on the client', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'expense_share', entity_id: 's1', op_type: 'create',
      payload: { money_entry_id: 'm-rent', person_id: 'p1', amount: 500 },
      user_id: U,
    }))
    await applyLocalOp(await generateOp({ entity_kind: 'expense_share', entity_id: 's1', op_type: 'delete', payload: {}, user_id: U }))
    const s = await db.expense_shares.get('s1')
    expect(s?.deleted_at).not.toBeNull()
  })

  it('indexes: shares can be looked up by entry and by person', async () => {
    const rows = [['s1', 'm1', 'p1'], ['s2', 'm1', 'p2'], ['s3', 'm2', 'p1']] as const
    for (const [id, entry, person] of rows) {
      await applyLocalOp(await generateOp({
        entity_kind: 'expense_share', entity_id: id, op_type: 'create',
        payload: { money_entry_id: entry, person_id: person, amount: 100 },
        user_id: U,
      }))
    }
    expect((await db.expense_shares.where('money_entry_id').equals('m1').toArray()).map(s => s.id).sort()).toEqual(['s1', 's2'])
    expect((await db.expense_shares.where('[user_id+person_id]').equals([U, 'p1']).toArray()).map(s => s.id).sort()).toEqual(['s1', 's3'])
  })
})
