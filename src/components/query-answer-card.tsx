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
import { currencySymbol } from '@/lib/currency'
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
    const directionText = plan.direction === 'out' ? '💸 Spent' : '💰 Earned'
    const categoryText = plan.category_name ? ` in ${plan.category_name}` : ''
    const periodText = plan.period.label
    const modeText = plan.mode !== 'total' ? ` (${plan.mode})` : ''
    return `${directionText}${categoryText}${modeText} · ${periodText}`
  }, [plan])

  const divisor = prefs.primary_currency === 'JPY' ? 1 : 100

  if (plan.mode === 'total') {
    const { amount, count, multiCurrency } = modeData.total
    const major = (amount / divisor).toLocaleString(undefined, { maximumFractionDigits: prefs.primary_currency === 'JPY' ? 0 : 2 })

    return (
      <div className="glass rounded-2xl p-5">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-semibold uppercase tracking-wide text-accent-2">{headerText}</span>
        </div>

        <div className="mb-2 text-4xl font-semibold font-mono tabular-nums text-accent-2">
          {currencySymbol(prefs.primary_currency)}{major}
        </div>

        <p className="mb-3 text-xs text-muted-foreground">
          Based on {count} {count === 1 ? 'entry' : 'entries'}
        </p>

        {plan.category_name && !targetCategoryId && (
          <p className="mb-3 text-[10px] text-destructive">
            Category &quot;{plan.category_name}&quot; not found — showing all categories instead.
          </p>
        )}

        {multiCurrency && rates.length > 0 && (
          <p className="mb-3 text-[10px] text-muted-foreground">
            *Converted from multiple currencies via ECB {rates[0]?.date}
          </p>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onDismiss} aria-label="Dismiss money answer">Dismiss</Button>
          <Button className="flex-[2]" onClick={() => setShowEntries(!showEntries)} aria-label={showEntries ? 'Hide entries for money answer' : 'Show entries for money answer'}>
            {showEntries ? 'Hide entries' : 'Show entries'}
          </Button>
        </div>

        {showEntries && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <FilteredMoneyList entries={filteredEntries} categories={categories} prefs={prefs} rates={rates} />
          </div>
        )}
      </div>
    )
  }

  if (plan.mode === 'breakdown') {
    const { breakdown } = modeData
    const max = Math.max(1, ...breakdown.map(b => b.amount))

    return (
      <div className="glass rounded-2xl p-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent-2">{headerText}</div>

        {breakdown.length === 0 ? (
          <p className="mb-3 text-xs text-muted-foreground">No entries found.</p>
        ) : (
          <ul className="mb-3 flex flex-col gap-2">
            {breakdown.map((item, idx) => {
              const amount = (item.amount / divisor).toLocaleString(undefined, { maximumFractionDigits: prefs.primary_currency === 'JPY' ? 0 : 2 })
              const barWidth = (item.amount / max) * 100
              return (
                <li key={idx} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{item.categoryName ?? 'Uncategorized'}</span>
                    <span className="font-mono tabular-nums">{currencySymbol(prefs.primary_currency)}{amount}</span>
                  </div>
                  <div className="relative h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${item.categoryName ?? 'Uncategorized'}: ${currencySymbol(prefs.primary_currency)}${amount}`} aria-valuenow={barWidth} aria-valuemin={0} aria-valuemax={100}>
                    <div
                      className="absolute inset-y-0 left-0 bg-accent-2"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onDismiss} aria-label="Dismiss breakdown answer">Dismiss</Button>
          <Button className="flex-[2]" onClick={() => setShowEntries(!showEntries)} aria-label={showEntries ? 'Hide entries for breakdown answer' : 'Show entries for breakdown answer'}>
            {showEntries ? 'Hide entries' : 'Show entries'}
          </Button>
        </div>

        {showEntries && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <FilteredMoneyList entries={filteredEntries} categories={categories} prefs={prefs} rates={rates} />
          </div>
        )}
      </div>
    )
  }

  if (plan.mode === 'delta') {
    const { current, previous, deltaPct } = modeData.delta
    const currentMajor = (current / divisor).toLocaleString(undefined, { maximumFractionDigits: prefs.primary_currency === 'JPY' ? 0 : 2 })
    const previousMajor = (previous / divisor).toLocaleString(undefined, { maximumFractionDigits: prefs.primary_currency === 'JPY' ? 0 : 2 })

    return (
      <div className="glass rounded-2xl p-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-accent-2">{headerText}</div>

        <div className="mb-4 flex items-baseline justify-between gap-2">
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Current period</p>
            <div className="text-3xl font-semibold font-mono tabular-nums text-accent-2">
              {currencySymbol(prefs.primary_currency)}{currentMajor}
            </div>
          </div>
          {deltaPct !== null && (
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground mb-1">Change</p>
              <div className={`text-2xl font-semibold font-mono tabular-nums ${deltaPct > 0 ? 'text-destructive' : 'text-emerald-500'}`}>
                {deltaPct > 0 ? '↑' : '↓'}{Math.abs(deltaPct).toFixed(1)}%
              </div>
            </div>
          )}
        </div>

        <p className="mb-3 text-[10px] text-muted-foreground">
          vs previous period: {currencySymbol(prefs.primary_currency)}{previousMajor}
        </p>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onDismiss} aria-label="Dismiss delta answer">Dismiss</Button>
          <Button className="flex-[2]" onClick={() => setShowEntries(!showEntries)} aria-label={showEntries ? 'Hide entries for delta answer' : 'Show entries for delta answer'}>
            {showEntries ? 'Hide entries' : 'Show entries'}
          </Button>
        </div>

        {showEntries && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <FilteredMoneyList entries={filteredEntries} categories={categories} prefs={prefs} rates={rates} />
          </div>
        )}
      </div>
    )
  }

  if (plan.mode === 'series') {
    const { series } = modeData

    return (
      <div className="glass rounded-2xl p-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-accent-2">{headerText}</div>

        {series.length > 0 && (
          <div className="mb-4">
            <Sparkline points={series.map(d => d.amount)} width={100} height={48} label={`Spending trend over ${series.length} periods`} />
          </div>
        )}

        <p className="mb-3 text-[10px] text-muted-foreground">
          {series.filter(d => d.amount > 0).length} buckets with activity
        </p>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onDismiss} aria-label="Dismiss series answer">Dismiss</Button>
          <Button className="flex-[2]" onClick={() => setShowEntries(!showEntries)} aria-label={showEntries ? 'Hide entries for series answer' : 'Show entries for series answer'}>
            {showEntries ? 'Hide entries' : 'Show entries'}
          </Button>
        </div>

        {showEntries && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <FilteredMoneyList entries={filteredEntries} categories={categories} prefs={prefs} rates={rates} />
          </div>
        )}
      </div>
    )
  }

  return null
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
    <ul className="flex flex-col gap-2">
      {entries.length === 0 ? (
        <li className="p-4 text-sm text-muted-foreground">No entries in this query.</li>
      ) : (
        entries.map(e => {
          const cat = e.category_id ? categoryById.get(e.category_id) : undefined
          return (
            <li
              key={e.id}
              className="glass-soft relative flex items-start justify-between gap-3 rounded-2xl p-3 text-sm"
            >
              <div className="flex flex-col flex-1 min-w-0">
                {cat && (
                  <div className="mb-1.5 inline-flex w-fit items-center gap-1 rounded-xl bg-white/8 px-2 py-1 text-xs">
                    <span>{cat.icon ?? ''}</span>
                    <span className="text-muted-foreground">{cat.name}</span>
                  </div>
                )}
                <div className="text-sm font-medium text-foreground">
                  {e.description ? e.description : (cat ? cat.name : 'Uncategorized')}
                </div>
                {e.description && cat && (
                  <span className="text-xs text-muted-foreground">{cat.name}</span>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {e.currency !== prefs.primary_currency && (
                    <button
                      type="button"
                      className="text-[10px] text-muted-foreground hover:text-accent-2 transition text-left focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
                      onClick={(ev) => { ev.stopPropagation(); setExpandedFx(expandedFx === e.id ? null : e.id) }}
                      aria-label={expandedFx === e.id ? `Hide currency conversion for ${currencySymbol(e.currency)}${(e.amount / 100).toFixed(2)}` : `Show currency conversion for ${currencySymbol(e.currency)}${(e.amount / 100).toFixed(2)}`}
                    >
                      {expandedFx === e.id ? (() => {
                        const conv = convertViaRates(e.amount, e.currency, prefs.primary_currency, e.occurred_at, rates, prefs.fx_overrides ?? {})
                        return conv
                          ? `≈ ${currencySymbol(prefs.primary_currency)}${(conv.amount / (prefs.primary_currency === 'JPY' ? 1 : 100)).toFixed(2)} at ${conv.rateDate}`
                          : 'No FX rate yet for this date'
                      })() : '≈ convert'}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <span className={`font-mono tabular-nums text-sm font-medium whitespace-nowrap ${
                  e.direction === 'out' ? 'text-destructive' : 'text-income'
                }`}>
                  {formatAmount(e)}
                </span>
              </div>
            </li>
          )
        })
      )}
    </ul>
  )
}

function formatAmount(e: MoneyEntryRow): string {
  const major = (e.amount / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
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
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={label || 'Spending sparkline'}>
      <defs>
        <linearGradient id="sparkGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style={{ stopColor: 'rgb(52 230 255)', stopOpacity: 0.3 }} />
          <stop offset="100%" style={{ stopColor: 'rgb(52 230 255)', stopOpacity: 0.05 }} />
        </linearGradient>
      </defs>
      <polyline points={pathPoints} fill="none" stroke="rgb(52 230 255)" strokeWidth="1.5" />
      <path d={areaPath} fill="url(#sparkGradient)" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="2.5" fill="rgb(52 230 255)" />
    </svg>
  )
}
