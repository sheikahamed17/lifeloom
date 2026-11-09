'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db, type ExpenseShareRow } from '@/lib/dexie'

/** Live (non-tombstoned) expense shares for the user — settled and outstanding. */
export function useExpenseShares(userId: string | undefined): ExpenseShareRow[] {
  return useLiveQuery<ExpenseShareRow[], ExpenseShareRow[]>(
    async () => {
      if (!userId) return []
      const all = await db.expense_shares.where('user_id').equals(userId).toArray()
      return all.filter(s => !s.deleted_at)
    },
    [userId],
    [],
  ) ?? []
}
