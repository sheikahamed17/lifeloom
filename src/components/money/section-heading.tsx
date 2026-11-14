import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  id?: string
  children: React.ReactNode
  /** A small link, count or control on the right of the heading row. */
  aside?: React.ReactNode
  /** Ruled lists sit under a hairline; a stack of attention rows does not. */
  ruled?: boolean
  className?: string
}

/** The heading row of a Money section: a ruled list on the page ground, never a box. */
export function SectionHeading({ id, children, aside, ruled = true, className }: Props) {
  return (
    <div className={cn('flex items-end justify-between gap-3', ruled ? 'border-b border-border pb-2.5' : 'pb-1', className)}>
      <h2 id={id} className="text-[19px] font-bold tracking-[-0.02em] lg:text-[22px]">{children}</h2>
      {aside}
    </div>
  )
}

/** A small text link on the right of a heading row. The pseudo-element keeps a 44px touch target. */
export const HEAD_LINK = cn(
  buttonVariants({ variant: 'link' }),
  'relative h-auto shrink-0 p-0 text-[13px] after:absolute after:-inset-x-2 after:-inset-y-3.5 lg:text-sm',
)

/** A text link that ends a section ("Move money between accounts"). */
export const FOOT_LINK = cn(buttonVariants({ variant: 'link' }), 'h-11 self-start px-0')

/** Muted note on the right of a heading row. */
export const HEAD_NOTE = 'shrink-0 text-[13px] text-muted-foreground'

/** One line of plain text for an empty section. */
export const EMPTY_NOTE = 'pt-3 text-sm text-muted-foreground'

/** The 8px bar: share of a total, or progress to a limit. `attention` marks a limit that is close or passed. */
export function Bar({ pct, attention, className }: { pct: number; attention?: boolean; className?: string }) {
  const width = pct > 0 ? Math.min(100, Math.max(2, pct)) : 0
  return (
    <span aria-hidden="true" className={cn('block h-2 min-w-0 rounded-full bg-muted', className)}>
      <span className={cn('block h-2 rounded-full', attention ? 'bg-warning' : 'bg-foreground')} style={{ width: `${width}%` }} />
    </span>
  )
}
