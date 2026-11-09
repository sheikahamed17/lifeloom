import type { Kysely } from 'kysely'
import type { DB } from '@/lib/db'
import type { Op } from '@/types/ops'
import { applyOp } from '@/lib/op-log'
import { decodeStoredTags } from '@/lib/stored-tags'
import {
  MONEY_FIELDS,
  RECURRING_FIELDS,
  CATEGORY_FIELDS,
  TASK_FIELDS,
  LEARNING_FIELDS,
  NOTE_FIELDS,
  INSIGHT_FIELDS,
  ACCOUNT_FIELDS,
  GOAL_FIELDS,
  BUDGET_FIELDS,
  PROJECT_FIELDS,
  TRANSFER_FIELDS,
  HABIT_FIELDS,
  HABIT_LOG_FIELDS,
  JOURNAL_FIELDS, PERSON_FIELDS, EXPENSE_SHARE_FIELDS,
} from '@/lib/entity-fields'

// Tables whose `tags` column holds a string[] as JSON text.
const TAG_TABLES: ReadonlySet<string> = new Set(['money_entries', 'learning_entries', 'note_entries', 'tasks'])

// Materialize a single op into its derived D1 table via a per-field LWW upsert.
// Shared by the /api/sync push loop and the one-time /api/admin/backfill replay
// so both stay byte-identical. op_log remains the source of truth; these tables
// are a server-side projection used by the cron jobs (digest, due-tasks, recur).
export async function materializeRow(db: Kysely<DB>, op: Op, userId: string) {
  switch (op.entity_kind) {
    case 'widget':
      return materializeWidget(db, op, userId)
    case 'money':
      return materializeRow_LWW(db, op, userId, 'money_entries', MONEY_FIELDS)
    case 'recurring':
      return materializeRow_LWW(db, op, userId, 'recurring_rules', RECURRING_FIELDS)
    case 'category':
      return materializeRow_LWW(db, op, userId, 'categories', CATEGORY_FIELDS)
    case 'task':
      return materializeRow_LWW(db, op, userId, 'tasks', TASK_FIELDS)
    case 'learning':
      return materializeRow_LWW(db, op, userId, 'learning_entries', LEARNING_FIELDS)
    case 'note':
      return materializeRow_LWW(db, op, userId, 'note_entries', NOTE_FIELDS)
    case 'insight':
      return materializeRow_LWW(db, op, userId, 'insights', INSIGHT_FIELDS)
    case 'account':
      return materializeRow_LWW(db, op, userId, 'accounts', ACCOUNT_FIELDS)
    case 'goal':
      return materializeRow_LWW(db, op, userId, 'goals', GOAL_FIELDS)
    case 'transfer':
      return materializeRow_LWW(db, op, userId, 'transfers', TRANSFER_FIELDS)
    case 'budget':
      return materializeRow_LWW(db, op, userId, 'budgets', BUDGET_FIELDS)
    case 'project':
      return materializeRow_LWW(db, op, userId, 'projects', PROJECT_FIELDS)
    case 'habit':
      return materializeRow_LWW(db, op, userId, 'habits', HABIT_FIELDS)
    case 'habit_log':
      return materializeRow_LWW(db, op, userId, 'habit_logs', HABIT_LOG_FIELDS)
    case 'journal':
      return materializeRow_LWW(db, op, userId, 'journal_entries', JOURNAL_FIELDS)
    case 'person':
      return materializeRow_LWW(db, op, userId, 'people', PERSON_FIELDS)
    case 'expense_share':
      return materializeRow_LWW(db, op, userId, 'expense_shares', EXPENSE_SHARE_FIELDS)
    default:
      return // op_log stores the op; no materialization for this kind yet
  }
}

