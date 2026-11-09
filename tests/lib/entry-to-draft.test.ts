import { describe, it, expect } from 'vitest'
import { moneyRowToDraft, taskRowToDraft, learningRowToDraft, noteRowToDraft } from '@/lib/entry-to-draft'
import type { MoneyEntryRow, TaskRow, LearningRow, NoteRow } from '@/lib/dexie'

const base = { user_id: 'u1', field_hlcs: {}, deleted_at: null, created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z' }

describe('entry-to-draft mappers', () => {
  it('money: maps all domain fields + kind', () => {
    const r: MoneyEntryRow = { ...base, id: 'm1', amount: 7500, currency: 'INR', direction: 'out', category_id: 'c1', description: 'rent', occurred_at: '2026-07-01T10:00:00.000Z', source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null, merchant: null, tags: [], account_id: null }
    expect(moneyRowToDraft(r)).toEqual({
      kind: 'money', amount: 7500, currency: 'INR', direction: 'out', category_id: 'c1',
      description: 'rent', occurred_at: '2026-07-01T10:00:00.000Z', source: 'manual',
      receipt_key: null, raw_input: null, recurring_rule_id: null, merchant: null, tags: [], account_id: null,
      split_group_id: null,
    })
  })

  it('money: a split part carries its group id so an edit-split joins the same group', () => {
    const r: MoneyEntryRow = { ...base, id: 'm3', amount: 100, currency: 'INR', direction: 'out', category_id: null, description: null, occurred_at: '2026-07-01T10:00:00.000Z', source: 'manual', receipt_key: null, raw_input: null, recurring_rule_id: null, merchant: null, tags: [], account_id: null, split_group_id: 'grp-7' }
    expect(moneyRowToDraft(r).split_group_id).toBe('grp-7')
  })

  it('money: null category/description survive', () => {
    const r: MoneyEntryRow = { ...base, id: 'm2', amount: 100, currency: 'USD', direction: 'in', category_id: null, description: null, occurred_at: '2026-07-01T10:00:00.000Z', source: 'voice', receipt_key: null, raw_input: 'got 1', recurring_rule_id: null, merchant: null, tags: [], account_id: null }
    const d = moneyRowToDraft(r)
    expect(d.category_id).toBeNull()
    expect(d.description).toBeNull()
    expect(d.direction).toBe('in')
  })

  it('money: merchant and tags are copied from row', () => {
    const r: MoneyEntryRow = { ...base, id: 'm3', amount: 5000, currency: 'INR', direction: 'out', category_id: 'c2', description: null, occurred_at: '2026-07-01T10:00:00.000Z', source: 'sms', receipt_key: null, raw_input: null, recurring_rule_id: null, merchant: 'AMAZON', tags: ['subscription', 'shopping'], account_id: null }
    const d = moneyRowToDraft(r)
    expect(d.merchant).toBe('AMAZON')
    expect(d.tags).toEqual(['subscription', 'shopping'])
  })

  it('task: maps fields, defaults undefined tags to []', () => {
    const r = { ...base, id: 't1', title: 'Call bank', due_at: '2026-07-02T09:00:00.000Z', priority: 'high', completed_at: null, source: 'manual', raw_input: null, recur_period: null, recur_interval: null, tags: undefined as unknown as string[], project_id: 'p1', parent_id: null } as TaskRow
    const d = taskRowToDraft(r)
    expect(d).toMatchObject({ kind: 'task', title: 'Call bank', due_at: '2026-07-02T09:00:00.000Z', priority: 'high', project_id: 'p1' })
    expect(d.tags).toEqual([])
  })

  it('task: null due/project survive', () => {
    const r: TaskRow = { ...base, id: 't2', title: 'x', due_at: null, priority: 'medium', completed_at: null, source: 'manual', raw_input: null, recur_period: null, recur_interval: null, tags: ['a'], project_id: null, parent_id: null }
    const d = taskRowToDraft(r)
    expect(d.due_at).toBeNull()
    expect(d.project_id).toBeNull()
    expect(d.tags).toEqual(['a'])
  })

  it('learning: maps text/tags/attribution', () => {
    const r: LearningRow = { ...base, id: 'l1', text: 'TIL', tags: ['ai'], attribution: 'blog', source: 'manual', occurred_at: '2026-07-01T10:00:00.000Z' }
    expect(learningRowToDraft(r)).toEqual({ kind: 'learning', text: 'TIL', tags: ['ai'], attribution: 'blog', occurred_at: '2026-07-01T10:00:00.000Z', source: 'manual' })
  })

  it('note: maps body/title/tags, null title survives', () => {
    const r: NoteRow = { ...base, id: 'n1', title: null, body: 'remember this', tags: [], source: 'voice', occurred_at: '2026-07-01T10:00:00.000Z' }
    const d = noteRowToDraft(r)
    expect(d).toEqual({ kind: 'note', title: null, body: 'remember this', tags: [], occurred_at: '2026-07-01T10:00:00.000Z', source: 'voice' })
  })
})
