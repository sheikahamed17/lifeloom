import { cn } from '@/lib/utils'
import { ordinal } from '@/components/money/month-days'

type Props = {
  /** Spend per day of the month, in primary-currency minor units. Index 0 is the 1st. */
  days: number[]
  /** Today's day of the month, 1-based. */
  today: number
  /** "Nov" */
  monthShort: string
  /** Formats a minor-unit amount for the hover title. */
  format: (minor: number) => string
}

/**
 * The month at a glance inside the green summary panel: one thin bar per day, height in
 * proportion to that day's spend. Past days are light, today is highlighted, days still to
 * come are stubs. Single series, so no legend; each bar's title is the hover layer.
 */
export function DayStrip({ days, today, monthShort, format }: Props) {
  const last = days.length
  const max = Math.max(1, ...days)
  let peak = 0
  for (let i = 0; i < Math.min(today, last); i++) if (days[i] > (days[peak] ?? 0)) peak = i
  const hasSpend = (days[peak] ?? 0) > 0
  const label = hasSpend
    ? `Spending by day this month. Largest day is the ${ordinal(peak + 1)}. Today is the ${ordinal(today)}.`
    : `No spending yet this month. Today is the ${ordinal(today)}.`
  const mark = 'font-semibold text-panel-highlight'

  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={label} className="flex h-14 items-end gap-[3px] lg:h-24 lg:gap-1">
        {days.map((amount, i) => {
          const day = i + 1
          if (day > today) return <div key={day} className="h-0.5 flex-1 bg-panel-border" />
          return (
            <div
              key={day}
              title={`${day} ${monthShort}: ${format(amount)}`}
              className={cn('min-h-0.5 flex-1 rounded-t-[3px] lg:rounded-t', day === today ? 'bg-panel-highlight' : 'bg-panel-foreground')}
              style={{ height: `${amount > 0 ? Math.max(4, (amount / max) * 100) : 0}%` }}
            />
          )
        })}
      </div>
      <div className="flex justify-between text-xs text-panel-muted">
        <span className={today === 1 ? mark : undefined}>{today === 1 ? 'Today' : `1 ${monthShort}`}</span>
        {today > 1 && today < last && <span className={mark}>Today</span>}
        <span className={today === last ? mark : undefined}>{today === last ? 'Today' : `${last} ${monthShort}`}</span>
      </div>
    </div>
  )
}
