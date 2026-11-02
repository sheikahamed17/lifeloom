-- Widen two stale `source` CHECK constraints to match the op-schemas.
--
-- money_entries.source was last defined in 0004 as voice/manual/recurring/receipt,
-- but SMS + email ingest (2026-07) write 'sms' / 'email'; tasks.source (0003) is
-- voice/manual, but recurring task spawns write 'recurring'. Every such op failed
-- to materialize with SQLITE_CONSTRAINT_CHECK — so those rows never reached the
-- server projections (budgets/digest/due-task crons), email/SMS ingest returned a
-- 500 after recording the op, and the demo reset aborted mid-seed.
--
-- SQLite can't ALTER a CHECK, so both tables are rebuilt (the 0004 pattern) with
-- every current column, default and index preserved. Nothing references either
-- table by foreign key. After deploy, Settings → Rebuild server data re-projects
-- the rows that were rejected (the op_log always had them).

PRAGMA defer_foreign_keys = on;

CREATE TABLE money_entries_new (
  id                 TEXT    PRIMARY KEY NOT NULL,
  user_id            TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  amount             INTEGER NOT NULL,
  currency           TEXT    NOT NULL DEFAULT 'INR',
  direction          TEXT    NOT NULL CHECK (direction IN ('out', 'in')),
  category_id        TEXT    REFERENCES categories(id),
  description        TEXT,
  occurred_at        TEXT    NOT NULL,
  source             TEXT    NOT NULL CHECK (source IN ('voice', 'manual', 'recurring', 'receipt', 'sms', 'email')),
  receipt_key        TEXT,
  raw_input          TEXT,
  recurring_rule_id  TEXT    REFERENCES recurring_rules(id),
  field_hlcs         TEXT    NOT NULL,
  deleted_at         TEXT,
  created_at         TEXT    NOT NULL,
  updated_at         TEXT    NOT NULL,
  merchant           TEXT,
  tags               TEXT,
  account_id         TEXT,
  split_group_id     TEXT
);

INSERT INTO money_entries_new (id, user_id, amount, currency, direction, category_id, description, occurred_at, source, receipt_key, raw_input, recurring_rule_id, field_hlcs, deleted_at, created_at, updated_at, merchant, tags, account_id, split_group_id)
SELECT id, user_id, amount, currency, direction, category_id, description, occurred_at, source, receipt_key, raw_input, recurring_rule_id, field_hlcs, deleted_at, created_at, updated_at, merchant, tags, account_id, split_group_id
FROM money_entries;

DROP TABLE money_entries;
ALTER TABLE money_entries_new RENAME TO money_entries;

CREATE INDEX idx_money_user_occurred  ON money_entries(user_id, occurred_at DESC);
CREATE INDEX idx_money_user_recurring ON money_entries(user_id, recurring_rule_id);

CREATE TABLE tasks_new (
  id              TEXT    PRIMARY KEY NOT NULL,
  user_id         TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title           TEXT    NOT NULL,
  due_at          TEXT,
  priority        TEXT    NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  completed_at    TEXT,
  source          TEXT    NOT NULL CHECK (source IN ('voice', 'manual', 'recurring')),
  raw_input       TEXT,
  field_hlcs      TEXT    NOT NULL,
  deleted_at      TEXT,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL,
  recur_period    TEXT,
  recur_interval  INTEGER,
  tags            TEXT,
  project_id      TEXT,
  parent_id       TEXT,
  nudge_muted_at  TEXT
);

INSERT INTO tasks_new (id, user_id, title, due_at, priority, completed_at, source, raw_input, field_hlcs, deleted_at, created_at, updated_at, recur_period, recur_interval, tags, project_id, parent_id, nudge_muted_at)
SELECT id, user_id, title, due_at, priority, completed_at, source, raw_input, field_hlcs, deleted_at, created_at, updated_at, recur_period, recur_interval, tags, project_id, parent_id, nudge_muted_at
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;

CREATE INDEX idx_tasks_user_completed
  ON tasks(user_id, completed_at DESC)
  WHERE completed_at IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_tasks_user_open
  ON tasks(user_id, due_at)
  WHERE completed_at IS NULL AND deleted_at IS NULL;
