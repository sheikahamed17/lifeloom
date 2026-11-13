'use client'

import { useCallback, useRef, useState } from 'react'

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

/** Title + "Table / Chart" toggle: every chart has a table view (identity is never colour alone). */
export function ChartHeader({ id, title, showTable, onToggle, children }: {
  id: string
  title: string
  showTable: boolean
  onToggle: () => void
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h2 id={id} className="text-sm font-semibold">{title}</h2>
      <div className="flex items-center gap-3">
        {children}
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={showTable}
          className="-mr-2 inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-accent-2 outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-accent-2"
        >
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>
    </div>
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

export function fullMoney(minor: number, symbol: string, jpy: boolean): string {
  const major = minor / (jpy ? 1 : 100)
  const sign = major < 0 ? '−' : ''
  return `${sign}${symbol}${Math.abs(major).toLocaleString('en-IN', { maximumFractionDigits: jpy ? 0 : 2 })}`
}

export const TABLE = 'w-full text-sm [&_td]:px-2 [&_td]:py-2 [&_th]:px-2 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground [&_tr]:border-b [&_tr]:border-white/10'
