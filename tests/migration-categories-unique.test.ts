import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { migratedSqlite } from './helpers/migrated-sqlite'
import { kyselyOverSqlite } from './helpers/sqlite-kysely'
import { materializeRow } from '@/lib/materialize'
import type { Op } from '@/types/ops'

const DIR = join(process.cwd(), 'migrations')
const FILE = '0029_categories_drop_unique_name.sql'
const NOW = '2026-11-02T00:00:00.000Z'

function sqliteBefore(file: string): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const f of readdirSync(DIR).filter(n => n.endsWith('.sql') && n < file).sort()) db.exec(readFileSync(join(DIR, f), 'utf8'))
  return db
}

const cat = (db: DatabaseSync, id: string, name: string, deletedAt: string | null = null) =>
  db.prepare(`INSERT INTO categories (id, user_id, name, kind, field_hlcs, deleted_at, created_at, updated_at) VALUES (?, 'u1', ?, 'spend', '{}', ?, ?, ?)`)
    .run(id, name, deletedAt, NOW, NOW)

describe(`migration ${FILE}`, () => {
  it('rebuilds categories (an FK parent) inside one transaction, keeping every row and reference', () => {
    const db = sqliteBefore(FILE)
    db.prepare(`INSERT INTO user (id, email, name, email_verified, created_at, updated_at) VALUES ('u1', 'a@b.c', 'a', 1, ?, ?)`).run(NOW, NOW)
    cat(db, 'c-old', 'Food', NOW)          // a deleted duplicate that got projected first
    // every column non-default, so a swapped or dropped column in the copy shows up
    db.prepare(`INSERT INTO categories (id, user_id, name, kind, icon, color, sort_order, is_archived, field_hlcs, deleted_at, created_at, updated_at)
                VALUES ('c-rent', 'u1', 'Rent', 'income', '🏠', '#aabbcc', 7, 1, '{"name":"h1"}', NULL, '2026-01-01T00:00:00.000Z', '2026-02-02T00:00:00.000Z')`).run()
    db.prepare(`INSERT INTO money_entries (id, user_id, amount, currency, direction, category_id, occurred_at, source, field_hlcs, created_at, updated_at)
                VALUES ('m1', 'u1', 100, 'INR', 'out', 'c-old', ?, 'manual', '{}', ?, ?), ('m2', 'u1', 200, 'INR', 'out', 'c-rent', ?, 'manual', '{}', ?, ?)`)
      .run(NOW, NOW, NOW, NOW, NOW, NOW)
    db.prepare(`INSERT INTO recurring_rules (id, user_id, amount, currency, direction, category_id, period, anchor_at, next_due_at, field_hlcs, created_at, updated_at)
                VALUES ('r1', 'u1', 100, 'INR', 'out', 'c-rent', 'monthly', ?, ?, '{}', ?, ?)`).run(NOW, NOW, NOW, NOW)

    // the bug: a live category can't share a name with a tombstone
    expect(() => cat(db, 'c-live', 'Food')).toThrow(/UNIQUE/)

    const snapshot = () => ({
      rows: db.prepare('SELECT * FROM categories ORDER BY id').all(),
      columns: db.prepare('PRAGMA table_xinfo(categories)').all(),
      fks: db.prepare('PRAGMA foreign_key_list(categories)').all(),
      moneyFks: db.prepare('PRAGMA foreign_key_list(money_entries)').all(),
      recurringFks: db.prepare('PRAGMA foreign_key_list(recurring_rules)').all(),
      children: db.prepare('SELECT id, category_id FROM money_entries UNION ALL SELECT id, category_id FROM recurring_rules ORDER BY id').all(),
    })
    const before = snapshot()

    // D1 applies a migration file as one transaction
    db.exec('BEGIN')
    db.exec(readFileSync(join(DIR, FILE), 'utf8'))
    db.exec('COMMIT')

    // identical rows, columns (type/NOT NULL/default), FKs on and into categories
    expect(snapshot()).toEqual(before)
    expect(before.rows).toHaveLength(2)
    expect(before.fks).toMatchObject([{ table: 'user', from: 'user_id', on_delete: 'CASCADE' }])
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(() => db.prepare(`INSERT INTO categories (id, user_id, name, kind, field_hlcs, created_at, updated_at) VALUES ('c-bad', 'u1', 'X', 'bogus', '{}', ?, ?)`)
      .run(NOW, NOW)).toThrow(/CHECK/)
    expect(db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='categories' AND name NOT LIKE 'sqlite_autoindex%'`).all().map(r => r.name))
      .toEqual(['idx_categories_user_kind'])

    // the live category now projects alongside its tombstone…
    cat(db, 'c-live', 'Food')
    expect(db.prepare(`SELECT count(*) AS n FROM categories WHERE name = 'Food'`).get()?.n).toBe(2)
    // …and category_id is still a real foreign key
    expect(() => db.prepare(`UPDATE money_entries SET category_id = 'nope' WHERE id = 'm2'`).run()).toThrow(/FOREIGN KEY/)
    expect(() => db.prepare(`DELETE FROM categories WHERE id = 'c-rent'`).run()).toThrow(/FOREIGN KEY/)
  })

  it('lets the op-log replay project same-name categories and the entries that use them', async () => {
    const sqlite = migratedSqlite()
    sqlite.prepare(`INSERT INTO user (id, email, name, email_verified, created_at, updated_at) VALUES ('u1', 'a@b.c', 'a', 1, ?, ?)`).run(NOW, NOW)
    const db = kyselyOverSqlite(sqlite)
    let n = 0
    const op = (entity_kind: Op['entity_kind'], entity_id: string, op_type: Op['op_type'], payload: Record<string, unknown>, device = 'devA'): Op =>
      ({ id: `op${++n}`, hlc: `00017900000000${String(n).padStart(2, '0')}-000000-${device}`, device_id: device, user_id: 'u1', entity_kind, entity_id, op_type, payload, schema_version: 1 })
    const food = { name: 'Food', kind: 'spend', icon: null, color: null, sort_order: 0, is_archived: 0 }

    // two devices seed "Food" under their own ids; the app later deletes one
    for (const o of [
      op('category', 'cat-a', 'create', food, 'devA'),
      op('category', 'cat-b', 'create', food, 'devB'),
      op('category', 'cat-a', 'delete', {}, 'devB'),
      op('money', 'm1', 'create', { amount: 12000, currency: 'INR', direction: 'out', category_id: 'cat-b', occurred_at: NOW, source: 'email', tags: [] }),
    ]) await materializeRow(db, o, 'u1')

    const cats = await db.selectFrom('categories').select(['id', 'deleted_at']).orderBy('id').execute()
    expect(cats.map(c => [c.id, c.deleted_at !== null])).toEqual([['cat-a', true], ['cat-b', false]])
    expect((await db.selectFrom('money_entries').select('category_id').where('id', '=', 'm1').executeTakeFirst())?.category_id).toBe('cat-b')
  })
})
