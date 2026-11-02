import { describe, it, expect, beforeAll } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { migratedSqlite } from './helpers/migrated-sqlite'
import { OP_TYPES } from '@/types/ops'
import { CategoryPayloadSchema } from '@/lib/op-schemas/category'
import { RecurringPayloadObject } from '@/lib/op-schemas/recurring'
import { MoneyPayloadSchema } from '@/lib/op-schemas/money'
import { TaskPayloadSchema } from '@/lib/op-schemas/task'
import { LearningPayloadSchema } from '@/lib/op-schemas/learning'
import { NotePayloadSchema } from '@/lib/op-schemas/note'
import { InsightPayloadObject } from '@/lib/op-schemas/insight'
import { JournalPayloadSchema } from '@/lib/op-schemas/journal'

// Every value an op-schema enum accepts must be storable in its D1 column.
// A CHECK that lags its schema makes each such op fail to materialize
// (SQLITE_CONSTRAINT_CHECK) — silently on /api/sync, as a 500 on email/SMS
// ingest, and it broke the demo reset (fixed by migration 0028). This test
// INSERTS into the real migrated schema, so it catches any CHECK form.
const T = '2026-01-01T00:00:00.000Z'
const base: Record<string, Record<string, unknown>> = {
  op_log: { user_id: 'u', hlc: 'h', device_id: 'd', entity_kind: 'money', entity_id: 'e', op_type: 'create', payload: '{}', schema_version: 1, applied_at: 0 },
  categories: { user_id: 'u', kind: 'spend', field_hlcs: '{}', created_at: T, updated_at: T },
  recurring_rules: { user_id: 'u', amount: 1, direction: 'out', period: 'monthly', anchor_at: T, next_due_at: T, field_hlcs: '{}', created_at: T, updated_at: T },
  money_entries: { user_id: 'u', amount: 1, direction: 'out', occurred_at: T, source: 'manual', field_hlcs: '{}', created_at: T, updated_at: T },
  tasks: { user_id: 'u', title: 't', source: 'manual', field_hlcs: '{}', created_at: T, updated_at: T },
  learning_entries: { user_id: 'u', text: 't', source: 'manual', occurred_at: T, field_hlcs: '{}', created_at: T, updated_at: T },
  note_entries: { user_id: 'u', body: 'b', source: 'manual', occurred_at: T, field_hlcs: '{}', created_at: T, updated_at: T },
  insights: { user_id: 'u', period: 'weekly', starts_at: T, ends_at: T, summary: 's', metrics: '{}', field_hlcs: '{}', created_at: T, updated_at: T },
  journal_entries: { user_id: 'u', body: 'b', occurred_at: T, source: 'manual', field_hlcs: '{}', created_at: T, updated_at: T },
}

const cases: Array<[table: string, column: string, values: readonly string[]]> = [
  ['op_log', 'op_type', OP_TYPES],
  ['categories', 'kind', CategoryPayloadSchema.shape.kind.options],
  ['recurring_rules', 'direction', RecurringPayloadObject.shape.direction.options],
  ['recurring_rules', 'period', RecurringPayloadObject.shape.period.options],
  ['recurring_rules', 'end_condition_kind', RecurringPayloadObject.shape.end_condition_kind.options],
  ['money_entries', 'direction', MoneyPayloadSchema.shape.direction.options],
  ['money_entries', 'source', MoneyPayloadSchema.shape.source.options],
  ['tasks', 'priority', TaskPayloadSchema.shape.priority.unwrap().options],
  ['tasks', 'source', TaskPayloadSchema.shape.source.options],
  ['learning_entries', 'source', LearningPayloadSchema.shape.source.options],
  ['note_entries', 'source', NotePayloadSchema.shape.source.options],
  ['insights', 'period', InsightPayloadObject.shape.period.options],
  ['journal_entries', 'source', JournalPayloadSchema.shape.source.options],
]

describe('D1 CHECK constraints accept every op-schema enum value', () => {
  let db: DatabaseSync
  let n = 0
  beforeAll(() => {
    db = migratedSqlite()
    db.prepare("INSERT INTO user (id, email, name, email_verified, created_at, updated_at) VALUES ('u', 'u@x.test', 'U', 1, 0, 0)").run()
  })

  it.each(cases)('%s.%s', (table, column, values) => {
    expect(values.length).toBeGreaterThan(0)
    for (const value of values) {
      const row: Record<string, unknown> = { ...base[table], id: `row-${++n}`, [column]: value }
      if (table === 'categories') row.name = `cat-${n}`   // distinct names keep the rows easy to tell apart
      const cols = Object.keys(row)
      const insert = () => db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
        .run(...cols.map(c => row[c] as string | number))
      expect(insert, `${table}.${column} = '${value}'`).not.toThrow()
    }
  })

  it('still rejects a value outside the enum (the CHECKs are live)', () => {
    const row = { ...base.money_entries, id: 'junk', source: 'carrier-pigeon' }
    const cols = Object.keys(row)
    expect(() => db.prepare(`INSERT INTO money_entries (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
      .run(...cols.map(c => row[c as keyof typeof row] as string | number))).toThrow(/CHECK constraint failed/)
  })
})
