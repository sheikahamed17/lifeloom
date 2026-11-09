export type WidgetType = 'spent' | 'budgets' | 'today-tasks' | 'spend-trend' | 'recent-activity' | 'accounts' | 'upcoming' | 'goals' | 'habits' | 'owed'

export const WIDGET_CATALOG: Array<{ type: WidgetType; label: string; description: string }> = [
  { type: 'spent', label: 'Spent', description: 'Total spending overview' },
  { type: 'budgets', label: 'Budgets', description: 'Budget categories' },
  { type: 'today-tasks', label: 'Today\'s Tasks', description: 'Due today and overdue tasks' },
  { type: 'spend-trend', label: 'Spend Trend', description: 'Last 6 months spending trend' },
  { type: 'recent-activity', label: 'Recent Activity', description: 'Recent entries across domains' },
  { type: 'accounts', label: 'Accounts', description: 'Net worth + account balances' },
  { type: 'upcoming', label: 'Upcoming', description: 'Cash-flow forecast: upcoming recurring events + projected month-end' },
  { type: 'goals', label: 'Goals', description: 'Savings goals + progress' },
  { type: 'habits', label: 'Habits', description: 'Today\'s habits + streaks' },
  { type: 'owed', label: 'Owed to you', description: 'Shared expenses others still owe you' },
]

export const DEFAULT_WIDGET_TYPES: WidgetType[] = [
  'spent',
  'budgets',
  'today-tasks',
  'spend-trend',
  'recent-activity',
]

export function widgetId(userId: string, type: WidgetType): string {
  return `widget-${userId}-${type}`
}

export function reorder(
  items: Array<{ id: string; sort_order: number }>,
  id: string,
  dir: 'up' | 'down',
): Array<{ id: string; sort_order: number }> {
  // Find the item's index in sort_order ascending order
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order)
  const idx = sorted.findIndex(item => item.id === id)

  // If not found, boundary, or can't move in that direction, return empty
  if (idx < 0) return []
  if (dir === 'up' && idx === 0) return []
  if (dir === 'down' && idx === sorted.length - 1) return []

  // Swap sort_order with the neighbor — return NEW records (never mutate input).
  const neighbor = dir === 'up' ? sorted[idx - 1] : sorted[idx + 1]
  const item = sorted[idx]

  return [
    { id: item.id, sort_order: neighbor.sort_order },
    { id: neighbor.id, sort_order: item.sort_order },
  ]
}
