export type Period = { from: string; to: string; label: string }

export type QueryMoneyPlan = {
  kind: 'query_money'
  mode: 'total' | 'breakdown' | 'delta' | 'series'
  direction: 'out' | 'in'
  category_name: string | null
  period: Period
  bucket?: 'day' | 'week' | 'month'
}

export type QueryTaskPlan = {
  kind: 'query_task'
  status: 'open' | 'overdue' | 'done' | 'all'
  period: Period | null
}

export type QueryLearningPlan = {
  kind: 'query_learning'
  search: string | null
  tags: string[]
  period: Period | null
}

export type QueryNotesPlan = {
  kind: 'query_notes'
  search: string | null
  tags: string[]
  period: Period | null
}

export type QueryPlan = QueryMoneyPlan | QueryTaskPlan | QueryLearningPlan | QueryNotesPlan

export const QUERY_KINDS = ['query_money', 'query_task', 'query_learning', 'query_notes'] as const

function isPeriod(value: unknown): value is Period {
  return (
    typeof value === 'object' && value !== null &&
    typeof (value as { from?: unknown }).from === 'string' &&
    typeof (value as { to?: unknown }).to === 'string'
  )
}

/**
 * True when `payload` is a query plan the client can execute locally. A money
 * plan must carry a period: the answer card filters on `period.from`/`to`, so a
 * plan without one (e.g. from a malformed server response) would crash it.
 */
export function isQueryPlan(payload: unknown): payload is QueryPlan {
  if (typeof payload !== 'object' || payload === null) return false
  const kind = (payload as { kind?: unknown }).kind
  if (!QUERY_KINDS.includes(kind as (typeof QUERY_KINDS)[number])) return false
  if (kind === 'query_money') return isPeriod((payload as { period?: unknown }).period)
  return true
}
