'use client'

import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

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
  const id = useId()
  return (
    <div className="glass-soft flex flex-col gap-2 rounded-xl p-2">
      <ToggleGroup
        aria-label="Repeat period"
        spacing={1}
        value={[period]}
        onValueChange={v => { const next = v[0] as Period | undefined; if (next) onChange(next, intervalCount) }}
        className="w-full"
      >
        {PERIODS.map(p => (
          <ToggleGroupItem
            key={p.value}
            value={p.value}
            className="h-10 flex-1 border border-transparent px-2 text-muted-foreground aria-pressed:border-accent-2/50 aria-pressed:bg-accent-2/15 aria-pressed:text-accent-2"
          >
            {p.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-sm text-foreground">every</Label>
        <Input
          id={id}
          type="number"
          min={1}
          max={365}
          value={intervalCount}
          onChange={e => onChange(period, Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="w-20 text-right tabular-nums"
        />
        <span className="text-sm text-muted-foreground">{period === 'daily' ? 'day(s)' : period === 'weekly' ? 'week(s)' : period === 'monthly' ? 'month(s)' : 'year(s)'}</span>
      </div>
    </div>
  )
}
