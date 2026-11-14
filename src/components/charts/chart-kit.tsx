'use client'

import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Shared chart parts (UX pass, 13 Nov 2026). Charts used to draw into a fixed
 * viewBox that the browser scaled: at desktop width the drawing sat in 40% of
 * the card, and on a phone its 12 px labels shrank to ~7 px. Text now lives in
 * HTML at true size and plots either stretch with CSS or draw at the measured width.
 */

/**
 * Width of the element in CSS px, kept current with a ResizeObserver (0 until
 * measured). A callback ref, so it attaches whenever the element mounts, even
 * after an empty state or a table view replaced it.
 */
export function useMeasuredWidth<T extends HTMLElement>() {
  const [width, setWidth] = useState(0)
  const observer = useRef<ResizeObserver | null>(null)
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    observer.current = ro
  }, [])
  return [ref, width] as const
}

const HEADING = 'text-[19px] font-bold leading-snug tracking-[-0.02em] lg:text-[22px]'

/**
 * Heading row of a chart section: the title, and "Show table" on the right.
 * Every chart has a table view (identity is never colour alone).
 */
export function ChartHeader({ id, title, showTable, onToggle }: {
  id: string
  title: string
  showTable: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border pb-2.5">
      <h2 id={id} className={HEADING}>{title}</h2>
      <Button
        type="button"
        variant="link"
        onClick={onToggle}
        aria-pressed={showTable}
        className="-my-2 h-11 shrink-0 px-0 text-[13px] lg:text-sm"
      >
        {showTable ? 'Show chart' : 'Show table'}
      </Button>
    </div>
  )
}

/** A chart as a flat ruled section on the page ground: heading row, then the chart or its table. */
export function ChartSection({ id, title, showTable, onToggle, className, children }: {
  id: string
  title: string
  showTable: boolean
  onToggle: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <section role="region" aria-labelledby={id} className={cn('flex min-w-0 flex-col', className)}>
      <ChartHeader id={id} title={title} showTable={showTable} onToggle={onToggle} />
      {children}
    </section>
  )
}

/** The one plain-language sentence under a chart. */
export function ChartTakeaway({ children }: { children: React.ReactNode }) {
  return <p className="pt-3 text-[13px] text-muted-foreground">{children}</p>
}

/** A chart section's empty state: the heading and a short explanation. */
export function ChartEmpty({ id, title, className, children }: { id: string; title: string; className?: string; children: React.ReactNode }) {
  return (
    <section role="region" aria-labelledby={id} className={cn('flex min-w-0 flex-col', className)}>
      <div className="flex items-center justify-between gap-4 border-b border-border pb-2.5">
        <h2 id={id} className={HEADING}>{title}</h2>
      </div>
      <p className="pt-3.5 text-[15px] text-muted-foreground">{children}</p>
    </section>
  )
}

/**
 * Tick thinning for a row of n period labels: every label when few, every other
 * on a phone when it's crowded, every third/second when it's very crowded. The
 * latest period is always labelled.
 */
export function tickClass(i: number, n: number): string {
  const fromEnd = n - 1 - i
  if (n <= 7) return ''
  if (n <= 13) return fromEnd % 2 === 0 ? '' : 'max-sm:invisible'
  return fromEnd % 2 !== 0 ? 'invisible' : fromEnd % 4 === 0 ? '' : 'max-sm:invisible'
}

/** "₹1.2K" style for tight labels; full figures stay in titles and the table. */
export function compactMoney(minor: number, symbol: string, jpy: boolean): string {
  const major = minor / (jpy ? 1 : 100)
  const sign = major < 0 ? '−' : ''
  return `${sign}${symbol}${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.abs(major))}`
}

/** "52.4K" for the figure above a bar: no symbol, the heading and the table carry the unit. */
export function compactFigure(minor: number, jpy: boolean): string {
  const major = minor / (jpy ? 1 : 100)
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(major)
}

export function fullMoney(minor: number, symbol: string, jpy: boolean): string {
  const major = minor / (jpy ? 1 : 100)
  const sign = major < 0 ? '−' : ''
  return `${sign}${symbol}${Math.abs(major).toLocaleString('en-IN', { maximumFractionDigits: jpy ? 0 : 2 })}`
}

/** @deprecated charts now use the shadcn Table; kept for compatibility. */
export const TABLE = 'w-full text-sm [&_td]:px-2 [&_td]:py-2 [&_th]:px-2 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground [&_tr]:border-b [&_tr]:border-border'
