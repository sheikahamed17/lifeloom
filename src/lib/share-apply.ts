import { db } from '@/lib/dexie'
import { applyLocalOp, generateOp } from '@/lib/sync-client'
import { planShareChanges, type SharePlan, type ShareDraftRow } from '@/lib/share-edit'

/**
 * Write the person (when new) and expense_share ops that `rows` imply for one
 * entry; never touches the money payload. Used by the capture/edit chip and by
 * the Needs-you queue's "Paid for someone?". Returns the plan it applied (so a
 * caller can undo the shares it created), or null when there was nothing to do.
 */
export async function applyShareRows(userId: string, entryId: string, rows: ShareDraftRow[]): Promise<SharePlan | null> {
  const existing = await db.expense_shares.where('money_entry_id').equals(entryId).toArray()
  if (rows.length === 0 && existing.every(s => s.deleted_at || s.settled_at)) return null
  const people = await db.people.where('user_id').equals(userId).toArray()
  const plan = planShareChanges({ entryId, existing, rows, people, newId: () => crypto.randomUUID() })
  for (const p of plan.people) await applyLocalOp(await generateOp({ entity_kind: 'person', entity_id: p.entity_id, op_type: 'create', payload: p.payload, user_id: userId }))
  for (const c of plan.creates) await applyLocalOp(await generateOp({ entity_kind: 'expense_share', entity_id: c.entity_id, op_type: 'create', payload: c.payload, user_id: userId }))
  for (const u of plan.updates) await applyLocalOp(await generateOp({ entity_kind: 'expense_share', entity_id: u.entity_id, op_type: 'update', payload: u.payload, user_id: userId }))
  for (const id of plan.deletes) await applyLocalOp(await generateOp({ entity_kind: 'expense_share', entity_id: id, op_type: 'delete', payload: {}, user_id: userId }))
  return plan
}
