'use client'

import { useId } from 'react'
import { Field, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

/**
 * Legacy class string for the few raw selects that still style themselves.
 * New code should use NativeSelect with FIELD_NATIVE_SELECT instead.
 */
export const FIELD_SELECT = 'min-h-11 w-full rounded-lg border border-input glass-soft px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent-2 md:text-sm'

/** Class for the shadcn NativeSelect wrapper: full width, 44 px tall, readable text. */
export const FIELD_NATIVE_SELECT = 'w-full [&_select]:h-11 [&_select]:bg-muted [&_select]:text-base md:[&_select]:text-sm'

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
    <Field className="gap-1">
      <FieldLabel htmlFor={id} className="text-xs">{label}</FieldLabel>
      <NativeSelect id={id} value={value} onChange={e => onChange(e.target.value as T)} className={FIELD_NATIVE_SELECT}>
        {options.map(opt => (
          <NativeSelectOption key={opt.value} value={opt.value}>{opt.label}</NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
}
