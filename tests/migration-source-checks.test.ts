import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MoneyPayloadSchema } from '@/lib/op-schemas/money'
import { TaskPayloadSchema } from '@/lib/op-schemas/task'
import { LearningPayloadSchema } from '@/lib/op-schemas/learning'
import { NotePayloadSchema } from '@/lib/op-schemas/note'

// A `source` value the op-schema accepts but the D1 CHECK rejects makes every
// such op fail to materialize (SQLITE_CONSTRAINT_CHECK) — silently on /api/sync,
// as a 500 on email/SMS ingest, and it broke the demo reset. This keeps each
// table's EFFECTIVE (latest-migration) CHECK in step with its op-schema enum.
const DIR = join(process.cwd(), 'migrations')
const files = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()

/** The source CHECK from the last migration that (re)creates `table`, or null if it has none. */
function effectiveSourceCheck(table: string): string[] | null {
  let latest: string[] | null | undefined
  const createRe = new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?${table}(?:_new)?\\s*\\(([\\s\\S]*?)\\n\\);`, 'g')
  for (const f of files) {
    for (const m of readFileSync(join(DIR, f), 'utf8').matchAll(createRe)) {
      const check = m[1].match(/source\s+TEXT[^,\n]*CHECK \(source IN \(([^)]*)\)\)/)
      latest = check ? check[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')) : null
    }
  }
  if (latest === undefined) throw new Error(`no CREATE TABLE ${table} found in migrations/`)
  return latest
}

describe('D1 source CHECK constraints match the op-schemas', () => {
  it.each([
    ['money_entries', MoneyPayloadSchema.shape.source.options],
    ['tasks', TaskPayloadSchema.shape.source.options],
    ['learning_entries', LearningPayloadSchema.shape.source.options],
    ['note_entries', NotePayloadSchema.shape.source.options],
  ] as const)('%s', (table, allowed) => {
    const check = effectiveSourceCheck(table)
    if (check === null) return   // no CHECK → anything the schema allows is storable
    expect([...check].sort()).toEqual([...allowed].sort())
  })
})
