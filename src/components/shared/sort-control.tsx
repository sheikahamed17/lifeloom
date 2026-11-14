'use client'

import { useId } from 'react'
import { Field, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

/**
 * Legacy class string for the few raw selects that still style themselves.
 * New code should use NativeSelect with FIELD_NATIVE_SELECT instead.
 */
export const FIELD_SELECT = 'h-12 w-full rounded-[14px] border border-transparent bg-card px-4 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm'

/** Class for the shadcn NativeSelect wrapper: full width (the white 48 px field comes from NativeSelect itself). */
export const FIELD_NATIVE_SELECT = 'w-full [&_select]:text-base md:[&_select]:text-sm'

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
    <Field className="gap-1.5">
      <FieldLabel htmlFor={id} className="text-[13px] font-semibold text-muted-foreground">{label}</FieldLabel>
      <NativeSelect id={id} value={value} onChange={e => onChange(e.target.value as T)} className={FIELD_NATIVE_SELECT}>
        {options.map(opt => (
          <NativeSelectOption key={opt.value} value={opt.value}>{opt.label}</NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
}
