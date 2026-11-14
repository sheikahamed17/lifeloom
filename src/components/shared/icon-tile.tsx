import type { LucideIcon } from 'lucide-react'
import { Tag } from 'lucide-react'
import { cn } from '@/lib/utils'

const SIZES = {
  sm: 'size-8 rounded-[10px] text-[13px]',
  md: 'size-10 rounded-xl text-[15px]',
  lg: 'size-12 rounded-[14px] text-lg',
} as const

type Props = {
  /** What the row is about (merchant, person, account, category). Its first letter is shown. */
  name?: string | null
  /**
   * The user's own emoji. Accepted so call sites keep compiling, but NOT drawn: this design
   * uses monogram squares, never emoji (15 Nov 2026).
   */
  emoji?: string | null
  /** Shown when there is no name (a Lucide icon). Defaults to a tag. */
  icon?: LucideIcon
  /** `income` tints the square blue, for money coming in. */
  tone?: 'default' | 'income'
  size?: keyof typeof SIZES
  className?: string
}

/**
 * Leading visual for a row: a quiet rounded square holding the first letter of the name
 * (or an icon). Decorative; the row's text carries the name. Use it for merchants, people
 * and accounts in lists, not as decoration on headings or settings rows.
 */
export function IconTile({ name, icon: Icon = Tag, tone = 'default', size = 'md', className }: Props) {
  const letter = name?.trim().match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase()
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center font-bold leading-none',
        tone === 'income' ? 'bg-income-tint text-income' : 'bg-muted text-foreground',
        SIZES[size],
        className,
      )}
    >
      {letter ?? <Icon className={size === 'sm' ? 'size-4' : 'size-5'} />}
    </span>
  )
}
