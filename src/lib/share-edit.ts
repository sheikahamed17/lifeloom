import type { ShareLike } from '@/lib/shares'

/** One "shared with" row as the chip edits it. `person_id` null = a person to create by name. */
export type ShareDraftRow = {
  share_id?: string          // set when editing an existing share
  person_id: string | null
  name: string
  amount: number | null      // minor units; null = "equal split" to be resolved by the chip
  settled?: boolean          // read-only in the chip
}

export type SharePlan = {
  people: { entity_id: string; payload: { name: string; is_archived: 0 } }[]
  creates: { entity_id: string; payload: { money_entry_id: string; person_id: string; amount: number; settled_at: null; settled_account_id: null; note: null } }[]
  updates: { entity_id: string; payload: { amount: number } }[]
  deletes: string[]
}

export type KnownPerson = { id: string; name: string; deleted_at?: string | null }

const norm = (s: string) => s.trim().toLocaleLowerCase()

/**
 * Turn the chip's "shared with" rows into ops for one entry.
 *
 * - A row naming a person who does not exist yet (case-insensitive match
 *   against `people`) creates that person once, even if two rows name them.
 * - A row with a `share_id` updates the existing share's amount when it
 *   changed; without one it creates a share.
 * - An existing live share that no row references is deleted — except a
 *   settled one, which is kept (the chip shows settled shares read-only and
 *   settle/unsettle lives on the People page).
 * - Rows with no name or a non-positive amount are ignored (the chip disables
 *   confirm for them; this is the last line of defence).
 */
export function planShareChanges(args: {
  entryId: string
  existing: ShareLike[]
  rows: ShareDraftRow[]
  people: KnownPerson[]
  newId: () => string
}): SharePlan {
  const { entryId, existing, rows, people, newId } = args
  const plan: SharePlan = { people: [], creates: [], updates: [], deletes: [] }

  const personIdByName = new Map<string, string>()
  for (const p of people) if (!p.deleted_at) personIdByName.set(norm(p.name), p.id)

  const live = existing.filter(s => !s.deleted_at && s.money_entry_id === entryId)
  const liveById = new Map(live.map(s => [s.id, s]))
  const referenced = new Set<string>()

  for (const row of rows) {
    const name = row.name.trim()
    const amount = row.amount ?? 0
    if (row.share_id && liveById.has(row.share_id)) {
      referenced.add(row.share_id)
      const current = liveById.get(row.share_id)!
      if (current.settled_at) continue                       // read-only
      if (amount > 0 && amount !== current.amount) plan.updates.push({ entity_id: row.share_id, payload: { amount } })
      continue
    }
    if (!name || !(amount > 0)) continue
    let personId = row.person_id && people.some(p => p.id === row.person_id && !p.deleted_at) ? row.person_id : personIdByName.get(norm(name))
    if (!personId) {
      personId = newId()
      personIdByName.set(norm(name), personId)
      plan.people.push({ entity_id: personId, payload: { name, is_archived: 0 } })
    }
    plan.creates.push({
      entity_id: newId(),
      payload: { money_entry_id: entryId, person_id: personId, amount, settled_at: null, settled_account_id: null, note: null },
    })
  }

  for (const s of live) {
    if (referenced.has(s.id) || s.settled_at) continue
    plan.deletes.push(s.id)
  }

  return plan
}

/** Resolve the chip's rows into concrete amounts: null amounts take an equal share of the entry. */
export function resolveShareAmounts(amount: number, rows: ShareDraftRow[]): ShareDraftRow[] {
  const open = rows.filter(r => r.amount === null)
  if (open.length === 0) return rows
  const fixed = rows.reduce((n, r) => n + (r.amount ?? 0), 0)
  const each = Math.max(0, Math.floor((amount - fixed) / (open.length + 1)))
  return rows.map(r => (r.amount === null ? { ...r, amount: each } : r))
}
