-- Shared expenses: a `person` who can owe you money, and an `expense_share`
-- that says "this person owes this amount on this money entry". Your share of
-- an entry is derived (amount − Σ shares), never stored. A settlement is a
-- state change on the share (settled_at + settled_account_id), not a money
-- entry, so a repayment never appears as income. Two new persisted
-- entity_kinds ('person', 'expense_share'); op-log + per-field HLC LWW.
-- Apply to remote: wrangler d1 migrations apply DB --remote (idempotent).
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0,
  field_hlcs TEXT NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_people_user ON people(user_id);
CREATE TABLE IF NOT EXISTS expense_shares (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  money_entry_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  settled_at TEXT,
  settled_account_id TEXT,
  note TEXT,
  field_hlcs TEXT NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expense_shares_user ON expense_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_expense_shares_entry ON expense_shares(user_id, money_entry_id);
CREATE INDEX IF NOT EXISTS idx_expense_shares_person ON expense_shares(user_id, person_id);
