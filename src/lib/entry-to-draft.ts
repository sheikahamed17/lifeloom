import type { ChipDraft } from '@/components/confirmation-chip'
import type { MoneyEntryRow, TaskRow, LearningRow, NoteRow } from '@/lib/dexie'
import type { Currency } from '@/lib/op-schemas/money'

export function moneyRowToDraft(r: MoneyEntryRow): Extract<ChipDraft, { kind: 'money' }> {
  return {
    kind: 'money',
    amount: r.amount,
    currency: r.currency as Currency,
    direction: r.direction,
    category_id: r.category_id,
    description: r.description,
    occurred_at: r.occurred_at,
    source: r.source,
    receipt_key: r.receipt_key,
    raw_input: r.raw_input,
    recurring_rule_id: r.recurring_rule_id,
    merchant: r.merchant,
    tags: r.tags,
    account_id: r.account_id,
    // Carried so that splitting a part of an existing split in the edit chip
    // adds to its group rather than starting a second one.
    split_group_id: r.split_group_id ?? null,
  }
}

export function taskRowToDraft(r: TaskRow): Extract<ChipDraft, { kind: 'task' }> {
  return {
    kind: 'task',
    title: r.title,
    due_at: r.due_at,
    priority: r.priority,
    completed_at: r.completed_at,
    source: r.source,
    raw_input: r.raw_input,
    recur_period: r.recur_period,
    recur_interval: r.recur_interval,
    tags: r.tags ?? [],
    project_id: r.project_id,
    parent_id: r.parent_id,
  }
}

export function learningRowToDraft(r: LearningRow): Extract<ChipDraft, { kind: 'learning' }> {
  return {
    kind: 'learning',
    text: r.text,
    tags: r.tags ?? [],
    attribution: r.attribution,
    occurred_at: r.occurred_at,
    source: r.source,
  }
}

export function noteRowToDraft(r: NoteRow): Extract<ChipDraft, { kind: 'note' }> {
  return {
    kind: 'note',
    title: r.title,
    body: r.body,
    tags: r.tags ?? [],
    occurred_at: r.occurred_at,
    source: r.source,
  }
}
