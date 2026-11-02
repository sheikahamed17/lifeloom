import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A fresh in-memory SQLite with every file in migrations/ applied in order —
 * the real D1 schema (CHECKs, defaults, indexes, FKs), not a hand-written mock.
 */
export function migratedSqlite(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  const dir = join(process.cwd(), 'migrations')
  for (const f of readdirSync(dir).filter(name => name.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(dir, f), 'utf8'))
  }
  return db
}
