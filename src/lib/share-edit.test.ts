import { describe, it, expect } from 'vitest'
import { planShareChanges, resolveShareAmounts } from './share-edit'
import type { ShareLike } from './shares'

function ids(...list: string[]) {
  const q = [...list]
  return () => { const n = q.shift(); if (!n) throw new Error('ran out of ids'); return n }
}
const people = [{ id: 'p-arun', name: 'Arun' }, { id: 'p-priya', name: 'Priya' }]
const share = (o: Partial<ShareLike> & { id: string }): ShareLike => ({ money_entry_id: 'm1', person_id: 'p-arun', amount: 100, settled_at: null, settled_account_id: null, deleted_at: null, ...o })

describe('planShareChanges', () => {
  it('create: an existing person gets a share; an unknown name creates the person first (once)', () => {
    const plan = planShareChanges({
      entryId: 'm1', existing: [], people,
      rows: [
        { person_id: 'p-arun', name: 'Arun', amount: 1000000 },
        { person_id: null, name: 'Ravi', amount: 500 },
        { person_id: null, name: 'ravi ', amount: 700 },          // same person, different case/space
      ],
      newId: ids('s1', 'p-new', 's2', 's3'),
    })
    expect(plan.people).toEqual([{ entity_id: 'p-new', payload: { name: 'Ravi', is_archived: 0 } }])
    expect(plan.creates.map(c => [c.entity_id, c.payload.person_id, c.payload.amount])).toEqual([
      ['s1', 'p-arun', 1000000], ['s2', 'p-new', 500], ['s3', 'p-new', 700],
    ])
    expect(plan.creates[0].payload).toEqual({ money_entry_id: 'm1', person_id: 'p-arun', amount: 1000000, settled_at: null, settled_account_id: null, note: null })
    expect(plan.updates).toEqual([])
    expect(plan.deletes).toEqual([])
  })

  it('a typed name that matches an existing person (case-insensitive) reuses them instead of creating a duplicate', () => {
    const plan = planShareChanges({ entryId: 'm1', existing: [], people, rows: [{ person_id: null, name: 'ARUN', amount: 10 }], newId: ids('s1') })
    expect(plan.people).toEqual([])
    expect(plan.creates[0].payload.person_id).toBe('p-arun')
  })

  it('edit: changed amount → update; untouched → nothing; removed → delete; new row → create', () => {
    const existing = [share({ id: 's-arun', amount: 1000000 }), share({ id: 's-priya', person_id: 'p-priya', amount: 300 })]
    const plan = planShareChanges({
      entryId: 'm1', existing, people,
      rows: [
        { share_id: 's-arun', person_id: 'p-arun', name: 'Arun', amount: 900000 },   // changed
        { person_id: null, name: 'Ravi', amount: 100 },                               // new
      ],
      newId: ids('p-ravi', 's-new'),
    })
    expect(plan.updates).toEqual([{ entity_id: 's-arun', payload: { amount: 900000 } }])
    expect(plan.deletes).toEqual(['s-priya'])
    expect(plan.creates).toHaveLength(1)
    expect(plan.creates[0].payload.person_id).toBe('p-ravi')
  })

  it('edit: an unchanged amount produces no update op', () => {
    const existing = [share({ id: 's-arun', amount: 1000000 })]
    const plan = planShareChanges({ entryId: 'm1', existing, people, rows: [{ share_id: 's-arun', person_id: 'p-arun', name: 'Arun', amount: 1000000 }], newId: ids() })
    expect(plan).toEqual({ people: [], creates: [], updates: [], deletes: [] })
  })

  it('settled shares are never updated or deleted from the chip', () => {
    const existing = [share({ id: 's-paid', amount: 500, settled_at: '2026-11-05T00:00:00.000Z', settled_account_id: 'acc' })]
    const removed = planShareChanges({ entryId: 'm1', existing, people, rows: [], newId: ids() })
    expect(removed.deletes).toEqual([])
    const edited = planShareChanges({ entryId: 'm1', existing, people, rows: [{ share_id: 's-paid', person_id: 'p-arun', name: 'Arun', amount: 1, settled: true }], newId: ids() })
    expect(edited.updates).toEqual([])
  })

  it('ignores shares of other entries and tombstoned shares when deciding deletes', () => {
    const existing = [share({ id: 'other', money_entry_id: 'm2' }), share({ id: 'dead', deleted_at: 'x' })]
    expect(planShareChanges({ entryId: 'm1', existing, people, rows: [], newId: ids() }).deletes).toEqual([])
  })

  it('skips rows with no name or a non-positive amount', () => {
    const plan = planShareChanges({ entryId: 'm1', existing: [], people, rows: [{ person_id: null, name: '  ', amount: 10 }, { person_id: 'p-arun', name: 'Arun', amount: 0 }], newId: ids() })
    expect(plan).toEqual({ people: [], creates: [], updates: [], deletes: [] })
  })
})

describe('resolveShareAmounts', () => {
  it('null amounts take an equal split of what is left after fixed rows, you included', () => {
    expect(resolveShareAmounts(2000000, [{ person_id: null, name: 'Arun', amount: null }])).toEqual([{ person_id: null, name: 'Arun', amount: 1000000 }])
    const two = resolveShareAmounts(240000, [{ person_id: null, name: 'A', amount: null }, { person_id: null, name: 'B', amount: null }])
    expect(two.map(r => r.amount)).toEqual([80000, 80000])
    const mixed = resolveShareAmounts(1000, [{ person_id: null, name: 'A', amount: 400 }, { person_id: null, name: 'B', amount: null }])
    expect(mixed.map(r => r.amount)).toEqual([400, 300])
  })
  it('returns the rows untouched when every amount is set', () => {
    const rows = [{ person_id: null, name: 'A', amount: 5 }]
    expect(resolveShareAmounts(100, rows)).toBe(rows)
  })
})
