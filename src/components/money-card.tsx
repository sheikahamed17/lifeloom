'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useExpenseShares } from '@/hooks/use-expense-shares'
import { withYourShare } from '@/lib/shares'
import { useAllCategories } from '@/hooks/use-all-categories'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useFxRates } from '@/hooks/use-fx-rates'
import { convertViaRates } from '@/lib/fx'
import { weeklySpendBars } from '@/lib/weekly-spend'
import { currencySymbol } from '@/lib/currency'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { computeSpendBreakdown } from '@/lib/spend-breakdown'
import { makeCategoryResolver } from '@/lib/category-resolve'

type Props = { userId: string; onSelectCategory?: (name: string) => void }

type PeriodKind = 'week' | 'month'

export function MoneyCard({ userId, onSelectCategory }: Props) {
  const [period, setPeriod] = useState<PeriodKind>('month')
  const range = useMemo(() => currentPeriodRange(period), [period])
  const prevRange = useMemo(() => previousPeriodRange(period, range), [period, range])

  // Spend view: a shared entry counts only YOUR share (amount − what others owe you).
  const shares = useExpenseShares(userId)
  const currentRaw = useMoneyEntries(userId, range)
  const previousRaw = useMoneyEntries(userId, prevRange)
  const current = useMemo(() => withYourShare(currentRaw, shares), [currentRaw, shares])
  const previous = useMemo(() => withYourShare(previousRaw, shares), [previousRaw, shares])
  const eightWeeks = useMemo(() => {
    const to = new Date()
    const from = new Date(to.getTime() - 8 * 7 * 24 * 60 * 60 * 1000)
    return { from: from.toISOString(), to: to.toISOString() }
  }, [])
  const trendRaw = useMoneyEntries(userId, eightWeeks)
  const trend = useMemo(() => withYourShare(trendRaw, shares), [trendRaw, shares])
  const allCats = useAllCategories(userId)
  const { prefs } = useUserPrefs()
  const { rates } = useFxRates([...SUPPORTED_CURRENCIES])

  const resolve = useMemo(
    () =>
      makeCategoryResolver(
        allCats.map(c => ({ id: c.id, name: c.name, icon: c.icon, kind: c.kind })),
      ),
    [allCats],
  )

  const toPrimary = useMemo(
    () => (e: typeof current[0]) =>
      e.currency === prefs.primary_currency
        ? e.amount
        : convertViaRates(e.amount, e.currency, prefs.primary_currency, e.occurred_at, rates, prefs.fx_overrides ?? {})?.amount ?? 0,
    [prefs.primary_currency, rates, prefs.fx_overrides],
  )

  const bd = useMemo(() => computeSpendBreakdown(current, { resolve, toPrimary }), [current, resolve, toPrimary])
  const bdPrev = useMemo(() => computeSpendBreakdown(previous, { resolve, toPrimary }), [previous, resolve, toPrimary])

  // Compute FX info from breakdown
  let conversionApplied = false
  let conversionDate: string | null = null
  const skippedCurrencies = new Set<string>()
  for (const e of current) {
    if (e.direction !== 'out') continue
    if (e.currency !== prefs.primary_currency) {
      const conv = convertViaRates(e.amount, e.currency, prefs.primary_currency, e.occurred_at, rates, prefs.fx_overrides ?? {})
      if (conv) {
        conversionApplied = true
        if (!conversionDate || conv.rateDate < conversionDate) conversionDate = conv.rateDate
      } else {
        skippedCurrencies.add(e.currency)
      }
    }
  }

  const delta = bdPrev.spend === 0 ? null : ((bd.spend - bdPrev.spend) / bdPrev.spend) * 100

  const [expanded, setExpanded] = useState(false)
  const displayRows = expanded ? bd.rows : bd.rows.slice(0, 6)
  const hiddenCount = Math.max(0, bd.rows.length - 6)

  const weeklyBars = useMemo(
    () => weeklySpendBars(trend, prefs.primary_currency, rates, prefs.fx_overrides ?? {}, new Date().toISOString()),
    [trend, prefs.primary_currency, rates, prefs.fx_overrides],
  )

  const fmt = (amt: number) => (amt / (prefs.primary_currency === 'JPY' ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })
  const symbol = currencySymbol(prefs.primary_currency)

  return (
    <section className="glass flex flex-col gap-4 rounded-2xl p-4" aria-labelledby="spent-heading">
      <header className="flex items-center justify-between gap-2">
        <h2 id="spent-heading" className="text-sm font-semibold">Spent this {period}</h2>
        <div className="glass-soft flex rounded-lg p-0.5" role="group" aria-label="Period">
          {(['week', 'month'] as const).map(p => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              className={`min-h-9 rounded-md px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-2 ${
                period === p ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </header>

      {/* The figure carries its own name; no neon glow (glow is for the primary action only). */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-4xl font-semibold tabular-nums leading-tight">{symbol}{fmt(bd.spend)}</span>
        {delta !== null && (
          <span className={`inline-flex items-center gap-0.5 text-sm ${delta > 0 ? 'text-destructive' : 'text-income'}`}>
            {delta > 0 ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />}
            {Math.abs(delta).toFixed(0)}%<span className="text-muted-foreground"> {delta > 0 ? 'more' : 'less'} than last {period}</span>
          </span>
        )}
      </div>

      <WeeklyBars values={weeklyBars} symbol={symbol} jpy={prefs.primary_currency === 'JPY'} />

      <ul className="flex flex-col gap-1">
        {displayRows.length === 0 && <li className="text-xs text-muted-foreground">No entries yet this {period}.</li>}
        {displayRows.map(row => (
          <li key={row.name} className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => onSelectCategory?.(row.name)}
              title={`${row.count} ${row.count === 1 ? 'entry' : 'entries'}. Show them in the list`}
              aria-label={`${row.name}: ${symbol}${fmt(row.amount)}, ${row.pct.toFixed(0)}% of spending, ${row.count} ${row.count === 1 ? 'entry' : 'entries'}. Show them in the list`}
              className="-mx-2 flex min-h-11 flex-1 items-center gap-2 rounded-lg px-2 text-left outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-accent-2"
            >
              <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">{row.icon && <span aria-hidden="true">{row.icon}</span>}{row.name}</span>
              <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="absolute inset-y-0 left-0 bg-foreground/70" style={{ width: `${(row.amount / Math.max(1, ...bd.rows.map(r => r.amount))) * 100}%` }} />
              </div>
              <span className="font-mono tabular-nums flex-shrink-0">{symbol}{fmt(row.amount)}</span>
              <span className="w-10 shrink-0 text-right text-muted-foreground tabular-nums">{row.pct.toFixed(0)}%</span>
            </button>
          </li>
        ))}
        {hiddenCount > 0 && !expanded && (
          <li className="flex items-center pt-1">
            <button
              onClick={() => setExpanded(true)}
              className="-mx-2 min-h-11 flex-1 rounded-lg px-2 text-left text-sm text-accent-2 outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-accent-2"
            >
              Show all {bd.rows.length} categories
            </button>
          </li>
        )}
      </ul>

      {bd.income > 0 && (
        <div className="flex gap-4 border-t border-white/10 pt-3 text-sm">
          <span>
            Earned <span className="font-mono font-medium tabular-nums">{symbol}{fmt(bd.income)}</span>
          </span>
          <span className={bd.net >= 0 ? 'text-income' : 'text-destructive'}>
            {bd.net >= 0 ? 'Saved' : 'Overspent'} <span className="font-mono font-medium tabular-nums">{symbol}{fmt(Math.abs(bd.net))}</span>
          </span>
        </div>
      )}

      {(conversionApplied || skippedCurrencies.size > 0) && (
        <p className="border-t border-white/10 pt-2 text-xs text-muted-foreground">
          {conversionApplied && conversionDate && <>Includes conversion via ECB {conversionDate}. </>}
          {skippedCurrencies.size > 0 && <>Excluded {[...skippedCurrencies].join(', ')} (no FX rate yet).</>}
        </p>
      )}
    </section>
  )
}

// Single-series magnitude-over-time bars (last N weekly spend totals). Current
// week emphasized in accent, prior weeks recessive; per-bar native title is the
// hover layer + accessibility. Single series → no legend (the caption names it).
function WeeklyBars({ values, symbol, jpy }: { values: number[]; symbol: string; jpy: boolean }) {
  const max = Math.max(1, ...values)
  const fmt = (v: number) => `${symbol}${(v / (jpy ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  const last = values.length - 1
  return (
    <div className="flex flex-col gap-1">
      <div
        className="flex h-12 items-end gap-1"
        role="img"
        aria-label={`Weekly spend, last ${values.length} weeks; most recent ${fmt(values[last] ?? 0)}`}
      >
        {values.map((v, i) => {
          const weeksAgo = last - i
          const pct = v > 0 ? Math.max(6, (v / max) * 100) : 3
          return (
            <div
              key={i}
              title={`${weeksAgo === 0 ? 'This week' : `${weeksAgo} wk ago`}: ${fmt(v)}`}
              className={`flex-1 rounded-t ${i === last ? 'bg-accent-2' : 'bg-white/20'}`}
              style={{ height: `${pct}%` }}
            />
          )
        })}
      </div>
      <span className="text-xs text-muted-foreground">Last {values.length} weeks</span>
    </div>
  )
}

export function currentPeriodRange(period: PeriodKind): { from: string; to: string } {
  const now = new Date()
  if (period === 'month') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
    const to   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
    return { from, to }
  }
  // week: Mon → next Mon, UTC
  const day = now.getUTCDay() || 7   // 1..7, Sun=7
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (day - 1)))
  const nextMonday = new Date(monday); nextMonday.setUTCDate(nextMonday.getUTCDate() + 7)
  return { from: monday.toISOString(), to: nextMonday.toISOString() }
}

function previousPeriodRange(period: PeriodKind, current: { from: string; to: string }): { from: string; to: string } {
  const fromCur = new Date(current.from)
  if (period === 'month') {
    const from = new Date(Date.UTC(fromCur.getUTCFullYear(), fromCur.getUTCMonth() - 1, 1)).toISOString()
    return { from, to: current.from }
  }
  const toCur = new Date(current.to)
  toCur.setUTCDate(toCur.getUTCDate() - 7)
  const fromPrev = new Date(fromCur); fromPrev.setUTCDate(fromPrev.getUTCDate() - 7)
  return { from: fromPrev.toISOString(), to: current.from }
}
