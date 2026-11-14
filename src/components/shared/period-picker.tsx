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
    <div className="flex flex-col gap-2">
      <ToggleGroup
        aria-label="Repeat period"
        spacing={5}
        value={[period]}
        onValueChange={v => { const next = v[0] as Period | undefined; if (next) onChange(next, intervalCount) }}
        className="w-full"
      >
        {PERIODS.map(p => (
          <ToggleGroupItem
            key={p.value}
            value={p.value}
            className="h-11 min-w-0 rounded-none border-b-2 border-transparent bg-transparent px-0 text-sm font-medium text-muted-foreground hover:bg-transparent hover:text-foreground aria-pressed:border-foreground aria-pressed:bg-transparent aria-pressed:font-bold aria-pressed:text-foreground"
          >
            {p.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex items-center gap-3">
        <Label htmlFor={id} className="text-[13px] font-semibold text-muted-foreground">Every</Label>
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
