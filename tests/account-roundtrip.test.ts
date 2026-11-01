import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/lib/dexie'
import { generateOp, applyLocalOp } from '@/lib/sync-client'

const U = 'u1'

describe('account round-trip — match_hints field', () => {
  beforeEach(async () => { await resetDb() })

  it('creates an account with match_hints and materializes to Dexie', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'account',
      entity_id: 'a1',
      op_type: 'create',
      payload: {
        name: 'HDFC Card',
        type: 'asset',
        opening_balance: 0,
        currency: 'INR',
        icon: '💳',
        is_archived: 0,
        match_hints: '5678',
      },
      user_id: U,
    }))

    const account = await db.accounts.get('a1')
    expect(account?.id).toBe('a1')
    expect(account?.name).toBe('HDFC Card')
    expect(account?.match_hints).toBe('5678')
  })

  it('updates match_hints while preserving name and opening_balance (per-field LWW)', async () => {
    // Create initial account
    await applyLocalOp(await generateOp({
      entity_kind: 'account',
      entity_id: 'a2',
      op_type: 'create',
      payload: {
        name: 'Axis Card',
        type: 'asset',
        opening_balance: 5000,
        currency: 'INR',
        icon: '🏦',
        is_archived: 0,
        match_hints: 'old-hint',
      },
      user_id: U,
    }))

    // Update only match_hints
    await applyLocalOp(await generateOp({
      entity_kind: 'account',
      entity_id: 'a2',
      op_type: 'update',
      payload: {
        match_hints: '9999, axis credit',
      },
      user_id: U,
    }))

    const account = await db.accounts.get('a2')
    expect(account?.match_hints).toBe('9999, axis credit')
    expect(account?.name).toBe('Axis Card')           // preserved
    expect(account?.opening_balance).toBe(5000)       // preserved
  })

  it('handles null match_hints', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'account',
      entity_id: 'a3',
      op_type: 'create',
      payload: {
        name: 'Manual Account',
        type: 'liability',
        opening_balance: 10000,
        currency: 'INR',
        icon: null,
        is_archived: 0,
        match_hints: null,
      },
      user_id: U,
    }))

    const account = await db.accounts.get('a3')
    expect(account?.match_hints).toBeNull()
  })

  it('handles empty/omitted match_hints', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'account',
      entity_id: 'a4',
      op_type: 'create',
      payload: {
        name: 'No Hints Account',
        type: 'asset',
        opening_balance: 0,
        currency: 'INR',
      },
      user_id: U,
    }))

    const account = await db.accounts.get('a4')
    expect(account?.match_hints ?? null).toBeNull()
  })
})

describe('account round-trip — is_default field', () => {
  beforeEach(async () => { await resetDb() })

  it('stars an account via an update op, preserving every other field (per-field LWW)', async () => {
    await applyLocalOp(await generateOp({
      entity_kind: 'account', entity_id: 'd1', op_type: 'create',
      payload: { name: 'Tata Neo 5872', type: 'liability', opening_balance: 0, currency: 'INR', match_hints: 'neo' },
      user_id: U,
    }))
    expect((await db.accounts.get('d1'))?.is_default ?? 0).toBe(0)

    await applyLocalOp(await generateOp({
      entity_kind: 'account', entity_id: 'd1', op_type: 'update', payload: { is_default: 1 }, user_id: U,
    }))
    const account = await db.accounts.get('d1')
    expect(account?.is_default).toBe(1)
    expect(account?.name).toBe('Tata Neo 5872')
    expect(account?.match_hints).toBe('neo')
  })
})
