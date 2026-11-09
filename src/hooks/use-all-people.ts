'use client'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type PersonRow } from '@/lib/dexie'

/** ALL people for the user — including archived and tombstoned — for DISPLAY
 *  name resolution only. Pickers must keep using `usePeople` (active-only). */
export function useAllPeople(userId: string | undefined): PersonRow[] {
  return useLiveQuery<PersonRow[], PersonRow[]>(
    async () => {
      if (!userId) return []
      return db.people.where('user_id').equals(userId).toArray()
    },
    [userId],
    [],
  ) ?? []
}