async function materializeRow_LWW(
  db: Kysely<DB>,
  op: Op,
  userId: string,
  tableName: 'money_entries' | 'recurring_rules' | 'categories' | 'tasks' | 'learning_entries' | 'note_entries' | 'insights' | 'accounts' | 'goals' | 'transfers' | 'budgets' | 'projects' | 'habits' | 'habit_logs' | 'journal_entries' | 'people' | 'expense_shares',
  fields: readonly string[],
) {
  const existing = await db
    .selectFrom(tableName)
    .where('id', '=', op.entity_id)
    .where('user_id', '=', userId)
    .selectAll()
    .executeTakeFirst()

  const hasTags = TAG_TABLES.has(tableName)
  // Decode the stored tags column back to string[] before merging: it's written
  // as JSON text, so feeding the raw string through applyOp made every partial
  // update (one that doesn't touch tags) re-stringify it — `["a"]` → `"[\"a\"]"`
  // → … decodeStoredTags also unwraps rows already damaged that way, so they
  // heal on their next write.
  const existingRow = existing
    ? {
        ...existing,
        ...(hasTags && 'tags' in existing ? { tags: decodeStoredTags(existing.tags) } : {}),
        field_hlcs: JSON.parse(existing.field_hlcs as string) as Record<string, string>,
      } as never
    : undefined

  const merged = applyOp(existingRow, op) as Record<string, unknown>

  const row: Record<string, unknown> = {
    id: op.entity_id,
    user_id: userId,
    field_hlcs: JSON.stringify(merged.field_hlcs),
    deleted_at: merged.deleted_at,
    created_at: merged.created_at,
    updated_at: merged.updated_at,
  }
  // Only write fields the merged entity actually carries. The previous
  // `merged[f] ?? null` coerced an ABSENT optional field (e.g. a category
  // create that omits `is_archived`) to an explicit NULL — which violates a
  // NOT NULL column even when it has a DEFAULT, because an explicit NULL
  // bypasses the default (SQLITE_CONSTRAINT in prod). Omitting the key lets the
  // column DEFAULT apply on INSERT and preserves the existing value on UPDATE;
  // nullable columns the client explicitly set to null still come through
  // (merged[f] === null, not undefined). This also matches per-field LWW —
  // an op that never touched a field must not clobber it.
  for (const f of fields) {
    if (merged[f] !== undefined) {
      // tags are stored as JSON text (merged.tags is always a string[] here — see existingRow)
      row[f] = hasTags && f === 'tags' ? JSON.stringify(merged[f]) : merged[f]
    }
  }

  const updates: Record<string, unknown> = {
    field_hlcs: row.field_hlcs,
    deleted_at: row.deleted_at,
    updated_at: row.updated_at,
  }
  for (const f of fields) {
    if (row[f] !== undefined) updates[f] = row[f]
  }

  await db
    .insertInto(tableName as never)
    .values(row as never)
    .onConflict(oc => oc.column('id' as never).doUpdateSet(updates as never))
    .execute()
}

async function materializeWidget(db: Kysely<DB>, op: Op, userId: string) {
  const existing = await db
    .selectFrom('widgets')
    .where('id', '=', op.entity_id)
    .where('user_id', '=', userId)
    .selectAll()
    .executeTakeFirst()

  const existingRow = existing
    ? {
        id: existing.id,
        user_id: existing.user_id,
        field_hlcs: JSON.parse(existing.field_hlcs) as Record<string, string>,
        deleted_at: existing.deleted_at,
        created_at: existing.created_at,
        updated_at: existing.updated_at,
        label: existing.label,
        type: existing.type,
        sort_order: existing.sort_order,
      }
    : undefined

  const merged = applyOp(existingRow as never, op)

  const row = {
    id: op.entity_id,
    user_id: userId,
    label: (merged.label as string | null) ?? null,
    type: (merged.type as string | null) ?? null,
    sort_order: (merged.sort_order as number) ?? 0,
    field_hlcs: JSON.stringify(merged.field_hlcs),
    deleted_at: merged.deleted_at,
    created_at: merged.created_at,
    updated_at: merged.updated_at,
  }

  // Upsert. SQLite supports INSERT ... ON CONFLICT, exposed via Kysely's onConflict().
  await db
    .insertInto('widgets')
    .values(row)
    .onConflict(oc => oc.column('id').doUpdateSet({
      label: row.label,
      type: row.type,
      sort_order: row.sort_order,
      field_hlcs: row.field_hlcs,
      deleted_at: row.deleted_at,
      updated_at: row.updated_at,
    }))
    .execute()
}
