'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useExpenseShares } from '@/hooks/use-expense-shares'
import { withYourShare } from '@/lib/shares'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useFxRates } from '@/hooks/use-fx-rates'
import { useCategories } from '@/hooks/use-categories'
import { useAllCategories } from '@/hooks/use-all-categories'
import { convertViaRates } from '@/lib/fx'
import { currencySymbol, formatMajor, formatMinor } from '@/lib/currency'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { makeCategoryResolver } from '@/lib/category-resolve'
import {
  computeMoneyBreakdown,
  computeMoneyDelta,
  computeMoneySeries,
  deltaFetchRange,
} from '@/lib/query-money-exec'
import type { QueryMoneyPlan } from '@/lib/query-plans'
import type { MoneyEntryRow, CategoryRow, FxRateRow } from '@/lib/dexie'
import type { UserPrefs } from '@/hooks/use-user-prefs'

type Props = {
  userId: string
  plan: QueryMoneyPlan
  onDismiss: () => void
  onResult?: (input: import('@/lib/speak-answer').SpokenAnswerInput) => void
}

const AUTO_DISMISS_MS = 30_000

export function QueryAnswerCard({ userId, plan, onDismiss, onResult }: Props) {
  const { prefs } = useUserPrefs()
  const fetchRange = useMemo(() => {
    return deltaFetchRange(plan.mode, plan.period)
  }, [plan.mode, plan.period])
  const entriesRaw = useMoneyEntries(userId, fetchRange)
  const shares = useExpenseShares(userId)
  // Answers are about YOUR spend: a shared entry counts your share only.
  const entries = useMemo(() => withYourShare(entriesRaw, shares), [entriesRaw, shares])
  const { rates } = useFxRates([...SUPPORTED_CURRENCIES])
  const categories = useCategories(userId)
  const allCategories = useAllCategories(userId)
  const [showEntries, setShowEntries] = useState(false)

  const resolve = useMemo(
    () =>
      makeCategoryResolver(
        allCategories.map(c => ({ id: c.id, name: c.name, icon: c.icon, kind: c.kind })),
      ),
    [allCategories],
  )

  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [onDismiss])

  const targetCategoryId = useMemo(() => {
    if (!plan.category_name) return null
    const expectedKind = plan.direction === 'out' ? 'spend' : 'income'
    const match = categories.find(c => c.name === plan.category_name && c.kind === expectedKind)
    return match?.id ?? null
  }, [plan.category_name, plan.direction, categories])

  // Convert entry amount to primary currency (per-entry FX)
  const toPrimary = useCallback((entry: MoneyEntryRow): number => {
    if (entry.currency === prefs.primary_currency) {
      return entry.amount
    }
    const conv = convertViaRates(entry.amount, entry.currency, prefs.primary_currency, entry.occurred_at, rates, prefs.fx_overrides ?? {})
    return conv ? conv.amount : 0
  }, [prefs.primary_currency, rates, prefs.fx_overrides])

  // Category name lookup function
  const categoryNameOf = useCallback((categoryId: string | null): string | null => {
    if (!categoryId) return null
    return resolve(categoryId)?.name ?? null
  }, [resolve])

  // Filter entries by direction, category, and current-period date bounds
  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      if (e.occurred_at < plan.period.from || e.occurred_at >= plan.period.to) return false
      if (e.direction !== plan.direction) return false
      if (targetCategoryId && e.category_id !== targetCategoryId) return false
      return true
    })
  }, [entries, plan.period, plan.direction, targetCategoryId])

  // Get previous period entries for delta mode
  const previousEntries = useMemo(() => {
    // Calculate period length
    const periodFrom = new Date(plan.period.from)
    const periodTo = new Date(plan.period.to)
    const periodLengthMs = periodTo.getTime() - periodFrom.getTime()

    // Calculate previous period
    const prevFrom = new Date(periodFrom.getTime() - periodLengthMs)
    const prevTo = periodFrom

    return entries.filter(e => {
      const entryDate = new Date(e.occurred_at)
      return entryDate >= prevFrom && entryDate < prevTo && e.direction === plan.direction &&
        (!targetCategoryId || e.category_id === targetCategoryId)
    })
  }, [entries, plan.period, plan.direction, targetCategoryId])

  // Compute all mode data upfront using exec fns
  const modeData = useMemo(() => {
    // Total mode
    let totalAmount = 0
    let totalCount = 0
    const seenCurrencies = new Set<string>()

    for (const e of filteredEntries) {
      totalCount++
      seenCurrencies.add(e.currency)
      totalAmount += toPrimary(e)
    }

    // Breakdown mode: call exec fn
    const breakdown = computeMoneyBreakdown(
      filteredEntries,
      { direction: plan.direction, categoryNameOf },
      toPrimary,
    )

    // Delta mode: call exec fn
    const { current: currentDelta, previous: previousDelta, deltaPct } = computeMoneyDelta(
      filteredEntries,
      previousEntries,
      plan.direction,
      toPrimary,
    )

    // Series mode: call exec fn
    const series = computeMoneySeries(
      filteredEntries,
      {
        from: plan.period.from,
        to: plan.period.to,
        bucket: plan.bucket ?? 'day',
        direction: plan.direction,
      },
      toPrimary,
    )

    return {
      total: { amount: totalAmount, count: totalCount, multiCurrency: seenCurrencies.size > 1 },
      breakdown,
      delta: { current: currentDelta, previous: previousDelta, deltaPct },
      series,
    }
  }, [filteredEntries, previousEntries, plan, toPrimary, categoryNameOf])

  // Emit spoken answer input once per plan/result
  useEffect(() => {
    if (!onResult) return
    const base = { kind: 'money' as const, mode: plan.mode, direction: plan.direction, categoryName: plan.category_name, periodLabel: plan.period.label, currency: prefs.primary_currency }
    if (plan.mode === 'breakdown') {
      onResult({ ...base, top: modeData.breakdown.map(b => ({ name: b.categoryName, amount: b.amount })) })
    } else if (plan.mode === 'delta') {
      onResult({ ...base, current: modeData.delta.current, deltaPct: modeData.delta.deltaPct })
    } else if (plan.mode === 'series') {
      onResult({ ...base, total: modeData.series.reduce((s, p) => s + p.amount, 0) })
    } else {
      onResult({ ...base, total: modeData.total.amount })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, modeData])

  // Mode-specific rendering
  const headerText = useMemo(() => {
    const directionText = plan.direction === 'out' ? 'Spent' : 'Earned'
    const categoryText = plan.category_name ? ` in ${plan.category_name}` : ''
    const periodText = plan.period.label
    const modeText = plan.mode !== 'total' ? ` (${plan.mode})` : ''
    return `${directionText}${categoryText}${modeText} · ${periodText}`
  }, [plan])

  const divisor = prefs.primary_currency === 'JPY' ? 1 : 100

  const fmt = (minor: number) =>
    `${currencySymbol(prefs.primary_currency)}${(minor / divisor).toLocaleString(undefined, { maximumFractionDigits: prefs.primary_currency === 'JPY' ? 0 : 2 })}`

  const entriesToggle = (what: string) => (
    <>
      <Button
        variant="outline"
        className="self-start"
        onClick={() => setShowEntries(!showEntries)}
        aria-label={showEntries ? `Hide entries for ${what} answer` : `Show entries for ${what} answer`}
      >
        {showEntries ? 'Hide entries' : 'Show entries'}
      </Button>
      {showEntries && <FilteredMoneyList entries={filteredEntries} categories={categories} prefs={prefs} rates={rates} />}
    </>
  )

  if (plan.mode === 'total') {
    const { amount, count, multiCurrency } = modeData.total

    return (
      <AnswerShell title={headerText} dismissLabel="Dismiss money answer" onDismiss={onDismiss}>
        <p className={FIGURE}>{fmt(amount)}</p>

        <p className={NOTE}>
          Based on {count} {count === 1 ? 'entry' : 'entries'}
        </p>

        {plan.category_name && !targetCategoryId && (
          <p className="text-[13px] font-medium text-warning">
            Category &quot;{plan.category_name}&quot; not found. Showing all categories instead.
          </p>
        )}

        {multiCurrency && rates.length > 0 && (
          <p className={NOTE}>
            *Converted from multiple currencies via ECB {rates[0]?.date}
          </p>
        )}

        {entriesToggle('money')}
      </AnswerShell>
    )
  }

  if (plan.mode === 'breakdown') {
    const { breakdown } = modeData
    const max = Math.max(1, ...breakdown.map(b => b.amount))

    return (
      <AnswerShell title={headerText} dismissLabel="Dismiss breakdown answer" onDismiss={onDismiss}>
        {breakdown.length === 0 ? (
          <p className={NOTE}>No entries found.</p>
        ) : (
          <ul className="-mt-3 flex flex-col divide-y divide-border">
            {breakdown.map((item, idx) => {
              const amount = fmt(item.amount)
              const barWidth = (item.amount / max) * 100
              return (
                <li key={idx} className="flex min-h-11 items-center gap-3 py-2 text-sm">
                  <span className="w-24 shrink-0 truncate font-medium">{item.categoryName ?? 'Uncategorized'}</span>
                  <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${item.categoryName ?? 'Uncategorized'}: ${amount}`} aria-valuenow={barWidth} aria-valuemin={0} aria-valuemax={100}>
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-foreground"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-right font-semibold tabular-nums">{amount}</span>
                </li>
              )
            })}
          </ul>
        )}

        {entriesToggle('breakdown')}
      </AnswerShell>
    )
  }

  if (plan.mode === 'delta') {
    const { current, previous, deltaPct } = modeData.delta

    return (
      <AnswerShell title={headerText} dismissLabel="Dismiss delta answer" onDismiss={onDismiss}>
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className={NOTE}>Current period</p>
            <p className={FIGURE}>{fmt(current)}</p>
          </div>
          {deltaPct !== null && (
            <div className="flex flex-col gap-1 text-right">
              <p className={NOTE}>Change</p>
              <p className="text-[19px] font-semibold tabular-nums">
                {deltaPct > 0 ? '↑' : '↓'}{Math.abs(deltaPct).toFixed(1)}%
              </p>
            </div>
          )}
        </div>

        <p className={NOTE}>
          vs previous period: {fmt(previous)}
        </p>

        {entriesToggle('delta')}
      </AnswerShell>
    )
  }

  if (plan.mode === 'series') {
    const { series } = modeData

    return (
      <AnswerShell title={headerText} dismissLabel="Dismiss series answer" onDismiss={onDismiss}>
        {series.length > 0 && (
          <Sparkline points={series.map(d => d.amount)} width={100} height={48} label={`Spending trend over ${series.length} periods`} />
        )}

        <p className={NOTE}>
          {series.filter(d => d.amount > 0).length} buckets with activity
        </p>

        {entriesToggle('series')}
      </AnswerShell>
    )
  }

  return null
}

const FIGURE = 'text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums'
const NOTE = 'text-[13px] text-muted-foreground'

/** An answer is something to read, not act on: a ruled section on the page ground with a quiet Dismiss. */
function AnswerShell({ title, dismissLabel, onDismiss, children }: { title: string; dismissLabel: string; onDismiss: () => void; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3 border-b border-border">
        <h2 className="pb-2.5 text-[19px] font-bold tracking-[-0.02em] lg:text-[22px]">{title}</h2>
        <Button
          variant="ghost"
          className="-mr-2 h-11 shrink-0 px-2 font-medium underline underline-offset-4 hover:bg-transparent"
          onClick={onDismiss}
          aria-label={dismissLabel}
        >
          Dismiss
        </Button>
      </div>
      {children}
    </section>
  )
}

function FilteredMoneyList({
  entries,
  categories,
  prefs,
  rates,
}: {
  entries: MoneyEntryRow[]
  categories: CategoryRow[]
  prefs: UserPrefs
  rates: FxRateRow[]
}) {
  const categoryById = useMemo(
    () => new Map(categories.map(c => [c.id, c])),
    [categories],
  )
  const [expandedFx, setExpandedFx] = useState<string | null>(null)

  return (
    <ul className="flex flex-col divide-y divide-border border-t border-border">
      {entries.length === 0 ? (
        <li className="py-4 text-sm text-muted-foreground">No entries in this query.</li>
      ) : (
        entries.map(e => {
          const cat = e.category_id ? categoryById.get(e.category_id) : undefined
          return (
            <li
              key={e.id}
              className="flex min-h-[52px] items-center justify-between gap-3 py-2"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="truncate text-[15px] font-medium">
                  {e.description ? e.description : (cat ? cat.name : 'Uncategorized')}
                </div>
                {e.description && cat && (
                  <span className="text-[13px] text-muted-foreground">{cat.name}</span>
                )}
                {e.currency !== prefs.primary_currency && (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="-ml-2 h-10 w-fit px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
                    onClick={(ev) => { ev.stopPropagation(); setExpandedFx(expandedFx === e.id ? null : e.id) }}
                    aria-label={expandedFx === e.id ? `Hide currency conversion for ${formatMinor(e.amount, e.currency)}` : `Show currency conversion for ${formatMinor(e.amount, e.currency)}`}
                  >
                    {expandedFx === e.id ? (() => {
                      const conv = convertViaRates(e.amount, e.currency, prefs.primary_currency, e.occurred_at, rates, prefs.fx_overrides ?? {})
                      return conv
                        ? `≈ ${currencySymbol(prefs.primary_currency)}${(conv.amount / (prefs.primary_currency === 'JPY' ? 1 : 100)).toFixed(2)} at ${conv.rateDate}`
                        : 'No FX rate yet for this date'
                    })() : '≈ convert'}
                  </Button>
                )}
              </div>

              <span className={`whitespace-nowrap text-base font-semibold tabular-nums ${e.direction === 'out' ? '' : 'text-income'}`}>
                {formatAmount(e)}
              </span>
            </li>
          )
        })
      )}
    </ul>
  )
}

function formatAmount(e: MoneyEntryRow): string {
  const major = formatMajor(e.amount, e.currency)
  return `${e.direction === 'out' ? '-' : '+'}${currencySymbol(e.currency)}${major}`
}

function Sparkline({ points, width = 80, height = 48, label }: { points: number[], width?: number, height?: number, label?: string }) {
  if (points.length < 2) return null

  const max = Math.max(...points, 1)
  const min = 0
  const range = max - min

  const padding = 4
  const chartWidth = width - 2 * padding
  const chartHeight = height - 2 * padding

  const xs = points.map((_, i) => padding + (i / (points.length - 1)) * chartWidth)
  const ys = points.map(p => padding + chartHeight - (((p - min) / range) * chartHeight))

  const pathPoints = xs.map((x, i) => `${x},${ys[i]}`).join(' ')
  const areaPath = `M${padding},${height - padding} ${pathPoints} L${width - padding},${height - padding}`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-16 w-full text-foreground" role="img" aria-label={label || 'Spending sparkline'}>
      <path d={areaPath} fill="currentColor" fillOpacity="0.08" />
      <polyline points={pathPoints} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
