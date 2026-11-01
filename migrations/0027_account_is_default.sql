-- Default account: pre-selected on manual/voice/receipt money entries.
ALTER TABLE accounts ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;
