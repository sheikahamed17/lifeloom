import type { DigestMetrics } from '@/lib/digest-aggregate'

/** DigestMetrics as the UI reads it: totals are null (shown as "—") when a digest can't supply them. */
export type DisplayDigestMetrics = Omit<DigestMetrics, 'spend_total' | 'income_total'> & {
  spend_total: number | null
  income_total: number | null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const count = (v: unknown): number => num(v) ?? 0
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/**
 * Parse an insight's stored metrics without ever producing NaN. Accepts the
 * legacy `spend`/`income` keys an older demo seed wrote, so those rows render
 * figures instead of "₹NaN". Returns null when the blob isn't a JSON object.
 */
export function readDigestMetrics(raw: string): DisplayDigestMetrics | null {
  let o: unknown
  try { o = JSON.parse(raw) } catch { return null }
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return null
  const m = o as Record<string, unknown>
  const topCategories = Array.isArray(m.top_categories)
    ? m.top_categories.flatMap(c => {
        const r = c as Record<string, unknown>
        return typeof r?.name === 'string' && num(r.amount) !== null ? [{ name: r.name, amount: r.amount as number }] : []
      })
    : []
  return {
    currency: typeof m.currency === 'string' ? m.currency : 'INR',
    spend_total: num(m.spend_total ?? m.spend),
    income_total: num(m.income_total ?? m.income),
    top_categories: topCategories,
    tasks_completed: count(m.tasks_completed),
    tasks_created: count(m.tasks_created),
    tasks_overdue: count(m.tasks_overdue),
    skipped_currencies: strings(m.skipped_currencies),
    entry_count: count(m.entry_count),
    learnings_added: count(m.learnings_added),
    notes_added: count(m.notes_added),
    top_learning_tags: strings(m.top_learning_tags),
    owed_total: num(m.owed_total) ?? undefined,
  }
}
