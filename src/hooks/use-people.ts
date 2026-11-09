'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type PersonRow } from '@/lib/dexie'

/** Active people (not archived, not tombstoned), by name — for pickers. */
export function usePeople(userId: string | undefined): PersonRow[] {
  return useLiveQuery<PersonRow[], PersonRow[]>(
    async () => {
      if (!userId) return []
      const all = await db.people.where('user_id').equals(userId).toArray()
      return all.filter(p => !p.deleted_at && !p.is_archived).sort((a, b) => a.name.localeCompare(b.name))
    },
    [userId],
    [],
  ) ?? []
}
