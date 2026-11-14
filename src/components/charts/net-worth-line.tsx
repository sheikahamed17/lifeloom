'use client'

import { useId, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PanelStat, SummaryPanel } from '@/components/shared/summary-panel'
import { useMeasuredWidth } from '@/components/charts/chart-kit'

interface NetWorthLineProps {
  data: { label: string; net: number }[]
  /** Net worth right now, in minor units of the primary currency: the panel's headline. */
  current: number
  symbol: string
  jpy: boolean
}

// From `lg:` the panel is two columns: figures on the left, the line on the right.
const TWO_COLUMN = 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-end lg:gap-x-12 lg:[&>*:nth-child(2)]:col-start-2 lg:[&>*:nth-child(2)]:row-span-2 lg:[&>*:nth-child(2)]:row-start-1'

/**
 * The page's one green panel: net worth today as the headline, the line over the
 * last periods drawn on the panel, and where it started and how far it moved.
 */
export function NetWorthLine({ data, current, symbol, jpy }: NetWorthLineProps) {
  const [showData, setShowData] = useState(false)
  const id = useId()
  // Draw at the panel's real width so the line fills it and marks keep their size.
  const [wrapRef, measured] = useMeasuredWidth<HTMLDivElement>()

  const isEmpty = data.length <= 1

  const { minNet, maxNet } = useMemo(() => {
    if (data.length === 0) return { minNet: 0, maxNet: 0 }
    const nets = data.map((d) => d.net)
    return { minNet: Math.min(...nets), maxNet: Math.max(...nets) }
  }, [data])

  // Y-scale spans [min(0, minNet), max(0, maxNet)] to include zero
  const yMin = Math.min(0, minNet)
  const yMax = Math.max(0, maxNet)
  const yRange = yMax - yMin

  const hasNegative = minNet < 0
  const hasPositive = maxNet > 0

  const formatNet = (amount: number) => {
    const divisor = jpy ? 1 : 100
    const formatted = (Math.abs(amount) / divisor).toLocaleString('en-US', {
      maximumFractionDigits: jpy ? 0 : 2,
    })
    return `${amount < 0 ? '−' : ''}${symbol}${formatted}`
  }

  // SVG layout constants
  const padX = 10
  const padY = 10
  const width = Math.max(240, measured || 320)
  const height = 120
  const plotWidth = width - padX * 2
  const plotHeight = height - padY * 2

  const zeroLineY = yRange > 0 ? padY + plotHeight * (yMax / yRange) : padY + plotHeight / 2

  const points = useMemo(() => {
    return data.map((d, i) => {
      const x = padX + (data.length > 1 ? i / (data.length - 1) : 0.5) * plotWidth
      const normalizedY = yRange > 0 ? (yMax - d.net) / yRange : 0.5
      const y = padY + normalizedY * plotHeight
      return { x, y, ...d, index: i }
    })
  }, [data, plotWidth, plotHeight, yRange, yMax])

  const pathData = useMemo(
    () => points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' '),
    [points],
  )

  const lastPoint = points[points.length - 1]
  const first = data[0]
  const n = data.length

  // With many points, label only every few so the names do not collide; the latest is always named.
  const step = n <= 7 ? 1 : Math.ceil(n / 4)

  const change = first ? current - first.net : 0
  const diffs = data.slice(1).map((d, i) => d.net - data[i].net)
  const takeaway = isEmpty || !first
    ? 'Not enough history yet. This fills in as your accounts age.'
    : diffs.every(v => v > 0)
      ? `Net worth has gone up every month since ${first.label}.`
      : diffs.every(v => v < 0)
        ? `Net worth has gone down every month since ${first.label}.`
        : change === 0
          ? `Net worth is where it was in ${first.label}.`
          : `Net worth is ${formatNet(Math.abs(change))} ${change > 0 ? 'higher' : 'lower'} than in ${first.label}.`

  return (
    <div role="region" aria-labelledby={id}>
      <SummaryPanel
        className={cn(!isEmpty && TWO_COLUMN)}
        eyebrow={<span id={id}>Net worth today</span>}
        value={formatNet(current)}
        stats={!isEmpty && first ? (
          <>
            <PanelStat label={`In ${first.label}`} value={formatNet(first.net)} />
            <PanelStat label={`Change since ${first.label}`} value={`${change > 0 ? '+' : ''}${formatNet(change)}`} />
          </>
        ) : undefined}
      >
        {isEmpty ? (
          <p className="text-[13px] text-panel-muted">{takeaway}</p>
        ) : (
          <div className="flex min-w-0 flex-col gap-2">
            {showData ? (
              <Table className="[&_td]:text-panel-foreground [&_th]:text-panel-muted [&_tr]:border-panel-border [&_tr:hover]:bg-transparent">
                <TableHeader><TableRow><TableHead>Period</TableHead><TableHead className="text-right">Net worth</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.map((d) => (
                    <TableRow key={d.label}>
                      <TableCell>{d.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNet(d.net)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <>
                <div ref={wrapRef}>
                  <svg
                    viewBox={`0 0 ${width} ${height}`}
                    className="block h-[120px] w-full"
                    role="img"
                    aria-label={`Net worth trend: ${data.map((d) => `${d.label} ${formatNet(d.net)}`).join(', ')}`}
                  >
                    {/* Recessive gridlines: top, middle and bottom of the plot */}
                    {[0, 0.5, 1].map(t => (
                      <line
                        key={t}
                        x1={0}
                        x2={width}
                        y1={padY + plotHeight * t}
                        y2={padY + plotHeight * t}
                        className="stroke-panel-border"
                        strokeWidth="1"
                      />
                    ))}

                    {/* Zero baseline, only when the range crosses zero */}
                    {hasNegative && hasPositive && (
                      <line x1={0} x2={width} y1={zeroLineY} y2={zeroLineY} className="stroke-panel-muted" strokeWidth="1" strokeDasharray="2,3" />
                    )}

                    <path d={pathData} fill="none" className="stroke-panel-foreground" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                    {/* The latest point is the one emphasised mark */}
                    {lastPoint && <circle cx={lastPoint.x} cy={lastPoint.y} r="5" className="fill-panel-highlight" />}

                    {/* Hover targets larger than the marks */}
                    {points.map((p) => (
                      <circle key={`hit-${p.index}`} cx={p.x} cy={p.y} r={14} fill="transparent">
                        <title>{`${p.label}: ${formatNet(p.net)}`}</title>
                      </circle>
                    ))}
                  </svg>
                </div>
                <div className="flex justify-between text-xs text-panel-muted" aria-hidden>
                  {data.map((d, i) => (
                    <span
                      key={d.label}
                      className={cn(
                        i === n - 1 && 'font-semibold text-panel-highlight',
                        i !== n - 1 && (n - 1 - i) % step !== 0 && 'invisible',
                      )}
                    >
                      {d.label}
                    </span>
                  ))}
                </div>
              </>
            )}
            <div className="flex flex-wrap items-center justify-between gap-x-4">
              <p className="text-[13px] text-panel-muted">{takeaway}</p>
              <Button
                type="button"
                variant="link"
                onClick={() => setShowData(s => !s)}
                aria-pressed={showData}
                className="h-11 px-0 text-[13px] text-panel-foreground hover:text-panel-foreground"
              >
                {showData ? 'Show chart' : 'Show table'}
              </Button>
            </div>
          </div>
        )}
      </SummaryPanel>
    </div>
  )
}
