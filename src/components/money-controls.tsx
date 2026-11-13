'use client'

import { useMemo } from 'react'
import { useCategories } from '@/hooks/use-categories'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import type { MoneyEntryRow } from '@/lib/dexie'
import type { MoneyFilter, MoneySort } from '@/lib/money-filter-sort'
import { monthBounds } from '@/lib/money-filter-sort'
import { FIELD_SELECT } from '@/components/sort-control'

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

  const field = (label: string, control: React.ReactNode) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {control}
    </label>
  )

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {field('Category', (
        <select
          value={filter.categoryName ?? ''}
          onChange={e => onFilter({ ...filter, categoryName: e.target.value === '' ? null : e.target.value === '__UNCATEGORIZED__' ? 'Uncategorized' : e.target.value })}
          className={FIELD_SELECT}
        >
          <option value="">All categories</option>
          <option value="__UNCATEGORIZED__">Uncategorized</option>
          {spendCats.length > 0 && (
            <optgroup label="Spend">
              {spendCats.map(c => <option key={c.id} value={c.name}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
            </optgroup>
          )}
          {incomeCats.length > 0 && (
            <optgroup label="Income">
              {incomeCats.map(c => <option key={c.id} value={c.name}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
            </optgroup>
          )}
        </select>
      ))}

      {field('When', (
        <select value={currentDateRange} onChange={e => handleDateRangeChange(e.target.value as 'this-month' | 'last-month' | 'all')} className={FIELD_SELECT}>
          <option value="all">All time</option>
          <option value="this-month">This month</option>
          <option value="last-month">Last month</option>
        </select>
      ))}

      {field('Came from', (
        <select
          value={filter.source ?? ''}
          onChange={e => onFilter({ ...filter, source: e.target.value === '' ? null : (e.target.value as MoneyEntryRow['source']) })}
          className={FIELD_SELECT}
        >
          <option value="">Anywhere</option>
          {sources.filter(s => s !== 'all').map(s => <option key={s} value={s}>{SOURCE_LABEL[s as MoneyEntryRow['source']]}</option>)}
        </select>
      ))}

      {field('Tag', (
        <select value={filter.tag ?? ''} onChange={e => onFilter({ ...filter, tag: e.target.value === '' ? null : e.target.value })} className={FIELD_SELECT}>
          <option value="">Any tag</option>
          {distinctTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
        </select>
      ))}

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-xs text-muted-foreground">Type</legend>
        <div className="glass-soft flex gap-1 rounded-lg p-1">
          {(['all', 'out', 'in'] as const).map(d => {
            const pressed = (d === 'all' && filter.direction === null) || (d !== 'all' && filter.direction === d)
            return (
              <button
                key={d}
                type="button"
                aria-pressed={pressed}
                onClick={() => onFilter({ ...filter, direction: d === 'all' ? null : d })}
                className={`min-h-9 flex-1 rounded-md text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-2 ${pressed ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {d === 'all' ? 'All' : d === 'out' ? 'Spent' : 'Earned'}
              </button>
            )
          })}
        </div>
      </fieldset>

      {field('Sort', (
        <select value={sort} onChange={e => onSort(e.target.value as MoneySort)} className={FIELD_SELECT}>
          <option value="date-desc">Newest first</option>
          <option value="date-asc">Oldest first</option>
          <option value="amount-desc">Largest first</option>
          <option value="amount-asc">Smallest first</option>
        </select>
      ))}
    </div>
  )
}
