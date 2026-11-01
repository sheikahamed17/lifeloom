import { Kysely } from 'kysely'
import { D1Dialect } from 'kysely-d1'
import type { D1Database } from '@cloudflare/workers-types'

// Database schema mirrors migrations/0001_initial.sql.
// Keep these types in sync when adding a migration.
export interface UserTable {
  id: string
  email: string
  name: string | null
  email_verified: number
  image: string | null
  created_at: number
  updated_at: number
}

export interface SessionTable {
  id: string
  user_id: string
  token: string
  expires_at: number
  ip_address: string | null
  user_agent: string | null
  created_at: number
  updated_at: number
}

export interface AccountTable {
  id: string
  user_id: string
  account_id: string
  provider_id: string
  access_token: string | null
  refresh_token: string | null
  id_token: string | null
  access_token_expires_at: number | null
  refresh_token_expires_at: number | null
  scope: string | null
  password: string | null
  created_at: number
  updated_at: number
}

export interface VerificationTable {
  id: string
  identifier: string
  value: string
  expires_at: number
  created_at: number
  updated_at: number
}

export interface DeviceTable {
  id: string
  user_id: string
  device_id: string
  name: string | null
  last_sync_hlc: string | null
  created_at: number
}

export interface OpLogTable {
  id: string
  user_id: string
  hlc: string
  device_id: string
  entity_kind: string
  entity_id: string
  op_type: 'create' | 'update' | 'delete'
  payload: string                // JSON-encoded
  schema_version: number
  applied_at: number
}

export interface WidgetTable {
  id: string
  user_id: string
  label: string | null
  type: string | null
  sort_order: number
  field_hlcs: string             // JSON-encoded
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface CategoryTable {
  id: string
  user_id: string
  name: string
  kind: 'spend' | 'income'
  icon: string | null
  color: string | null
  sort_order: number
  is_archived: number
  field_hlcs: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface RecurringRuleTable {
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
  from_account_id: string | null
  to_account_id: string | null
  field_hlcs: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface MoneyEntryTable {
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
  tags: string | null             // JSON array
  account_id: string | null
  split_group_id: string | null
  field_hlcs: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface TaskTable {
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
  tags: string | null          // JSON string[]
  project_id: string | null
  parent_id: string | null
  nudge_muted_at: string | null
  field_hlcs: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface LearningEntryTable {
  id: string
  user_id: string
  text: string
  tags: string                  // JSON array
  attribution: string | null
  source: 'voice' | 'manual'
  occurred_at: string
  field_hlcs: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface NoteEntryTable {
  id: string
  user_id: string
  title: string | null
  body: string
  tags: string                  // JSON array
  source: 'voice' | 'manual'
  occurred_at: string
  field_hlcs: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface JournalEntryTable {
  id: string
  user_id: string
  body: string
  mood: string | null
  occurred_at: string
  source: 'voice' | 'manual'
  field_hlcs: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface BudgetTable {
  id: string
  user_id: string
  category_id: string
  amount: number
  currency: string
  field_hlcs: string          // JSON Record<string,string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface AccountsTable {
  id: string
  user_id: string
  name: string
  type: 'asset' | 'liability'
  opening_balance: number
  currency: string
  icon: string | null
  is_archived: number
  match_hints: string | null
  is_default: number
  field_hlcs: string          // JSON Record<string,string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface GoalsTable {
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
  field_hlcs: string          // JSON Record<string,string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface TransfersTable {
  id: string
  user_id: string
  from_account_id: string
  to_account_id: string
  amount: number
  currency: string
  occurred_at: string
  note: string | null
  field_hlcs: string          // JSON Record<string,string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface ProjectTable {
  id: string
  user_id: string
  name: string
  color: string | null
  archived: number
  field_hlcs: string          // JSON Record<string,string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface HabitsTable {
  id: string
  user_id: string
  name: string
  icon: string | null
  is_archived: number
  schedule: string | null
  field_hlcs: string          // JSON Record<string,string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface HabitLogsTable {
  id: string
  user_id: string
  habit_id: string
  day: string
  field_hlcs: string          // JSON Record<string,string>
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface FxRateTable {
  date: string                                   // 'YYYY-MM-DD'
  base: string                                   // always 'EUR' from ECB
  target: string                                 // ISO 4217 code
  rate: number                                   // 1 base = `rate` units of target
}

export interface InsightTable {
  id: string
  user_id: string
  period: 'weekly'
  starts_at: string
  ends_at: string
  summary: string
  metrics: string             // JSON-encoded
  field_hlcs: string          // JSON-encoded
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface PushSubscriptionTable {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  failed_count: number
  created_at: string
}

export interface PushNotificationTable {
  id: string
  user_id: string
  title: string
  body: string
  url: string
  created_at: string
  read_at: string | null
}

export interface UserPrefsTable {
  user_id: string
  primary_currency: string
  tz: string
  fx_overrides: string | null          // JSON Record<string, number> (currency → EUR-rate)
  sms_ingest_token_hash: string | null // SHA-256 hex of the personal SMS-ingest token secret
  salary_reminder: number              // 0/1 — opt-in monthly last-working-day salary reminder
  updated_at: string
}

export interface DB {
  user: UserTable
  session: SessionTable
  account: AccountTable
  verification: VerificationTable
  devices: DeviceTable
  op_log: OpLogTable
  widgets: WidgetTable
  categories: CategoryTable
  recurring_rules: RecurringRuleTable
  money_entries: MoneyEntryTable
  tasks: TaskTable
  learning_entries: LearningEntryTable
  note_entries: NoteEntryTable
  journal_entries: JournalEntryTable
  budgets: BudgetTable
  accounts: AccountsTable
  goals: GoalsTable
  transfers: TransfersTable
  habits: HabitsTable
  habit_logs: HabitLogsTable
  projects: ProjectTable
  fx_rates: FxRateTable
  insights: InsightTable
  push_subscriptions: PushSubscriptionTable
  push_notifications: PushNotificationTable
  user_prefs: UserPrefsTable
}

export function createDb(d1: D1Database): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new D1Dialect({ database: d1 }),
  })
}
