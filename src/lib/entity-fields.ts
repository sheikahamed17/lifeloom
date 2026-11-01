export const MONEY_FIELDS = [
  'amount', 'currency', 'direction', 'category_id', 'description',
  'occurred_at', 'source', 'receipt_key', 'raw_input', 'recurring_rule_id',
  'merchant', 'tags', 'account_id', 'split_group_id',
] as const

export const RECURRING_FIELDS = [
  'amount', 'currency', 'direction', 'category_id', 'description',
  'period', 'interval_count', 'anchor_at', 'next_due_at',
  'end_condition_kind', 'end_until', 'end_count',
  'occurrences_so_far', 'is_active',
  'from_account_id', 'to_account_id',   // set → this rule recurs a TRANSFER, not a money entry
] as const

export const CATEGORY_FIELDS = [
  'name', 'kind', 'icon', 'color', 'sort_order', 'is_archived',
] as const

export const TASK_FIELDS = [
  'title', 'due_at', 'priority', 'completed_at',
  'source', 'raw_input', 'recur_period', 'recur_interval',
  'tags', 'project_id', 'parent_id', 'nudge_muted_at',
] as const

export const LEARNING_FIELDS = [
  'text', 'tags', 'attribution', 'source', 'occurred_at',
] as const

export const NOTE_FIELDS = [
  'title', 'body', 'tags', 'occurred_at', 'source',
] as const

export const INSIGHT_FIELDS = [
  'period', 'starts_at', 'ends_at', 'summary', 'metrics',
] as const

export const ACCOUNT_FIELDS = [
  'name', 'type', 'opening_balance', 'currency', 'icon', 'is_archived', 'match_hints', 'is_default',
] as const

export const GOAL_FIELDS = [
  'name', 'target_amount', 'currency', 'icon', 'account_id', 'saved_amount', 'target_date', 'is_archived',
] as const

export const BUDGET_FIELDS = [
  'category_id', 'amount', 'currency',
] as const

export const PROJECT_FIELDS = [
  'name', 'color', 'archived',
] as const

export const TRANSFER_FIELDS = [
  'from_account_id', 'to_account_id', 'amount', 'currency', 'occurred_at', 'note',
] as const

export const HABIT_FIELDS = [
  'name', 'icon', 'is_archived', 'schedule',
] as const

export const HABIT_LOG_FIELDS = [
  'habit_id', 'day',
] as const

export const JOURNAL_FIELDS = [
  'body', 'mood', 'occurred_at', 'source',
] as const
