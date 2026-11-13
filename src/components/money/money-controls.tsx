'use client'

import { useId, useMemo } from 'react'
import { useCategories } from '@/hooks/use-categories'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import type { MoneyEntryRow } from '@/lib/dexie'
import type { MoneyFilter, MoneySort } from '@/lib/money-filter-sort'
import { monthBounds } from '@/lib/money-filter-sort'
import { FIELD_NATIVE_SELECT } from '@/components/shared/sort-control'
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from '@/components/ui/native-select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const SOURCE_LABEL: Record<MoneyEntryRow['source'], string> = {
  manual: 'Typed by hand', voice: 'Voice', receipt: 'Receipt photo', sms: 'SMS', email: 'Email', recurring: 'Recurring rule',
}

type Props = {
  userId: string
  filter: MoneyFilter
  sort: MoneySort
  onFilter: (filter: MoneyFilter) => void
  onSort: (sort: MoneySort) => void
}

export function MoneyControls({ userId, filter, sort, onFilter, onSort }: Props) {
  const allCats = useCategories(userId)
  const entries = useMoneyEntries(userId)

  const spendCats = useMemo(() => allCats.filter(c => c.kind === 'spend'), [allCats])
  const incomeCats = useMemo(() => allCats.filter(c => c.kind === 'income'), [allCats])

  const distinctTags = useMemo(() => {
    const tags = new Set<string>()
    entries.forEach(e => {
      ;(e.tags ?? []).forEach(tag => tags.add(tag))
    })
    return Array.from(tags).sort()
  }, [entries])

  const sources: Array<MoneyEntryRow['source'] | 'all'> = ['all', 'manual', 'voice', 'receipt', 'sms', 'email', 'recurring']

  // Month bounds: current and previous month. Read the clock inside useMemo (not
  // the render body) to satisfy react-hooks/purity; mount-stable is fine here
  // (a session spanning a UTC month rollover is rare and only affects which
  // date-range option shows as selected).
  const currentMonthBounds = useMemo(() => monthBounds(new Date().getTime(), 0), [])
  const previousMonthBounds = useMemo(() => monthBounds(new Date().getTime(), 1), [])

  const handleDateRangeChange = (range: 'this-month' | 'last-month' | 'all') => {
    if (range === 'this-month') {
      onFilter({ ...filter, from: currentMonthBounds.from, to: currentMonthBounds.to })
    } else if (range === 'last-month') {
      onFilter({ ...filter, from: previousMonthBounds.from, to: previousMonthBounds.to })
    } else {
      onFilter({ ...filter, from: null, to: null })
    }
  }

  const currentDateRange =
    filter.from === currentMonthBounds.from && filter.to === currentMonthBounds.to
      ? 'this-month'
      : filter.from === previousMonthBounds.from && filter.to === previousMonthBounds.to
        ? 'last-month'
        : 'all'

  const uid = useId()
  const field = (key: string, label: string, control: (id: string) => React.ReactNode) => {
    const id = `${uid}-${key}`
    return (
      <Field className="gap-1">
        <FieldLabel htmlFor={id} className="text-xs">{label}</FieldLabel>
        {control(id)}
      </Field>
    )
  }

  const direction = filter.direction ?? 'all'

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {field('category', 'Category', id => (
        <NativeSelect
          id={id}
          value={filter.categoryName ?? ''}
          onChange={e => onFilter({ ...filter, categoryName: e.target.value === '' ? null : e.target.value === '__UNCATEGORIZED__' ? 'Uncategorized' : e.target.value })}
          className={FIELD_NATIVE_SELECT}
        >
          <NativeSelectOption value="">All categories</NativeSelectOption>
          <NativeSelectOption value="__UNCATEGORIZED__">Uncategorized</NativeSelectOption>
          {spendCats.length > 0 && (
            <NativeSelectOptGroup label="Spend">
              {spendCats.map(c => <NativeSelectOption key={c.id} value={c.name}>{c.name}</NativeSelectOption>)}
            </NativeSelectOptGroup>
          )}
          {incomeCats.length > 0 && (
            <NativeSelectOptGroup label="Income">
              {incomeCats.map(c => <NativeSelectOption key={c.id} value={c.name}>{c.name}</NativeSelectOption>)}
            </NativeSelectOptGroup>
          )}
        </NativeSelect>
      ))}

      {field('when', 'When', id => (
        <NativeSelect id={id} value={currentDateRange} onChange={e => handleDateRangeChange(e.target.value as 'this-month' | 'last-month' | 'all')} className={FIELD_NATIVE_SELECT}>
          <NativeSelectOption value="all">All time</NativeSelectOption>
          <NativeSelectOption value="this-month">This month</NativeSelectOption>
          <NativeSelectOption value="last-month">Last month</NativeSelectOption>
        </NativeSelect>
      ))}

      {field('source', 'Came from', id => (
        <NativeSelect
          id={id}
          value={filter.source ?? ''}
          onChange={e => onFilter({ ...filter, source: e.target.value === '' ? null : (e.target.value as MoneyEntryRow['source']) })}
          className={FIELD_NATIVE_SELECT}
        >
          <NativeSelectOption value="">Anywhere</NativeSelectOption>
          {sources.filter(s => s !== 'all').map(s => <NativeSelectOption key={s} value={s}>{SOURCE_LABEL[s as MoneyEntryRow['source']]}</NativeSelectOption>)}
        </NativeSelect>
      ))}

      {field('tag', 'Tag', id => (
        <NativeSelect id={id} value={filter.tag ?? ''} onChange={e => onFilter({ ...filter, tag: e.target.value === '' ? null : e.target.value })} className={FIELD_NATIVE_SELECT}>
          <NativeSelectOption value="">Any tag</NativeSelectOption>
          {distinctTags.map(tag => <NativeSelectOption key={tag} value={tag}>{tag}</NativeSelectOption>)}
        </NativeSelect>
      ))}

      <FieldSet className="gap-1">
        <FieldLegend variant="label" className="mb-0 text-xs font-normal text-muted-foreground">Type</FieldLegend>
        <ToggleGroup
          aria-label="Type"
          spacing={1}
          value={[direction]}
          onValueChange={v => { const d = v[0] as 'all' | 'out' | 'in' | undefined; if (d) onFilter({ ...filter, direction: d === 'all' ? null : d }) }}
          className="glass-soft w-full rounded-lg p-1"
        >
          {([['all', 'All'], ['out', 'Spent'], ['in', 'Earned']] as const).map(([d, label]) => (
            <ToggleGroupItem
              key={d}
              value={d}
              className="h-10 flex-1 text-muted-foreground hover:bg-transparent hover:text-foreground aria-pressed:bg-accent aria-pressed:text-foreground"
            >
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FieldSet>

      {field('sort', 'Sort', id => (
        <NativeSelect id={id} value={sort} onChange={e => onSort(e.target.value as MoneySort)} className={FIELD_NATIVE_SELECT}>
          <NativeSelectOption value="date-desc">Newest first</NativeSelectOption>
          <NativeSelectOption value="date-asc">Oldest first</NativeSelectOption>
          <NativeSelectOption value="amount-desc">Largest first</NativeSelectOption>
          <NativeSelectOption value="amount-asc">Smallest first</NativeSelectOption>
        </NativeSelect>
      ))}
    </div>
  )
}
