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
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

type Props = { userId: string }

const LINK = 'inline-flex min-h-11 items-center gap-1 rounded-lg text-sm text-accent-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent-2'


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
  const netColor = summary.projectedNet >= 0 ? 'text-income' : 'text-destructive'
  const signedFmt = (n: number) => `${n < 0 ? '−' : ''}${symbol}${fmt(Math.abs(n))}`
  // Supporting figures wear the muted text token (a 60% status colour measured 2.7:1).
  const subColor = 'text-muted-foreground'

  if (upcoming.length === 0) {
    return (
      <section className="glass flex flex-col gap-2 rounded-2xl p-4" aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading" className="text-sm font-semibold">Upcoming</h2>
        <p className="text-sm text-muted-foreground">Add a recurring entry (rent, salary, a subscription) to see what’s coming and how the month ends.</p>
        <Link href="/settings/recurring" className={`${LINK} self-start`}>Recurring rules<ChevronRight className="size-4" aria-hidden /></Link>
      </section>
    )
  }

  return (
    <section className="glass flex flex-col gap-4 rounded-2xl p-4" aria-labelledby="upcoming-heading">
      <div className="flex flex-col gap-1">
        <h2 id="upcoming-heading" className="text-sm font-semibold">Month end, projected</h2>
        <div className={`font-mono text-3xl font-semibold tabular-nums leading-tight ${netColor}`}>
          {summary.projectedNet < 0 ? '−' : ''}{symbol}{fmt(Math.abs(summary.projectedNet))}
        </div>
        <p className={`text-xs tabular-nums ${subColor}`}>
          {signedFmt(summary.actualNet)} so far, {signedFmt(summary.scheduledIn - summary.scheduledOut)} still scheduled
        </p>
      </div>

      <div className="border-t border-white/10" />

      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">Upcoming</h3>
        <ul className="flex flex-col gap-1">
          {upcoming.slice(0, 5).map((event, idx) => {
            const catName =
              resolve(event.category_id)?.name ||
              event.description ||
              '—'
            return (
              <li
                key={`${event.ruleId}-${idx}`}
                className="flex min-h-10 items-center gap-3 text-sm"
              >
                <span className="w-14 shrink-0 text-xs text-muted-foreground">
                  {formatLocalDate(event.date, prefs.tz, { day: 'numeric', month: 'short' })}
                </span>
                <span className="flex-1 truncate">{catName}</span>
                <span className={`shrink-0 font-mono tabular-nums ${event.direction === 'in' ? 'text-income' : 'text-foreground'}`}>
                  {event.direction === 'in' ? '+' : '−'}{symbol}{fmt(toPrimary(event.amount, event.currency))}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
