import { describe, it, expect } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { PulseDb } from '@/lib/dexie'

// A tab running the previous bundle pulls 'person' / 'expense_share' ops,
// stores them in op_log (no case for the kind → nothing applied) and moves its
// cursor on. Opening the v15 schema must rebuild those rows from the op_log.
describe('Dexie v15 upgrade replays person / expense_share ops from op_log', () => {
  it('builds people and expense_shares rows (HLC order, settlement applied) on upgrade', async () => {
    await Dexie.delete('pulse')
    // Simulate the OLD client: op_log exists, the new tables do not.
    const old = new Dexie('pulse')
    old.version(14).stores({ op_log: 'id, hlc, entity_kind, entity_id', sync_meta: 'key' })
    await old.open()
    await old.table('op_log').bulkAdd([
      { id: 'o1', hlc: '0000000000000001-000000-d1', device_id: 'd1', user_id: 'u1', entity_kind: 'person', entity_id: 'p1', op_type: 'create', payload: { name: 'Arun', is_archived: 0 }, schema_version: 1 },
      // Stored out of HLC order on purpose: the settlement update sits before the create.
      { id: 'o3', hlc: '0000000000000003-000000-d1', device_id: 'd1', user_id: 'u1', entity_kind: 'expense_share', entity_id: 's1', op_type: 'update', payload: { settled_at: '2026-11-05T10:00:00.000Z', settled_account_id: 'acc' }, schema_version: 1 },
      { id: 'o2', hlc: '0000000000000002-000000-d1', device_id: 'd1', user_id: 'u1', entity_kind: 'expense_share', entity_id: 's1', op_type: 'create', payload: { money_entry_id: 'm1', person_id: 'p1', amount: 1000000 }, schema_version: 1 },
      { id: 'o4', hlc: '0000000000000004-000000-d1', device_id: 'd1', user_id: 'u1', entity_kind: 'money', entity_id: 'm1', op_type: 'create', payload: { amount: 1 }, schema_version: 1 },
    ])
    old.close()

    const db = new PulseDb()
    await db.open()
    const person = await db.people.get('p1')
    expect(person?.name).toBe('Arun')
    expect(person?.user_id).toBe('u1')
    const share = await db.expense_shares.get('s1')
    expect(share?.amount).toBe(1000000)
    expect(share?.person_id).toBe('p1')
    expect(share?.settled_at).toBe('2026-11-05T10:00:00.000Z')
    expect(share?.settled_account_id).toBe('acc')
    // Other kinds are not touched by this upgrade (money has its own path).
    expect(await db.money_entries.get('m1')).toBeUndefined()
    db.close()
    await Dexie.delete('pulse')
  })

  it('is a no-op on a fresh install', async () => {
    await Dexie.delete('pulse')
    const db = new PulseDb()
    await db.open()
    expect(await db.people.count()).toBe(0)
    expect(await db.expense_shares.count()).toBe(0)
    db.close()
    await Dexie.delete('pulse')
  })
})
