import { db, type MoneyEntryRow } from '@/lib/dexie'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'

type Tag = { id: string; account_id: string }

// Max money ops written before each sync. A bulk tag must never send hundreds of
// ops in one /api/sync request (D1 per-request limits — see the 2026-08-05 1102
// incident; admin backfill uses the same cap).
const CHUNK = 50

/**
 * Tags entries to accounts with `{ account_id }`-only money updates. Each row is
 * re-read first and skipped if it's gone, deleted, or already has an account —
 * an update op un-deletes a row (op-log LWW), so writing one onto a row deleted
 * or re-tagged on another device would resurrect / clobber it. Returns how many
 * were written. Shared by Settings "Past alerts" and the unknown-card pill.
 */
export function tagEntries(userId: string, tags: Tag[]): Promise<number> {
  return writeChunked(userId, tags, (row) => !row.account_id, t => t.account_id)
}

/** Undo of tagEntries: clears only entries still tagged to the account it set. */
export function untagEntries(userId: string, tags: Tag[]): Promise<number> {
  return writeChunked(userId, tags, (row, t) => row.account_id === t.account_id, () => null)
}

async function writeChunked(
  userId: string,
  tags: Tag[],
  keep: (row: MoneyEntryRow, t: Tag) => boolean,
  value: (t: Tag) => string | null,
): Promise<number> {
  let written = 0
  for (let i = 0; i < tags.length; i += CHUNK) {
    let inChunk = 0
    for (const t of tags.slice(i, i + CHUNK)) {
      const row = await db.money_entries.get(t.id)
      if (!row || row.deleted_at || !keep(row, t)) continue
      await applyLocalOp(await generateOp({
        entity_kind: 'money', entity_id: t.id,
        op_type: 'update', payload: { account_id: value(t) },
        user_id: userId,
      }))
      inChunk++
    }
    written += inChunk
    if (inChunk === 0) continue
    // Sync each chunk before writing the next. Offline → stop here: this chunk's
    // ops stay queued, and the rest can be finished later from Settings.
    try { await pushPullOnce({ userId }) }
    catch (err) { console.error('sync', err); break }
  }
  return written
}
