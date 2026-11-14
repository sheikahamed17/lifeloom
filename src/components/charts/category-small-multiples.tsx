'use client'

import { useId, useMemo, useState } from 'react'
import type { CategorySeries, Period } from '@/lib/analytics'
import { SEQUENTIAL_HUE } from '@/lib/chart-palette'
import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChartEmpty, ChartSection, ChartTakeaway, fullMoney } from '@/components/charts/chart-kit'

// Every panel is labelled with its category, so the bars need no hue of their
// own: all panels draw in ink ("Other" too). CATEGORICAL stays reserved for a
// chart where several categories share one plot; there, color follows the
// ENTITY (hash its name), never its rank.

interface CategorySmallMultiplesProps {
  series: CategorySeries[]
  periods: Period[]
  symbol: string
  jpy: boolean
  className?: string
}

/**
 * One small chart per top category on a SHARED y-scale. Each panel labels only
 * its first and last period (the six month names used to collide, "JunJulAug…").
 */
export function CategorySmallMultiples({ series, periods, symbol, jpy, className }: CategorySmallMultiplesProps) {
  const id = useId()
  const [showTable, setShowTable] = useState(false)
  const money = (m: number) => fullMoney(m, symbol, jpy)
  const max = useMemo(() => Math.max(0, ...series.flatMap(s => s.points)), [series])

  if (series.length === 0) {
    return <ChartEmpty id={id} title="Spending by category" className={className}>No categorised spending in this range yet.</ChartEmpty>
  }

  const first = periods[0]?.label
  const last = periods[periods.length - 1]?.label

  const sum = (s: CategorySeries) => s.points.reduce((t, v) => t + v, 0)
  const lead = series.reduce((a, b) => (sum(b) > sum(a) ? b : a))
  const takeaway = `${series.length === 1 ? 'The chart uses' : `All ${series.length} charts share`} one scale. The figure beside each name is ${last} so far. ${lead.name} is the largest over the range shown.`

  return (
    <ChartSection id={id} title="Spending by category" showTable={showTable} onToggle={() => setShowTable(s => !s)} className={className}>
      {showTable ? (
        <Table>
          <TableHeader><TableRow><TableHead>Category</TableHead>{periods.map(p => <TableHead key={p.label} className="text-right">{p.label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {series.map(s => (
              <TableRow key={s.name}>
                <TableCell>{s.name}</TableCell>
                {s.points.map((v, i) => <TableCell key={i} className="text-right tabular-nums">{money(v)}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-x-5 gap-y-6 pt-4 sm:grid-cols-3 lg:gap-x-10 lg:gap-y-7 lg:pt-5">
            {series.map(s => {
              const current = s.points[s.points.length - 1] ?? 0
              return (
                <li key={s.name} className="flex min-w-0 flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="truncate text-[15px] font-semibold">{s.name}</h3>
                    <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">{money(current)}</span>
                  </div>
                  <figure
                    role="img"
                    aria-label={`${s.name}: ${s.points.map((v, i) => `${periods[i]?.label} ${money(v)}`).join(', ')}`}
                    className={cn('flex h-12 items-end border-b border-border lg:h-16', s.points.length <= 7 ? 'gap-1' : 'gap-0.5')}
                  >
                    {s.points.map((v, i) => (
                      <div key={i} title={`${s.name}, ${periods[i]?.label}: ${money(v)}`} className="group flex h-full flex-1 items-end">
                        <div
                          className="w-full rounded-t-[3px] transition-opacity group-hover:opacity-70"
                          style={{ height: v > 0 && max > 0 ? `${Math.max(3, (v / max) * 100)}%` : 0, backgroundColor: SEQUENTIAL_HUE }}
                        />
                      </div>
                    ))}
                  </figure>
                  <div className="flex justify-between text-xs text-muted-foreground" aria-hidden>
                    <span>{first}</span><span>{last}</span>
                  </div>
                </li>
              )
            })}
          </ul>
          <ChartTakeaway>{takeaway}</ChartTakeaway>
        </>
      )}
    </ChartSection>
  )
}
