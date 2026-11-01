import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

vi.mock('@/lib/sync-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sync-client')>()),
  pushPullOnce: vi.fn(async () => ({ applied: 0, received: 0 })),
}))

import { db, resetDb } from '@/lib/dexie'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { tagEntries, untagEntries } from '@/lib/account-autotag'

const U = 'u1'
const push = vi.mocked(pushPullOnce)

async function createEntry(id: string, extra: Record<string, unknown> = {}) {
  await applyLocalOp(await generateOp({
    entity_kind: 'money', entity_id: id, op_type: 'create',
    payload: { amount: 100, currency: 'INR', direction: 'out', occurred_at: '2026-10-01T00:00:00.000Z', source: 'email', raw_input: 'Card ending 5872', ...extra },
    user_id: U,
  }))
}

describe('tagEntries / untagEntries', () => {
  beforeEach(async () => { await resetDb(); push.mockClear(); push.mockResolvedValue({ applied: 0, received: 0 }) })

  it('tags untagged rows and skips deleted, already-tagged and missing ones (no resurrection)', async () => {
    await createEntry('ok')
    await createEntry('tagged', { account_id: 'other' })
    await createEntry('gone')
    await applyLocalOp(await generateOp({ entity_kind: 'money', entity_id: 'gone', op_type: 'delete', payload: {}, user_id: U }))

    const n = await tagEntries(U, ['ok', 'tagged', 'gone', 'missing'].map(id => ({ id, account_id: 'neo' })))

    expect(n).toBe(1)
    expect((await db.money_entries.get('ok'))?.account_id).toBe('neo')
    expect((await db.money_entries.get('tagged'))?.account_id).toBe('other')
    expect((await db.money_entries.get('gone'))?.deleted_at).toBeTruthy()   // still deleted
  })

  it('untag only clears entries still tagged to the account it set', async () => {
    await createEntry('a', { account_id: 'neo' })
    await createEntry('b', { account_id: 'picked-elsewhere' })
    const n = await untagEntries(U, [{ id: 'a', account_id: 'neo' }, { id: 'b', account_id: 'neo' }])
    expect(n).toBe(1)
    expect((await db.money_entries.get('a'))?.account_id).toBeNull()
    expect((await db.money_entries.get('b'))?.account_id).toBe('picked-elsewhere')
  })

  it('syncs every 50 writes so one bulk tag never floods a single /api/sync request', async () => {
    for (let i = 0; i < 120; i++) await createEntry(`e${i}`)
    const n = await tagEntries(U, Array.from({ length: 120 }, (_, i) => ({ id: `e${i}`, account_id: 'neo' })))
    expect(n).toBe(120)
    expect(push).toHaveBeenCalledTimes(3)   // 50 + 50 + 20
  })

  it('stops after the first chunk when offline (rest stays untagged for a later retry)', async () => {
    for (let i = 0; i < 60; i++) await createEntry(`e${i}`)
    push.mockRejectedValueOnce(new Error('offline'))
    const n = await tagEntries(U, Array.from({ length: 60 }, (_, i) => ({ id: `e${i}`, account_id: 'neo' })))
    expect(n).toBe(50)
    expect((await db.money_entries.get('e59'))?.account_id ?? null).toBeNull()
  })
})
