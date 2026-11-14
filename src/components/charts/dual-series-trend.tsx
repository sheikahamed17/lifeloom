'use client'

import { useId, useMemo, useState } from 'react'
import { SPEND_COLOR, INCOME_COLOR } from '@/lib/chart-palette'
import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChartEmpty, ChartSection, ChartTakeaway, fullMoney, tickClass } from '@/components/charts/chart-kit'

interface DualSeriesTrendProps {
  spend: { label: string; amount: number }[]
  income: { label: string; amount: number }[]
  symbol: string
  jpy: boolean
}

/**
 * Income and spend per period on ONE shared axis (never two y-scales): spend in
 * ink, income in blue. Net per period is in the hover title and the table, and
 * the sentence under the chart sums it up.
 */
export function DualSeriesTrend({ spend, income, symbol, jpy }: DualSeriesTrendProps) {
  const id = useId()
  const [showTable, setShowTable] = useState(false)
  const money = (m: number) => fullMoney(m, symbol, jpy)

  const periods = useMemo(() => {
    const spendMap = new Map(spend.map(s => [s.label, s.amount]))
    const incomeMap = new Map(income.map(i => [i.label, i.amount]))
    const labels = Array.from(new Set([...spendMap.keys(), ...incomeMap.keys()]))
    return labels.map(label => ({ label, spend: spendMap.get(label) ?? 0, income: incomeMap.get(label) ?? 0 }))
  }, [spend, income])
  const max = useMemo(() => Math.max(0, ...periods.map(p => Math.max(p.spend, p.income))), [periods])
  const n = periods.length
  const pct = (v: number) => (v > 0 && max > 0 ? `${Math.max(2, (v / max) * 100)}%` : 0)

  if (n === 0) {
    return <ChartEmpty id={id} title="Income and spend">No entries in this range yet.</ChartEmpty>
  }

  // One sentence on what was kept: the range of net across the periods that have entries.
  const nets = periods.filter(p => p.spend || p.income).map(p => p.income - p.spend)
  const over = nets.filter(v => v < 0).length
  const lo = Math.min(...nets)
  const hi = Math.max(...nets)
  const takeaway = nets.length === 0
    ? 'No income or spend in this range yet.'
    : over > 0
      ? `Spend was higher than income in ${over} of ${nets.length} ${nets.length === 1 ? 'period' : 'periods'} with entries.`
      : nets.length === 1 || lo === hi
        ? `You kept ${money(lo)} of your income${nets.length === 1 ? '' : ' in each period'}.`
        : `You kept between ${money(lo)} and ${money(hi)} of your income in each period.`

  const gap = n <= 7 ? 'gap-3' : 'gap-1'

  return (
    <ChartSection id={id} title="Income and spend" showTable={showTable} onToggle={() => setShowTable(s => !s)}>
      <div className="flex items-center gap-4 pt-3 text-[13px] text-muted-foreground"><Legend /></div>
      {showTable ? (
        <Table>
          <TableHeader><TableRow><TableHead>Period</TableHead><TableHead className="text-right">Spend</TableHead><TableHead className="text-right">Income</TableHead><TableHead className="text-right">Net</TableHead></TableRow></TableHeader>
          <TableBody>
            {periods.map(p => (
              <TableRow key={p.label}>
                <TableCell>{p.label}</TableCell>
                <TableCell className="text-right tabular-nums">{money(p.spend)}</TableCell>
                <TableCell className="text-right tabular-nums">{money(p.income)}</TableCell>
                <TableCell className="text-right tabular-nums">{p.spend || p.income ? `${p.income - p.spend >= 0 ? '+' : ''}${money(p.income - p.spend)}` : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <>
          <figure
            role="img"
            aria-label={`Income and spend: ${periods.map(p => `${p.label} spend ${money(p.spend)}, income ${money(p.income)}`).join('; ')}`}
            className="flex flex-col gap-1.5 pt-3"
          >
            <div className={cn('flex h-[120px] items-end border-b border-border lg:h-36', gap)}>
              {periods.map(p => (
                <div
                  key={p.label}
                  title={`${p.label}: spend ${money(p.spend)}, income ${money(p.income)}, net ${money(p.income - p.spend)}`}
                  className="group flex h-full flex-1 items-end justify-center gap-0.5"
                >
                  <div className="w-1/2 max-w-[18px] rounded-t-[4px] transition-opacity group-hover:opacity-70" style={{ height: pct(p.spend), backgroundColor: SPEND_COLOR }} />
                  <div className="w-1/2 max-w-[18px] rounded-t-[4px] transition-opacity group-hover:opacity-70" style={{ height: pct(p.income), backgroundColor: INCOME_COLOR }} />
                </div>
              ))}
            </div>
            <div className={cn('flex', gap)} aria-hidden>
              {periods.map((p, i) => (
                <span key={p.label} className={cn('flex-1 truncate text-center text-xs text-muted-foreground', tickClass(i, n), i === n - 1 && 'font-semibold text-foreground')}>{p.label}</span>
              ))}
            </div>
          </figure>
          <ChartTakeaway>{takeaway}</ChartTakeaway>
        </>
      )}
    </ChartSection>
  )
}

function Legend() {
  return (
    <>
      <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ backgroundColor: SPEND_COLOR }} />Spend</span>
      <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ backgroundColor: INCOME_COLOR }} />Income</span>
    </>
  )
}
