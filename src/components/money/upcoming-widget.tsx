'use client'

import { useId, useMemo } from 'react'
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
import { EMPTY_NOTE, FOOT_LINK, HEAD_NOTE, SectionHeading } from '@/components/money/section-heading'

type Props = { userId: string }

export function UpcomingWidget({ userId }: Props) {
  const headingId = useId()
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
  const signedFmt = (n: number) => `${n < 0 ? '−' : ''}${symbol}${fmt(Math.abs(n))}`

  if (upcoming.length === 0) {
    return (
      <section aria-labelledby={headingId} className="flex flex-col">
        <SectionHeading id={headingId}>Coming up</SectionHeading>
        <p className={EMPTY_NOTE}>Add a recurring entry (rent, salary, a subscription) to see what’s coming and how the month ends.</p>
        <Link href="/settings/recurring" className={FOOT_LINK}>Recurring rules</Link>
      </section>
    )
  }

  // What is scheduled to go out in the 30-day window the list covers.
  const goingOut = upcoming.reduce((n, e) => (e.direction === 'out' ? n + toPrimary(e.amount, e.currency) : n), 0)

  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      <SectionHeading
        id={headingId}
        aside={goingOut > 0 && <p className={HEAD_NOTE}><span className="tabular-nums">{symbol}{fmt(goingOut)}</span> in the next 30 days</p>}
      >
        Coming up
      </SectionHeading>
      <ul className="flex flex-col">
        {upcoming.slice(0, 5).map((event, idx) => {
          const catName =
            resolve(event.category_id)?.name ||
            event.description ||
            '—'
          return (
            <li key={`${event.ruleId}-${idx}`} className="flex min-h-12 items-center gap-3 border-b border-border py-2 text-[15px]">
              <span className="w-13 shrink-0 text-[13px] font-semibold text-muted-foreground lg:w-14">
                {formatLocalDate(event.date, prefs.tz, { day: 'numeric', month: 'short' })}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{catName}</span>
              <span className={`shrink-0 font-semibold tabular-nums ${event.direction === 'in' ? 'text-income' : ''}`}>
                {event.direction === 'in' ? '+' : ''}{symbol}{fmt(toPrimary(event.amount, event.currency))}
              </span>
            </li>
          )
        })}
        <li className="flex min-h-13 items-center gap-3 border-b border-border py-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-medium">Month end, projected</span>
            <span className="text-[13px] tabular-nums text-muted-foreground">
              {signedFmt(summary.actualNet)} so far, {signedFmt(summary.scheduledIn - summary.scheduledOut)} still scheduled
            </span>
          </div>
          <span className="shrink-0 text-[15px] font-semibold tabular-nums">{signedFmt(summary.projectedNet)}</span>
        </li>
      </ul>
    </section>
  )
}
