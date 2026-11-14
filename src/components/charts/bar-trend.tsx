'use client'

import { useId, useMemo, useState } from 'react'
import { SEQUENTIAL_HUE } from '@/lib/chart-palette'
import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChartEmpty, ChartSection, ChartTakeaway, compactFigure, fullMoney, tickClass } from '@/components/charts/chart-kit'

interface BarTrendProps {
  data: { label: string; amount: number }[]
  symbol: string
  jpy: boolean
  label: string
}

/** Single-series magnitude over time: ink bars with the figure above each, latest period emphasised in its labels, no legend (the title names it). */
export function BarTrend({ data, symbol, jpy, label }: BarTrendProps) {
  const id = useId()
  const [showTable, setShowTable] = useState(false)
  const max = useMemo(() => Math.max(0, ...data.map(d => d.amount)), [data])
  const money = (m: number) => fullMoney(m, symbol, jpy)
  const n = data.length

  if (n <= 1) {
    return <ChartEmpty id={id} title={label}>Not enough history yet. This fills in after a couple of periods.</ChartEmpty>
  }

  const highest = data.find(d => d.amount === max)
  const latest = data[n - 1]
  const takeaway = max <= 0 || !highest
    ? 'No spending in this range yet.'
    : highest === latest
      ? `${latest.label} is the highest so far at ${money(latest.amount)}.`
      : `${highest.label} was the highest at ${money(highest.amount)}. ${latest.label} is at ${money(latest.amount)} so far.`

  return (
    <ChartSection id={id} title={label} showTable={showTable} onToggle={() => setShowTable(s => !s)}>
      {showTable ? (
        <Table>
          <TableHeader><TableRow><TableHead>Period</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.map(d => (
              <TableRow key={d.label}><TableCell>{d.label}</TableCell><TableCell className="text-right tabular-nums">{money(d.amount)}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <>
          <figure role="img" aria-label={`${label}: ${data.map(d => `${d.label} ${money(d.amount)}`).join(', ')}`} className="flex flex-col gap-1.5 pt-4">
            {/* The top 20px is room for the figure above the tallest bar. */}
            <div className={cn('flex h-36 items-end border-b border-border pt-5 lg:h-44', n <= 7 ? 'gap-3' : 'gap-1')}>
              {data.map((d, i) => {
                const pct = d.amount > 0 && max > 0 ? Math.max(2, (d.amount / max) * 100) : 0
                return (
                  <div key={d.label} title={`${d.label}: ${money(d.amount)}`} className="group relative flex h-full flex-1 items-end justify-center">
                    {d.amount > 0 && (
                      <span
                        aria-hidden
                        className={cn(
                          'pointer-events-none absolute left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-xs',
                          i === n - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground',
                          tickClass(i, n),
                        )}
                        style={{ bottom: `${pct}%` }}
                      >
                        {compactFigure(d.amount, jpy)}
                      </span>
                    )}
                    <div
                      className="w-full max-w-8 rounded-t-[4px] transition-opacity group-hover:opacity-70 lg:max-w-9"
                      style={{ height: `${pct}%`, backgroundColor: SEQUENTIAL_HUE }}
                    />
                  </div>
                )
              })}
            </div>
            <div className={cn('flex', n <= 7 ? 'gap-3' : 'gap-1')} aria-hidden>
              {data.map((d, i) => (
                <span key={d.label} className={cn('flex-1 truncate text-center text-xs text-muted-foreground', tickClass(i, n), i === n - 1 && 'font-semibold text-foreground')}>
                  {d.label}
                </span>
              ))}
            </div>
          </figure>
          <ChartTakeaway>{takeaway}</ChartTakeaway>
        </>
      )}
    </ChartSection>
  )
}
