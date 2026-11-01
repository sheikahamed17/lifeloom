import Dexie, { type EntityTable, type Table } from 'dexie'
import type { Op } from '@/types/ops'
import type { MoneyPayload } from '@/lib/op-schemas/money'

type SyncMeta = {
  key: string
  value: string
}

type VoiceQueueItem = {
  id: string
  blob: Blob
  created_at: string
  retry_count: number
  status: 'queued' | 'transcribing' | 'done' | 'failed'
}

export type InsightRow = {
  id: string
  user_id: string
  period: 'weekly'
  starts_at: string
  ends_at: string
  summary: string
  metrics: string             // JSON string (deserialize on client)
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type ReceiptQueueItem = {
  id: string
  blob: Blob
  created_at: string
  retry_count: number
  status: 'queued' | 'processing' | 'done' | 'failed'
}

export type ReceiptDraftRow = {
  id: string
  payload: MoneyPayload
  created_at: string
}

export type WidgetRow = {
  id: string
  user_id: string
  label: string | null
  type: string | null
  sort_order: number
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type CategoryRow = {
  id: string
  user_id: string
  name: string
  kind: 'spend' | 'income'
  icon: string | null
  color: string | null
  sort_order: number
  is_archived: number
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type RecurringRuleRow = {
  id: string
  user_id: string
  amount: number
  currency: string
  direction: 'out' | 'in'
  category_id: string | null
  description: string | null
  period: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval_count: number
  anchor_at: string
  next_due_at: string
  end_condition_kind: 'never' | 'until' | 'count'
  end_until: string | null
  end_count: number | null
  occurrences_so_far: number
  is_active: number
  from_account_id?: string | null   // transfer rule: source account (optional keeps fixtures lean)
  to_account_id?: string | null     // transfer rule: destination account
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type MoneyEntryRow = {
  id: string
  user_id: string
  amount: number
  currency: string
  direction: 'out' | 'in'
  category_id: string | null
  description: string | null
  occurred_at: string
  source: 'voice' | 'manual' | 'recurring' | 'receipt' | 'sms' | 'email'
  receipt_key: string | null
  raw_input: string | null
  recurring_rule_id: string | null
  merchant: string | null
  tags: string[]
  account_id: string | null
  split_group_id?: string | null   // optional: set on split parts; absent on ordinary entries (keeps fixtures lean)
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type TaskRow = {
  id: string
  user_id: string
  title: string
  due_at: string | null
  priority: 'low' | 'medium' | 'high'
  completed_at: string | null
  source: 'voice' | 'manual' | 'recurring'
  raw_input: string | null
  recur_period: 'daily' | 'weekly' | 'monthly' | 'yearly' | null
  recur_interval: number | null
  tags: string[]
  project_id: string | null
  parent_id: string | null
  nudge_muted_at?: string | null
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type LearningRow = {
  id: string
  user_id: string
  text: string
  tags: string[]
  attribution: string | null
  source: 'voice' | 'manual'
  occurred_at: string
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type NoteRow = {
  id: string
  user_id: string
  title: string | null
  body: string
  tags: string[]
  source: 'voice' | 'manual'
  occurred_at: string
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type BudgetRow = {
  id: string            // === category_id (1:1)
  user_id: string
  category_id: string
  amount: number        // minor units, in `currency`
  currency: string
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type AccountRow = {
  id: string
  user_id: string
  name: string
  type: 'asset' | 'liability'
  opening_balance: number         // minor units, account currency
  currency: string
  icon: string | null
  is_archived: number
  match_hints: string | null
  is_default?: number             // 0/1; absent on accounts created before migration 0027
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type GoalRow = {
  id: string
  user_id: string
  name: string
  target_amount: number
  currency: string
  icon: string | null
  account_id: string | null
  saved_amount: number
  target_date: string | null
  is_archived: number
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type TransferRow = {
  id: string
  user_id: string
  from_account_id: string
  to_account_id: string
  amount: number
  currency: string
  occurred_at: string
  note: string | null
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type HabitRow = {
  id: string
  user_id: string
  name: string
  icon: string | null
  is_archived: number
  schedule: string | null
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type HabitLogRow = {
  id: string
  user_id: string
  habit_id: string
  day: string
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type ProjectRow = {
  id: string
  user_id: string
  name: string
  color: string | null
  archived: 0 | 1
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type FxRateRow = {
  date: string                  // 'YYYY-MM-DD'
  base: string                  // 'EUR' from ECB
  target: string                // ISO 4217
  rate: number
  // Compound primary key in Dexie is [date+target] — `base` is implicitly 'EUR'.
}

export type JournalRow = {
  id: string
  user_id: string
  body: string
  mood: string | null
  occurred_at: string
  source: string
  field_hlcs: Record<string, string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

class PulseDb extends Dexie {
  op_log!: EntityTable<Op, 'id'>
  widgets!: EntityTable<WidgetRow, 'id'>
  sync_meta!: EntityTable<SyncMeta, 'key'>
  voice_queue!: EntityTable<VoiceQueueItem, 'id'>
  categories!: EntityTable<CategoryRow, 'id'>
  recurring_rules!: EntityTable<RecurringRuleRow, 'id'>
  money_entries!: EntityTable<MoneyEntryRow, 'id'>
  tasks!: EntityTable<TaskRow, 'id'>
  insights!: EntityTable<InsightRow, 'id'>
  receipt_queue!: EntityTable<ReceiptQueueItem, 'id'>
  learning_entries!: EntityTable<LearningRow, 'id'>
  note_entries!: EntityTable<NoteRow, 'id'>
  budgets!: EntityTable<BudgetRow, 'id'>
  accounts!: EntityTable<AccountRow, 'id'>
  goals!: EntityTable<GoalRow, 'id'>
  transfers!: EntityTable<TransferRow, 'id'>
  habits!: EntityTable<HabitRow, 'id'>
  habit_logs!: EntityTable<HabitLogRow, 'id'>
  journal_entries!: EntityTable<JournalRow, 'id'>
  receipt_drafts!: EntityTable<ReceiptDraftRow, 'id'>
  projects!: EntityTable<ProjectRow, 'id'>
  fx_rates!: Table<FxRateRow>

  constructor() {
    super('pulse')
    this.version(1).stores({
      op_log: 'id, hlc, entity_kind, entity_id',
      widgets: 'id, user_id, updated_at',
      sync_meta: 'key',
      voice_queue: 'id, status, created_at',
    })
    this.version(2).stores({
      categories:      'id, user_id, [user_id+kind], sort_order',
      recurring_rules: 'id, user_id, next_due_at, is_active',
      money_entries:   'id, user_id, occurred_at, [user_id+occurred_at], category_id, recurring_rule_id',
    })
    this.version(3).stores({
      tasks:    'id, user_id, due_at, completed_at, [user_id+due_at], [user_id+completed_at]',
      fx_rates: '[date+target], target, date',
    })
    this.version(4).stores({
      insights: 'id, user_id, [user_id+starts_at]',
      receipt_queue: 'id, status, created_at',
    })
    this.version(5).stores({
      learning_entries: 'id, user_id, occurred_at, *tags',
    })
    this.version(6).stores({
      note_entries: 'id, user_id, occurred_at, *tags',
    })
    this.version(7).stores({
      budgets: 'id, user_id, category_id, [user_id+category_id]',
    })
    this.version(8).stores({
      receipt_drafts: 'id, created_at',
    })
    this.version(9).stores({
      projects: 'id, user_id',
    })
    this.version(10).stores({
      accounts: 'id, user_id, [user_id+type]',
    })
    this.version(11).stores({
      goals: 'id, user_id',
    })
    this.version(12).stores({
      transfers: 'id, user_id',
    })
    this.version(13).stores({
      habits: 'id, user_id',
      habit_logs: 'id, user_id, [user_id+day]',
    })
    this.version(14).stores({
      journal_entries: 'id, user_id, occurred_at',
    })
  }
}

export const db = new PulseDb()

export async function resetDb() {
  await db.op_log.clear()
  await db.widgets.clear()
  await db.sync_meta.clear()
  await db.voice_queue.clear()
  await db.categories.clear()
  await db.recurring_rules.clear()
  await db.money_entries.clear()
  await db.tasks.clear()
  await db.insights.clear()
  await db.receipt_queue.clear()
  await db.learning_entries.clear()
  await db.note_entries.clear()
  await db.budgets.clear()
  await db.accounts.clear()
  await db.goals.clear()
  await db.transfers.clear()
  await db.habits.clear()
  await db.habit_logs.clear()
  await db.journal_entries.clear()
  await db.projects.clear()
  await db.receipt_drafts.clear()
  await db.fx_rates.clear()
}
