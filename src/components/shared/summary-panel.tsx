import { cn } from '@/lib/utils'

type Props = {
  /** Small line above the figure, e.g. "November, day 14 of 30". */
  eyebrow?: React.ReactNode
  /** The headline figure, e.g. "₹26,460" or "4". */
  value: React.ReactNode
  /** A word after the figure, e.g. "spent" or "open tasks". */
  unit?: React.ReactNode
  /** Optional body between the figure and the stats (a day strip, a sentence). */
  children?: React.ReactNode
  /** `PanelStat`s shown under a divider. */
  stats?: React.ReactNode
  className?: string
}

/**
 * The one green summary panel a screen may have: the page's headline number and two or
 * three supporting figures. Use it only when the page HAS a headline number or status;
 * forms and plain lists get none. Never more than one per screen.
 */
export function SummaryPanel({ eyebrow, value, unit, children, stats, className }: Props) {
  return (
    <section className={cn('flex flex-col gap-5 rounded-3xl bg-panel px-6 pb-6 pt-7 text-panel-foreground lg:rounded-[28px] lg:p-8', className)}>
      <div className="flex flex-col gap-1.5">
        {eyebrow && <p className="text-[13px] text-panel-muted lg:text-sm">{eyebrow}</p>}
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[52px] font-semibold leading-none tracking-[-0.03em] tabular-nums lg:text-[64px]">{value}</span>
          {unit && <span className="text-[15px] text-panel-muted lg:text-base">{unit}</span>}
        </p>
      </div>
      {children}
      {stats && <dl className="flex flex-wrap justify-between gap-x-8 gap-y-3 border-t border-panel-border pt-3.5">{stats}</dl>}
    </section>
  )
}

/** One supporting figure inside a `SummaryPanel`. `highlight` marks a figure that needs attention. */
export function PanelStat({ label, value, highlight }: { label: React.ReactNode; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-panel-muted">{label}</dt>
      <dd className={cn('text-[17px] font-semibold tabular-nums', highlight && 'text-panel-highlight')}>{value}</dd>
    </div>
  )
}
