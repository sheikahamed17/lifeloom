import { extractAlertIdentifiers } from '@/lib/account-match'
import type { MoneyEntryRow } from '@/lib/dexie'

export type ReviewItem = {
  entry: MoneyEntryRow
  /** Imported with no category: "Set category". */
  needsCategory: boolean
  /** Last four digits of a card the alert names but no account claims: "Which account?". */
  cardLast4: string | null
}

/**
 * The owner's real daily money task (PRODUCT.md principle 2): entries that arrived
 * by email or SMS and still need a category or an account. Newest first.
 * `accountCount` gates the account question: with no accounts there is nothing to pick.
 */
export function reviewQueue(entries: MoneyEntryRow[], accountCount: number): ReviewItem[] {
  const items: ReviewItem[] = []
  for (const e of entries) {
    if (e.deleted_at || (e.source !== 'email' && e.source !== 'sms')) continue
    const needsCategory = !e.category_id
    const cardLast4 = accountCount > 0 && !e.account_id && e.raw_input ? extractAlertIdentifiers(e.raw_input)[0] ?? null : null
    if (needsCategory || cardLast4) items.push({ entry: e, needsCategory, cardLast4 })
  }
  return items.sort((a, b) => b.entry.occurred_at.localeCompare(a.entry.occurred_at))
}
