'use client'

import { useId, useMemo, useState } from 'react'
import { SEQUENTIAL_HUE } from '@/lib/chart-palette'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChartEmpty, ChartHeader, fullMoney, tickClass } from '@/components/charts/chart-kit'

interface BarTrendProps {
  data: { label: string; amount: number }[]
  symbol: string
  jpy: boolean
  label: string
}

/** Single-series magnitude over time: one sequential hue, latest period emphasised, no legend (the title names it). */
export function BarTrend({ data, symbol, jpy, label }: BarTrendProps) {
  const id = useId()
  const [showTable, setShowTable] = useState(false)
  const max = useMemo(() => Math.max(0, ...data.map(d => d.amount)), [data])
  const money = (m: number) => fullMoney(m, symbol, jpy)
  const n = data.length

  if (n <= 1) {
    return <ChartEmpty id={id} title={label}>Not enough history yet. This fills in after a couple of periods.</ChartEmpty>
  }

  return (
    <Card role="region" aria-labelledby={id}>
      <ChartHeader id={id} title={label} showTable={showTable} onToggle={() => setShowTable(s => !s)} />
      <CardContent>
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
        <figure role="img" aria-label={`${label}: ${data.map(d => `${d.label} ${money(d.amount)}`).join(', ')}`} className="flex flex-col gap-1">
          <p className="text-right text-xs text-muted-foreground">Highest <span className="tabular-nums">{money(max)}</span></p>
          <div className="relative flex h-40 items-end gap-0.5 border-b border-border">
            <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border" />
            {data.map((d, i) => (
              <div key={d.label} title={`${d.label}: ${money(d.amount)}`} className="group flex h-full flex-1 items-end justify-center">
                <div
                  className="w-full max-w-8 rounded-t-[4px] transition-[filter] group-hover:brightness-125"
                  style={{
                    height: d.amount > 0 && max > 0 ? `${Math.max(2, (d.amount / max) * 100)}%` : 0,
                    backgroundColor: SEQUENTIAL_HUE,
                    opacity: i === n - 1 ? 1 : 0.5,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-0.5" aria-hidden>
            {data.map((d, i) => (
              <span key={d.label} className={cn('flex-1 truncate text-center text-xs text-muted-foreground', tickClass(i, n), i === n - 1 && 'text-foreground')}>
                {d.label}
              </span>
            ))}
          </div>
        </figure>
      )}
      </CardContent>
    </Card>
  )
}
