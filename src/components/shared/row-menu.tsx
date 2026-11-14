'use client'

import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export type RowMenuItem = {
  label: string
  icon?: React.ComponentType<{ className?: string }>
  onSelect: () => void
  destructive?: boolean
}

type Props = {
  /** Accessible name of the trigger, e.g. "Actions for Swiggy −₹420". */
  label: string
  items: RowMenuItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Extra classes for the trigger, e.g. ink instead of muted in a page header. */
  triggerClassName?: string
}

// The menu portals out of the row in the DOM but not in the React tree, so its
// pointer and click events would still bubble to the surrounding SwipeRow (starting
// a swipe or opening the editor). Stop them at the panel.
const stop = (e: React.SyntheticEvent) => e.stopPropagation()

/**
 * The visible "⋯" on every row: the keyboard and screen-reader path to Edit and
 * Delete that a long-press alone never gave (critique P1). A shadcn DropdownMenu,
 * so Escape, arrow keys, outside press and focus return come from the primitive.
 * `open` stays controlled so a long-press on the row can open it too.
 */
export function RowMenu({ label, items, open, onOpenChange, triggerClassName }: Props) {
  return (
    <DropdownMenu open={open} onOpenChange={o => onOpenChange(o)}>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-lg" className={cn('shrink-0 text-muted-foreground hover:text-foreground', triggerClassName)} />}
        aria-label={label}
        onClick={stop}
      >
        <MoreHorizontal className="size-5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        aria-label={label}
        className="w-auto min-w-44"
        onPointerDown={stop}
        onPointerMove={stop}
        onPointerUp={stop}
        onClick={stop}
      >
        {items.map(it => {
          const Icon = it.icon
          return (
            <DropdownMenuItem
              key={it.label}
              variant={it.destructive ? 'destructive' : 'default'}
              className="min-h-11 px-3 text-[15px]"
              onClick={() => it.onSelect()}
            >
              {Icon && <Icon className="size-4" aria-hidden />}
              {it.label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
