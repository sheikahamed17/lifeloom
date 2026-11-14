'use client'

import { useId, useMemo, useState } from 'react'
import type { Mover } from '@/lib/analytics'
import { DIVERGING, TRACK_COLOR } from '@/lib/chart-palette'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChartEmpty, ChartSection, ChartTakeaway, fullMoney } from '@/components/charts/chart-kit'

interface MoversBarsProps {
  movers: Mover[]
  symbol: string
  jpy: boolean
  limit?: number
  /** What is being compared, e.g. "Nov so far against Oct". */
  comparison?: string
  className?: string
}

/**
 * Categories that moved most against the previous period, as ruled rows: a thin
 * bar for the size of the change on a muted track, then the signed figure and
 * percent in text ink. Direction is carried by the sign (and by words for screen
 * readers); a rise in spend draws its bar in the attention colour.
 */
export function MoversBars({ movers, symbol, jpy, limit = 8, comparison, className }: MoversBarsProps) {
  const id = useId()
  const [showTable, setShowTable] = useState(false)
  const top = useMemo(() => movers.slice(0, limit), [movers, limit])
  const maxDelta = useMemo(() => Math.max(0, ...top.map(m => Math.abs(m.delta))), [top])
  const signed = (m: number) => `${m > 0 ? '+' : ''}${fullMoney(m, symbol, jpy)}`
  const pct = (m: Mover) => (m.deltaPct === null ? 'new' : `${m.deltaPct > 0 ? '+' : m.deltaPct < 0 ? '−' : ''}${Math.abs(m.deltaPct).toFixed(0)}%`)

  if (top.length === 0) {
    return <ChartEmpty id={id} title="Biggest changes" className={className}>Nothing to compare yet. This needs two periods of spending.</ChartEmpty>
  }

  const lead = top.reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a))
  const takeaway = `${lead.name} changed the most: ${fullMoney(Math.abs(lead.delta), symbol, jpy)} ${lead.delta > 0 ? 'more' : 'less'} than the period before.`

  return (
    <ChartSection id={id} title="Biggest changes" showTable={showTable} onToggle={() => setShowTable(s => !s)} className={className}>
      <p className="pb-1 pt-3 text-[13px] text-muted-foreground">{comparison ?? 'This period against the last one'}</p>
      {showTable ? (
        <Table>
          <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Change</TableHead><TableHead className="text-right">%</TableHead></TableRow></TableHeader>
          <TableBody>
            {top.map(m => (
              <TableRow key={m.name}>
                <TableCell>{m.name}</TableCell>
                <TableCell className="text-right tabular-nums">{signed(m.delta)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(m)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <>
          <ul className="flex flex-col" aria-label="Biggest changes">
            {top.map(m => {
              const share = maxDelta > 0 ? (Math.abs(m.delta) / maxDelta) * 100 : 0
              const up = m.delta > 0
              return (
                <li
                  key={m.name}
                  title={`${m.name}: ${signed(m.delta)} (${pct(m)})`}
                  className="grid min-h-13 grid-cols-[minmax(0,4.5rem)_1fr_auto_2.75rem] items-center gap-3 border-b border-border text-sm sm:grid-cols-[minmax(0,7rem)_1fr_auto_2.75rem]"
                >
                  <span className="truncate font-medium">{m.name}</span>
                  <span className="h-2 rounded-full" style={{ backgroundColor: TRACK_COLOR }} aria-hidden>
                    {share > 0 && (
                      <span
                        className="block h-2 rounded-full"
                        style={{ width: `${Math.max(3, share)}%`, backgroundColor: up ? DIVERGING.negative : DIVERGING.positive }}
                      />
                    )}
                  </span>
                  <span className="whitespace-nowrap text-right font-semibold tabular-nums">
                    {signed(m.delta)}
                    <span className="sr-only"> {up ? 'more' : 'less'} than last period</span>
                  </span>
                  <span className="whitespace-nowrap text-right text-[13px] tabular-nums text-muted-foreground">{pct(m)}</span>
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
