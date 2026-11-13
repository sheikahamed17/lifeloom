'use client'

import { SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'

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
 * in a popover that opens on demand.
 */
export function ListSection({ id, title, activeFilters, onClearFilters, filters, children }: Props) {
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id={`${id}-heading`} className="text-base font-semibold tracking-tight">{title}</h2>
        <div className="flex items-center gap-1">
          {activeFilters > 0 && (
            <Button variant="ghost" onClick={onClearFilters}>Clear</Button>
          )}
          <Popover>
            <PopoverTrigger render={<Button variant="outline" />}>
              <SlidersHorizontal className="size-4" aria-hidden />
              Filter
              {activeFilters > 0 && <Badge className="bg-accent-2/20 px-1.5 tabular-nums text-accent-2">{activeFilters}<span className="sr-only"> active</span></Badge>}
            </PopoverTrigger>
            <PopoverContent align="end" className="glass max-h-[70vh] w-[min(28rem,calc(100vw-2rem))] gap-3 overflow-y-auto p-3">
              <PopoverTitle className="sr-only">{title} filters</PopoverTitle>
              {filters}
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {children}
    </section>
  )
}
