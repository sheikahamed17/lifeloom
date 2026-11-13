import type { LucideIcon } from 'lucide-react'
import { Tag } from 'lucide-react'
import { cn } from '@/lib/utils'

const SIZES = {
  sm: 'size-8 rounded-lg text-base',
  md: 'size-10 rounded-lg text-lg',
  lg: 'size-12 rounded-xl text-xl',
} as const

type Props = {
  /** The user's own emoji for a category/account/goal. */
  emoji?: string | null
  /** Shown instead when there is no emoji (a Lucide icon). Defaults to a tag. */
  icon?: LucideIcon
  size?: keyof typeof SIZES
  className?: string
}

/**
 * Leading visual for a row: the emoji (or an icon) centred in a quiet rounded tile, so a
 * list of mixed emoji reads as one consistent column instead of ragged inline glyphs.
 * Decorative; the row's text carries the name.
 */
export function IconTile({ emoji, icon: Icon = Tag, size = 'md', className }: Props) {
  return (
    <span
      aria-hidden="true"
      className={cn('grid shrink-0 place-items-center bg-muted leading-none text-muted-foreground', SIZES[size], className)}
    >
      {emoji ? <span className="text-foreground">{emoji}</span> : <Icon className={size === 'sm' ? 'size-4' : 'size-5'} />}
    </span>
  )
}
