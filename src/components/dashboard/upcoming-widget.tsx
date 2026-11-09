'use client'

import { useMemo } from 'react'
import { useRecurringRules } from '@/hooks/use-recurring-rules'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useExpenseShares } from '@/hooks/use-expense-shares'
import { withYourShare } from '@/lib/shares'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useFxRates } from '@/hooks/use-fx-rates'
import { useAllCategories } from '@/hooks/use-all-categories'
import { convertViaRates } from '@/lib/fx'
import { currencySymbol } from '@/lib/currency'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { upcomingOccurrences, forecastSummary } from '@/lib/forecast'
import { monthBounds } from '@/lib/money-filter-sort'
import { makeCategoryResolver } from '@/lib/category-resolve'
import { formatLocalDate } from '@/lib/format'

type Props = { userId: string }

const DIRECTION_GLYPHS = {
  in: '↑',
  out: '↓',
}

export function UpcomingWidget({ userId }: Props) {
  const rules = useRecurringRules(userId)
  const entriesRaw = useMoneyEntries(userId)
  const shares = useExpenseShares(userId)
  const entries = useMemo(() => withYourShare(entriesRaw, shares), [entriesRaw, shares])
  const { prefs } = useUserPrefs()
  const { rates } = useFxRates([...SUPPORTED_CURRENCIES])
  const allCats = useAllCategories(userId)

  // Memoized current time in milliseconds
  const nowMs = useMemo(() => new Date().getTime(), [])

  // Time horizons
  const { fromIso, toIso, monthFrom, monthTo } = useMemo(() => {
    const from = new Date(nowMs).toISOString()
    const to = new Date(nowMs + 30 * 24 * 60 * 60 * 1000).toISOString()
    const bounds = monthBounds(nowMs, 0)
    return {
      fromIso: from,
      toIso: to,
      monthFrom: bounds.from,
      monthTo: bounds.to,
    }
  }, [nowMs])

  // Category resolver
  const resolve = useMemo(
    () =>
      makeCategoryResolver(
        allCats.map(c => ({ id: c.id, name: c.name, icon: c.icon, kind: c.kind })),
      ),
    [allCats],
  )

  // FX converter to primary currency
  const toPrimary = useMemo(
    () => (amt: number, currency: string) => {
      if (currency === prefs.primary_currency) return amt
      const nowIso = new Date(nowMs).toISOString()
      return (
        convertViaRates(amt, currency, prefs.primary_currency, nowIso, rates, prefs.fx_overrides ?? {})?.amount ?? 0
      )
    },
    [prefs.primary_currency, nowMs, rates, prefs.fx_overrides],
  )

  // Forecast data
  const upcoming = useMemo(
    () => upcomingOccurrences(rules, fromIso, toIso),
    [rules, fromIso, toIso],
  )

  const scheduledThisMonth = useMemo(() => upcoming.filter(e => e.date < monthTo), [upcoming, monthTo])

  const currentMonthEntries = useMemo(
    () => entries.filter(e => !e.deleted_at && e.occurred_at >= monthFrom && e.occurred_at < monthTo),
    [entries, monthFrom, monthTo],
  )

  const summary = useMemo(
    () => forecastSummary(currentMonthEntries, scheduledThisMonth, toPrimary),
    [currentMonthEntries, scheduledThisMonth, toPrimary],
  )

  // Display utilities
  const fmt = (amt: number) =>
    (amt / (prefs.primary_currency === 'JPY' ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })
  const symbol = currencySymbol(prefs.primary_currency)
  const netColor = summary.projectedNet >= 0 ? 'text-emerald-500' : 'text-rose-500'
  const subColor = summary.projectedNet >= 0 ? 'text-emerald-500/60' : 'text-rose-500/60'

  if (upcoming.length === 0) {
    return (
      <section className="glass flex flex-col gap-4 rounded-2xl p-4">
        <div className="text-center text-sm text-muted-foreground">
          Set up recurring money entries to see your forecast.
        </div>
      </section>
    )
  }

  return (
    <section className="glass flex flex-col gap-4 rounded-2xl p-4">
      <div className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Projected this month (net)</span>
        <div className={`text-[32px] font-semibold font-mono tabular-nums leading-tight ${netColor}`}>
          <span>{symbol}</span>
          {fmt(summary.projectedNet)}
        </div>
        <div className={`text-xs font-mono tabular-nums ${subColor}`}>
          actual {symbol}
          {fmt(summary.actualNet)} · scheduled {symbol}
          {fmt(summary.scheduledIn - summary.scheduledOut)}
        </div>
      </div>

      <div className="border-t border-white/10" />

      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-muted-foreground px-2">Upcoming</span>
        <ul className="flex flex-col gap-1">
          {upcoming.slice(0, 5).map((event, idx) => {
            const catName =
              resolve(event.category_id)?.name ||
              event.description ||
              '—'
            return (
              <li
                key={`${event.ruleId}-${idx}`}
                className="flex items-center gap-3 text-xs min-h-[44px] px-2 py-1 rounded hover:bg-white/5 transition-colors"
              >
                <span className="text-muted-foreground flex-shrink-0 w-16">
                  {formatLocalDate(event.date, prefs.tz)}
                </span>
                <span className="flex-shrink-0 text-foreground/60">
                  {DIRECTION_GLYPHS[event.direction]}
                </span>
                <span className="font-mono tabular-nums flex-shrink-0">
                  {symbol}
                  {fmt(toPrimary(event.amount, event.currency))}
                </span>
                <span className="flex-1 truncate text-foreground/70">
                  {catName}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
