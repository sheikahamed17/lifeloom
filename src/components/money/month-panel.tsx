'use client'

import { useMemo } from 'react'
import { SummaryPanel, PanelStat } from '@/components/shared/summary-panel'
import { DayStrip } from '@/components/money/day-strip'
import { daysInMonth, makeDayKeyer } from '@/components/money/month-days'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useExpenseShares } from '@/hooks/use-expense-shares'
import { useBudgets } from '@/hooks/use-budgets'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useFxRates } from '@/hooks/use-fx-rates'
import { withYourShare } from '@/lib/shares'
import { computeBudgetProgress } from '@/lib/budget-exec'
import { convertViaRates } from '@/lib/fx'
import { formatMinor } from '@/lib/currency'
import { formatLocalDate } from '@/lib/format'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import type { MoneyEntryRow } from '@/lib/dexie'

/**
 * The one green panel on Money home: this month's spend (your share of shared entries),
 * a bar per day, and the supporting figures the data can back: what is left of the
 * budgets, where the month lands at this pace, and what came in.
 */
export function MonthPanel({ userId }: { userId: string }) {
  const { prefs } = useUserPrefs()
  const { rates } = useFxRates([...SUPPORTED_CURRENCIES])
  const primary = prefs.primary_currency
  const shares = useExpenseShares(userId)
  const allRaw = useMoneyEntries(userId)
  const all = useMemo(() => withYourShare(allRaw, shares), [allRaw, shares])
  const budgets = useBudgets(userId)

  // The clock is read once per mount, inside useMemo (react-hooks/purity).
  const todayKey = useMemo(() => makeDayKeyer(prefs.tz)(new Date().toISOString()), [prefs.tz])

  const toPrimary = useMemo(() => (e: MoneyEntryRow): number =>
    e.currency === primary ? e.amount : convertViaRates(e.amount, e.currency, primary, e.occurred_at, rates, prefs.fx_overrides ?? {})?.amount ?? 0,
  [primary, rates, prefs.fx_overrides])

  const month = useMemo(() => {
    const dayKey = makeDayKeyer(prefs.tz)
    const [year, monthNo, today] = todayKey.split('-').map(Number)
    const monthKey = todayKey.slice(0, 7)
    const days: number[] = new Array(daysInMonth(year, monthNo)).fill(0)
    let spent = 0
    let income = 0
    for (const e of all) {
      const key = dayKey(e.occurred_at)
      if (!key.startsWith(monthKey)) continue
      const amount = toPrimary(e)
      if (e.direction === 'in') { income += amount; continue }
      spent += amount
      days[Number(key.slice(8)) - 1] += amount
    }
    return { monthKey, today, days, spent, income }
  }, [all, todayKey, prefs.tz, toPrimary])

  const budget = useMemo(() => {
    const progress = computeBudgetProgress(all, budgets, month.monthKey, prefs.tz, toPrimary)
    return {
      count: progress.length,
      limit: progress.reduce((n, p) => n + p.limit, 0),
      spent: progress.reduce((n, p) => n + p.spent, 0),
    }
  }, [all, budgets, month.monthKey, prefs.tz, toPrimary])

  const fmt = (minor: number) => formatMinor(minor, primary, 0)
  const monthLong = formatLocalDate(todayKey, 'UTC', { month: 'long' })
  const monthShort = formatLocalDate(todayKey, 'UTC', { month: 'short' })
  const total = month.days.length
  const left = budget.limit - budget.spent
  const net = month.income - month.spent

  const stats: React.ReactNode[] = []
  if (budget.count > 0) {
    stats.push(left >= 0
      ? <PanelStat key="left" label={`Left of ${fmt(budget.limit)} in budgets`} value={fmt(left)} />
      : <PanelStat key="left" label={`Over ${fmt(budget.limit)} in budgets`} value={fmt(-left)} highlight />)
    if (month.spent > 0 && month.today < total) {
      stats.push(<PanelStat key="pace" label="At this pace" value={fmt(Math.round((month.spent / month.today) * total))} />)
    }
  }
  if (month.income > 0) {
    stats.push(<PanelStat key="earned" label="Earned" value={fmt(month.income)} />)
    stats.push(<PanelStat key="net" label={net >= 0 ? 'Saved' : 'Overspent'} value={fmt(Math.abs(net))} highlight={net < 0} />)
  }

  return (
    <SummaryPanel
      eyebrow={`${monthLong}, day ${month.today} of ${total}`}
      value={fmt(month.spent)}
      unit="spent"
      stats={stats.length > 0 ? stats : undefined}
    >
      <DayStrip days={month.days} today={month.today} monthShort={monthShort} format={fmt} />
    </SummaryPanel>
  )
}
