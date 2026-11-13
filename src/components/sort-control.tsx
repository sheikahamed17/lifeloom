'use client'

import { useId } from 'react'

/** The one select style for list filters and sorts. */
export const FIELD_SELECT = 'min-h-11 w-full rounded-lg border border-input glass-soft px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent-2 md:text-sm'

/** Generic labelled sort control. */
export function SortControl<T extends string>({
  options,
  value,
  onChange,
  label = 'Sort',
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  label?: string
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">{label}</label>
      <select id={id} value={value} onChange={e => onChange(e.target.value as T)} className={FIELD_SELECT}>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}
