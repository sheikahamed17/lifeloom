'use client'

import { cn } from '@/lib/utils'

export type Period = 'daily' | 'weekly' | 'monthly' | 'yearly'

type Props = {
  period: Period
  intervalCount: number
  onChange: (period: Period, intervalCount: number) => void
}

const PERIODS: { value: Period; label: string }[] = [
  { value: 'daily',   label: 'Daily' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly',  label: 'Yearly' },
]

export function PeriodPicker({ period, intervalCount, onChange }: Props) {
  return (
    <div className="glass-soft flex flex-col gap-2 rounded-2xl p-2">
      <div className="flex gap-1">
        {PERIODS.map(p => (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange(p.value, intervalCount)}
            aria-pressed={p.value === period}
            className={cn(
              'min-h-10 flex-1 rounded-lg border border-transparent px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent-2 outline-none',
              p.value === period
                ? 'border-accent-2/50 bg-accent-2/15 text-accent-2'
                : 'hover:bg-white/5',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between text-xs">
        <span>every</span>
        <input
          type="number"
          min={1}
          max={365}
          value={intervalCount}
          onChange={e => onChange(period, Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="glass-soft w-16 rounded-lg px-2 py-0.5 text-right font-mono tabular-nums focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
        />
        <span className="text-muted-foreground">{period === 'daily' ? 'day(s)' : period === 'weekly' ? 'week(s)' : period === 'monthly' ? 'month(s)' : 'year(s)'}</span>
      </label>
    </div>
  )
}
