'use client'

import { useId, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { Mover } from '@/lib/analytics'
import { DIVERGING } from '@/lib/chart-palette'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChartEmpty, ChartHeader, fullMoney } from '@/components/charts/chart-kit'

interface MoversBarsProps {
  movers: Mover[]
  symbol: string
  jpy: boolean
  limit?: number
}

/**
 * Categories that moved most against the previous period, as diverging bars from
 * a zero line (more spend → right, red; less → left, green). Figures sit in text
 * ink at full size in their own column, so they stay readable on a phone.
 */
export function MoversBars({ movers, symbol, jpy, limit = 8 }: MoversBarsProps) {
  const id = useId()
  const [showTable, setShowTable] = useState(false)
  const top = useMemo(() => movers.slice(0, limit), [movers, limit])
  const maxDelta = useMemo(() => Math.max(0, ...top.map(m => Math.abs(m.delta))), [top])
  const signed = (m: number) => `${m > 0 ? '+' : ''}${fullMoney(m, symbol, jpy)}`
  const pct = (m: Mover) => (m.deltaPct === null ? 'new' : `${m.deltaPct > 0 ? '+' : ''}${m.deltaPct.toFixed(0)}%`)

  if (top.length === 0) {
    return <ChartEmpty id={id} title="Biggest changes">Nothing to compare yet. This needs two periods of spending.</ChartEmpty>
  }

  return (
    <Card role="region" aria-labelledby={id}>
      <ChartHeader id={id} title="Biggest changes vs last period" showTable={showTable} onToggle={() => setShowTable(s => !s)} />
      <CardContent>
      {showTable ? (
        <Table>
          <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Change</TableHead><TableHead className="text-right">%</TableHead></TableRow></TableHeader>
          <TableBody>
            {top.map(m => (
              <TableRow key={m.name}>
                <TableCell>{m.icon && <span aria-hidden="true">{m.icon} </span>}{m.name}</TableCell>
                <TableCell className="text-right tabular-nums">{signed(m.delta)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(m)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <ul className="flex flex-col" aria-label="Biggest changes">
          {top.map(m => {
            const share = maxDelta > 0 ? (Math.abs(m.delta) / maxDelta) * 50 : 0
            const up = m.delta > 0
            return (
              <li
                key={m.name}
                title={`${m.name}: ${signed(m.delta)} (${pct(m)})`}
                className="grid min-h-10 grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 text-sm"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {m.icon && <span aria-hidden="true">{m.icon}</span>}
                  <span className="truncate">{m.name}</span>
                </span>
                <span className="relative h-3" aria-hidden>
                  <span className="absolute inset-y-[-4px] left-1/2 w-px bg-border" />
                  {share > 0 && (
                    <span
                      className={`absolute inset-y-0 ${up ? 'rounded-r-[4px]' : 'rounded-l-[4px]'}`}
                      style={{
                        left: up ? '50%' : `${50 - share}%`,
                        width: `${share}%`,
                        backgroundColor: up ? DIVERGING.negative : DIVERGING.positive,
                      }}
                    />
                  )}
                </span>
                <span className="flex items-center justify-end gap-1 whitespace-nowrap tabular-nums text-xs tabular-nums">
                  {up ? <ArrowUp className="size-3.5 text-destructive" aria-hidden /> : <ArrowDown className="size-3.5 text-income" aria-hidden />}
                  {signed(m.delta)}
                  <span className="text-muted-foreground">{pct(m)}</span>
                  <span className="sr-only">{up ? 'more' : 'less'} than last period</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
      </CardContent>
    </Card>
  )
}
