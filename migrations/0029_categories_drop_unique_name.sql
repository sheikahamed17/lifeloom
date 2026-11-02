-- Drop the UNIQUE (user_id, name, kind) constraint on categories.
--
-- The server tables are projections of the op-log, so they must accept every
-- state the op-log can hold — and the op-log legitimately holds several
-- categories with the same name: each device seeded the defaults under its own
-- ids, the app later deleted the extras, and a deleted category's name can be
-- reused. The constraint also counted deleted rows, so once a tombstoned
-- duplicate landed first, the LIVE category of that name could never be
-- projected (SQLITE_CONSTRAINT_UNIQUE) — and every money entry / recurring rule
-- pointing at it then failed its category_id foreign key. Voice and receipt
-- capture read live categories from this table, so they saw none.
--
-- Display code already merges same-name categories (makeCategoryResolver), and
-- no server code relies on the name being unique. SQLite can't drop a
-- table-level constraint, so the table is rebuilt with every column, default
-- and index preserved.
--
-- categories is a foreign-key PARENT (money_entries.category_id,
-- recurring_rules.category_id). Dropping it deletes its rows first, and with
-- defer_foreign_keys on, SQLite counts every child row that pointed at them as a
-- pending violation; the rename does NOT clear that count. The trailing
-- `defer_foreign_keys = off` is REQUIRED — it discards the count (without it the
-- commit fails). That also means nothing re-checks references at commit, so
-- integrity rests on the copy being complete: explicit column list, no WHERE,
-- ids unchanged. Verify after applying with `PRAGMA foreign_key_check` (empty).
-- (0028 didn't need `off`: it rebuilt child tables, which count nothing.)
--
-- After deploy, Settings → Rebuild server data projects the categories (and the
-- entries) that were rejected.

PRAGMA defer_foreign_keys = on;

CREATE TABLE categories_new (
  id            TEXT    PRIMARY KEY NOT NULL,
  user_id       TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  kind          TEXT    NOT NULL CHECK (kind IN ('spend', 'income')),
  icon          TEXT,
  color         TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_archived   INTEGER NOT NULL DEFAULT 0,
  field_hlcs    TEXT    NOT NULL,
  deleted_at    TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);

INSERT INTO categories_new (id, user_id, name, kind, icon, color, sort_order, is_archived, field_hlcs, deleted_at, created_at, updated_at)
  SELECT id, user_id, name, kind, icon, color, sort_order, is_archived, field_hlcs, deleted_at, created_at, updated_at
  FROM categories;

DROP TABLE categories;
ALTER TABLE categories_new RENAME TO categories;

CREATE INDEX idx_categories_user_kind ON categories(user_id, kind);

PRAGMA defer_foreign_keys = off;
