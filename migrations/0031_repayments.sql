-- Repayments are real money entries: a bank credit from Arun (or cash he handed
-- you) is a money `in` entry tagged with `settles_person_id`; giving his money
-- back is an `out` entry tagged the same way. Tagged entries are left out of
-- income and spending, and offset what that person owes (see src/lib/shares.ts).
-- Nullable: an ordinary entry has NULL. No index (owed maths runs in memory).
--
-- `people.match_names` holds the names a person's bank alerts use ("ARUN KUMAR S"),
-- as a JSON array of strings, learned when the owner confirms a repayment.
-- Apply to remote: wrangler d1 migrations apply DB --remote (idempotent).
ALTER TABLE money_entries ADD COLUMN settles_person_id TEXT;
ALTER TABLE people ADD COLUMN match_names TEXT;
