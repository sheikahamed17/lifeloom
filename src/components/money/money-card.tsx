'use client'

import { useId, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Bar, EMPTY_NOTE, FOOT_LINK, SectionHeading } from '@/components/money/section-heading'
import { QUIET_TOGGLE } from '@/components/shared/quiet-toggle'
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

/** "Where it went": this week's or month's spend by category, as ruled rows with a share bar. */
export function MoneyCard({ userId, onSelectCategory }: Props) {
  const headingId = useId()
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
  const firstRows = bd.rows.slice(0, 6)
  const extraRows = bd.rows.slice(6)

  const weeklyBars = useMemo(
    () => weeklySpendBars(trend, prefs.primary_currency, rates, prefs.fx_overrides ?? {}, new Date().toISOString()),
    [trend, prefs.primary_currency, rates, prefs.fx_overrides],
  )

  const fmt = (amt: number) => (amt / (prefs.primary_currency === 'JPY' ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })
  const symbol = currencySymbol(prefs.primary_currency)

  const maxAmount = Math.max(1, ...bd.rows.map(r => r.amount))
  const renderRow = (row: typeof bd.rows[number]) => (
    <li key={row.name} className="border-b border-border">
      <Button
        variant="ghost"
        onClick={() => onSelectCategory?.(row.name)}
        title={`${row.count} ${row.count === 1 ? 'entry' : 'entries'}. Show them in the list`}
        aria-label={`${row.name}: ${symbol}${fmt(row.amount)}, ${row.pct.toFixed(0)}% of spending, ${row.count} ${row.count === 1 ? 'entry' : 'entries'}. Show them in the list`}
        className="-mx-2 h-11 w-[calc(100%+1rem)] justify-start gap-3 rounded-lg px-2 text-left text-sm font-normal"
      >
        <span className="w-21 shrink-0 truncate font-medium lg:w-24">{row.name}</span>
        <Bar pct={(row.amount / maxAmount) * 100} className="flex-1" />
        <span className="min-w-16 shrink-0 text-right font-semibold tabular-nums">{symbol}{fmt(row.amount)}</span>
      </Button>
    </li>
  )

  // The takeaway is computed from the same rows the list shows; nothing is said without data.
  const [top, second] = bd.rows
  const takeaway = top
    ? `${top.name} is ${top.pct.toFixed(0)}% of this ${period} so far.${second ? ` ${second.name} is next at ${second.pct.toFixed(0)}%.` : ''}`
    : null

  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      <SectionHeading
        id={headingId}
        className="items-center pb-0"
        aside={
          <ToggleGroup
            aria-label="Period"
            spacing={4}
            value={[period]}
            onValueChange={v => { const next = v[0] as PeriodKind | undefined; if (next) setPeriod(next) }}
            className="-mb-px rounded-none"
          >
            {(['week', 'month'] as const).map(p => (
              <ToggleGroupItem key={p} value={p} className={QUIET_TOGGLE}>
                {p === 'week' ? 'Week' : 'Month'}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      >
        Where it went
      </SectionHeading>

      <Collapsible open={expanded} onOpenChange={setExpanded} className="flex flex-col">
        {bd.rows.length === 0 && <p className={EMPTY_NOTE}>No entries yet this {period}.</p>}
        <ul className="flex flex-col">{firstRows.map(renderRow)}</ul>
        <CollapsibleContent>
          <ul className="flex flex-col">{extraRows.map(renderRow)}</ul>
        </CollapsibleContent>
        {extraRows.length > 0 && (
          <CollapsibleTrigger className={FOOT_LINK}>
            {expanded ? 'Show fewer' : `Show all ${bd.rows.length} categories`}
          </CollapsibleTrigger>
        )}
      </Collapsible>

      {(takeaway || delta !== null || period === 'week') && bd.rows.length > 0 && (
        <p className="pt-3 text-[13px] text-muted-foreground">
          {period === 'week' && <><span className="tabular-nums">{symbol}{fmt(bd.spend)}</span> spent this week. </>}
          {takeaway}
          {delta !== null && <> {Math.abs(delta).toFixed(0)}% {delta > 0 ? 'more' : 'less'} than last {period}.</>}
        </p>
      )}

      {period === 'week' && bd.income > 0 && (
        <p className="pt-1 text-[13px] text-muted-foreground">
          Earned <span className="tabular-nums">{symbol}{fmt(bd.income)}</span>. {bd.net >= 0 ? 'Saved' : 'Overspent'}{' '}
          <span className="tabular-nums">{symbol}{fmt(Math.abs(bd.net))}</span>.
        </p>
      )}

      <WeeklyBars values={weeklyBars} symbol={symbol} jpy={prefs.primary_currency === 'JPY'} />

      {(conversionApplied || skippedCurrencies.size > 0) && (
        <p className="pt-3 text-xs text-muted-foreground">
          {conversionApplied && conversionDate && <>Includes conversion via ECB {conversionDate}. </>}
          {skippedCurrencies.size > 0 && <>Excluded {[...skippedCurrencies].join(', ')} (no FX rate yet).</>}
        </p>
      )}
    </section>
  )
}

// Single-series magnitude-over-time bars (last N weekly spend totals). Current
// week in ink, prior weeks recessive; per-bar native title is the hover layer +
// accessibility. Single series → no legend (the caption names it).
function WeeklyBars({ values, symbol, jpy }: { values: number[]; symbol: string; jpy: boolean }) {
  const max = Math.max(1, ...values)
  const fmt = (v: number) => `${symbol}${(v / (jpy ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  const last = values.length - 1
  return (
    <div className="flex flex-col gap-1.5 pt-5">
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
              className={`flex-1 rounded-t ${i === last ? 'bg-foreground' : 'bg-border'}`}
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
