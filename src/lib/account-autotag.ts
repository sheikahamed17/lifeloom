import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'

/**
 * Writes `{ account_id }`-only money updates (one op per entry) and syncs once.
 * Shared by the Settings "Re-scan past alerts" backfill and the money list's
 * unknown-card pill. Returns how many entries were tagged.
 */
export async function applyAccountTags(
  userId: string,
  tags: Array<{ id: string; account_id: string }>,
): Promise<number> {
  for (const t of tags) {
    await applyLocalOp(await generateOp({
      entity_kind: 'money', entity_id: t.id,
      op_type: 'update', payload: { account_id: t.account_id },
      user_id: userId,
    }))
  }
  if (tags.length > 0) pushPullOnce({ userId }).catch(err => console.error('sync', err))
  return tags.length
}
