'use client'

import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = {
  id: string
  title: string
  /** How many filters are narrowing the list; shown on the button so a narrowed list never looks complete. */
  activeFilters: number
  onClearFilters: () => void
  filters: React.ReactNode
  children: React.ReactNode
}

/**
 * A list with a heading and ONE Filter button (critique: six stacked filter
 * controls pushed the first entry far down the phone screen). The controls live
 * in a panel that opens on demand.
 */
export function ListSection({ id, title, activeFilters, onClearFilters, filters, children }: Props) {
  const [open, setOpen] = useState(false)
  const panelId = `${id}-filters`
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id={`${id}-heading`} className="text-sm font-semibold">{title}</h2>
        <div className="flex items-center gap-1">
          {activeFilters > 0 && (
            <Button variant="ghost" onClick={onClearFilters}>Clear</Button>
          )}
          <Button variant="outline" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(o => !o)}>
            <SlidersHorizontal className="size-4" aria-hidden />
            Filter
            {activeFilters > 0 && <span className="rounded-full bg-accent-2/20 px-1.5 text-xs tabular-nums text-accent-2">{activeFilters}<span className="sr-only"> active</span></span>}
          </Button>
        </div>
      </div>
      {open && (
        <div id={panelId} role="group" aria-label={`${title} filters`} className="glass-soft flex flex-col gap-3 rounded-2xl p-3">
          {filters}
        </div>
      )}
      {children}
    </section>
  )
}
