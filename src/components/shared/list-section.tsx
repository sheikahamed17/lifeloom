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
      <div className="flex items-end justify-between gap-2 border-b border-border pb-2.5">
        <h2 id={`${id}-heading`} className="text-[19px] font-bold tracking-[-0.02em] lg:text-[22px]">{title}</h2>
        <div className="flex items-center gap-1">
          {activeFilters > 0 && (
            <Button variant="ghost" onClick={onClearFilters}>Clear</Button>
          )}
          <Popover>
            <PopoverTrigger render={<Button variant="ghost" className="-mr-2 px-2" />}>
              <SlidersHorizontal className="size-4" aria-hidden />
              Filter
              {activeFilters > 0 && <Badge className="bg-transparent px-0 font-bold tabular-nums text-warning">{activeFilters}<span className="sr-only"> active</span></Badge>}
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
