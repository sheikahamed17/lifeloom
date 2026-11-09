import type { Kysely } from 'kysely'
import type { DB } from '@/lib/db'
import { convertToPrimary } from '@/lib/fx'
import { decodeStoredTags } from '@/lib/stored-tags'
import { withYourShare, owedByPerson } from '@/lib/shares'

export type DigestMetrics = {
  currency: string
  spend_total: number
  income_total: number
  top_categories: Array<{ name: string; amount: number }>
  tasks_completed: number
  tasks_created: number
  tasks_overdue: number
  skipped_currencies: string[]
  entry_count: number
  learnings_added: number
  notes_added: number
  top_learning_tags: string[]
  /** Outstanding shared-expense debts owed TO the user, primary currency. Absent on digests written before shared expenses. */
  owed_total?: number
}

export async function aggregateWeek(
  db: Kysely<DB>,
  userId: string,
  bounds: { startsAt: string; endsAt: string },
  primaryCurrency: string,
  fxOverrides?: Record<string, number>,
): Promise<DigestMetrics> {
  // Fetch money entries in the window (non-deleted)
  const entriesRaw = await db
    .selectFrom('money_entries')
    .where('user_id', '=', userId)
    .where('occurred_at', '>=', bounds.startsAt)
    .where('occurred_at', '<', bounds.endsAt)
    .where('deleted_at', 'is', null)
    .selectAll()
    .execute()

  // Spend counts YOUR share of a shared entry (amount − what others owe you).
  const shares = await db
    .selectFrom('expense_shares')
    .where('user_id', '=', userId)
    .where('deleted_at', 'is', null)
    .selectAll()
    .execute()
  const entries = withYourShare(entriesRaw, shares)

  // Fetch categories (for category names)
  const categories = await db
    .selectFrom('categories')
    .where('user_id', '=', userId)
    .selectAll()
    .execute()

  const categoryById = new Map(categories.map(c => [c.id, c]))

  // Convert all entries and accumulate totals
  let spendTotal = 0
  let incomeTotal = 0
  const categorySpend = new Map<string, number>() // category name → amount
  const skippedCurrencies = new Set<string>()

  for (const entry of entries) {
    let convertedAmount = entry.amount

    if (entry.currency !== primaryCurrency) {
      const converted = await convertToPrimary(db, entry.amount, entry.currency, primaryCurrency, entry.occurred_at, fxOverrides)
      if (!converted) {
        // Conversion failed — skip this entry's amount, record currency
        skippedCurrencies.add(entry.currency)
        continue
      }
      convertedAmount = converted.amount
    }

    if (entry.direction === 'out') {
      spendTotal += convertedAmount
    } else {
      incomeTotal += convertedAmount
    }

    // Track spend by category (income entries not included in top_categories per spec)
    if (entry.direction === 'out') {
      const catName = entry.category_id ? categoryById.get(entry.category_id)?.name : 'Uncategorized'
      const key = catName ?? 'Uncategorized'
      categorySpend.set(key, (categorySpend.get(key) ?? 0) + convertedAmount)
    }
  }

  // "Owed to you": unsettled shares on live out-entries (any date), in primary currency.
  let owedTotal = 0
  if (shares.some(s => !s.settled_at)) {
    const outEntries = await db
      .selectFrom('money_entries')
      .where('user_id', '=', userId)
      .where('direction', '=', 'out')
      .where('deleted_at', 'is', null)
      .selectAll()
      .execute()
    for (const row of owedByPerson(outEntries as unknown as Parameters<typeof owedByPerson>[0], shares, [])) {
      for (const [currency, amount] of Object.entries(row.byCurrency)) {
        if (currency === primaryCurrency) { owedTotal += amount; continue }
        const conv = await convertToPrimary(db, amount, currency, primaryCurrency, bounds.endsAt, fxOverrides)
        if (conv) owedTotal += conv.amount
        else skippedCurrencies.add(currency)
      }
    }
  }

  // Top 5 categories by spend
  const topCategories = Array.from(categorySpend.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)

  // Task metrics
  const tasksInWindow = await db
    .selectFrom('tasks')
    .where('user_id', '=', userId)
    .where('deleted_at', 'is', null)
    .selectAll()
    .execute()

  let tasksCompleted = 0
  let tasksCreated = 0
  for (const t of tasksInWindow) {
    if (t.completed_at && t.completed_at >= bounds.startsAt && t.completed_at < bounds.endsAt) {
      tasksCompleted++
    }
    if (t.created_at >= bounds.startsAt && t.created_at < bounds.endsAt) {
      tasksCreated++
    }
  }

  // Tasks overdue: open (completed_at is null) with due_at < bounds.endsAt
  const tasksOverdue = tasksInWindow.filter(
    t => t.completed_at === null && t.due_at && t.due_at < bounds.endsAt,
  ).length

  // Learning entries in window
  const learnings = await db
    .selectFrom('learning_entries')
    .where('user_id', '=', userId)
    .where('occurred_at', '>=', bounds.startsAt)
    .where('occurred_at', '<', bounds.endsAt)
    .where('deleted_at', 'is', null)
    .selectAll()
    .execute()

  // Note entries in window
  const notes = await db
    .selectFrom('note_entries')
    .where('user_id', '=', userId)
    .where('occurred_at', '>=', bounds.startsAt)
    .where('occurred_at', '<', bounds.endsAt)
    .where('deleted_at', 'is', null)
    .selectAll()
    .execute()

  // Top learning tags (tags is a string[] column, stored as JSON — possibly
  // multiply-encoded on rows written before the materialize fix)
  const tagCounts = new Map<string, number>()
  for (const l of learnings) {
    for (const t of decodeStoredTags(l.tags)) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
    }
  }
  const top_learning_tags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t)

  return {
    currency: primaryCurrency,
    spend_total: spendTotal,
    income_total: incomeTotal,
    top_categories: topCategories,
    tasks_completed: tasksCompleted,
    tasks_created: tasksCreated,
    tasks_overdue: tasksOverdue,
    skipped_currencies: Array.from(skippedCurrencies),
    entry_count: entries.length,
    learnings_added: learnings.length,
    notes_added: notes.length,
    top_learning_tags,
    owed_total: owedTotal,
  }
}
