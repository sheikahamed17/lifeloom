'use client'

import { useId, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { db } from '@/lib/dexie'
import { useBudgets } from '@/hooks/use-budgets'
import { useCategories } from '@/hooks/use-categories'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useExpenseShares } from '@/hooks/use-expense-shares'
import { withYourShare } from '@/lib/shares'
import { useFxRates } from '@/hooks/use-fx-rates'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { convertViaRates } from '@/lib/fx'
import { currencySymbol } from '@/lib/currency'
import { EMPTY_NOTE, HEAD_LINK, SectionHeading } from '@/components/money/section-heading'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { computeBudgetProgress, yearMonthInTz } from '@/lib/budget-exec'
import type { MoneyEntryRow } from '@/lib/dexie'
import { useUndo } from '@/components/providers/undo-provider'

type Props = { userId: string }

// Ink while there is room; the attention colour once a budget is nearly or fully spent.
const STATE_CLASS = {
  ok:   '[&_[data-slot=progress-indicator]]:bg-foreground',
  warn: '[&_[data-slot=progress-indicator]]:bg-warning',
  over: '[&_[data-slot=progress-indicator]]:bg-warning',
} as const

const LABEL = 'text-[13px] font-semibold text-muted-foreground'

function fmt(amountMinor: number, currency: string): string {
  const major = amountMinor / (currency === 'JPY' ? 1 : 100)
  return `${currencySymbol(currency)}${major.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

async function writeBudget(userId: string, categoryId: string, amount: number, currency: string) {
  const existing = await db.budgets.get(categoryId)
  const op = await generateOp({
    entity_kind: 'budget', entity_id: categoryId,
    op_type: existing ? 'update' : 'create',
    payload: { category_id: categoryId, amount, currency },
    user_id: userId,
  })
  await applyLocalOp(op)
  pushPullOnce({ userId }).catch(err => console.error('sync', err))
}

async function removeBudget(userId: string, categoryId: string) {
  const op = await generateOp({
    entity_kind: 'budget', entity_id: categoryId,
    op_type: 'delete', payload: {}, user_id: userId,
  })
  await applyLocalOp(op)
  pushPullOnce({ userId }).catch(err => console.error('sync', err))
}

export function BudgetSection({ userId }: Props) {
  const headingId = useId()
  const formId = useId()
  const budgets = useBudgets(userId)
  const spendCats = useCategories(userId, 'spend')
  const entriesRaw = useMoneyEntries(userId)
  const shares = useExpenseShares(userId)
  // Budgets count your share of a shared entry, not the part others owe you.
  const entries = useMemo(() => withYourShare(entriesRaw, shares), [entriesRaw, shares])
  const { prefs } = useUserPrefs()
  const { rates } = useFxRates([...SUPPORTED_CURRENCIES])
  const undo = useUndo()
  const [adding, setAdding] = useState(false)
  const [newCatId, setNewCatId] = useState('')
  const [newAmount, setNewAmount] = useState('')

  const primary = prefs.primary_currency
  const monthKey = useMemo(() => yearMonthInTz(new Date().toISOString(), prefs.tz), [prefs.tz])

  const toPrimary = useMemo(() => (e: MoneyEntryRow): number => {
    if (e.currency === primary) return e.amount
    const conv = convertViaRates(e.amount, e.currency, primary, e.occurred_at, rates, prefs.fx_overrides ?? {})
    return conv ? conv.amount : e.amount
  }, [primary, rates, prefs.fx_overrides])

  const progress = useMemo(
    () => computeBudgetProgress(entries, budgets, monthKey, prefs.tz, toPrimary),
    [entries, budgets, monthKey, prefs.tz, toPrimary],
  )
  const catById = useMemo(() => new Map(spendCats.map(c => [c.id, c])), [spendCats])
  const unbudgeted = spendCats.filter(c => !budgets.some(b => b.category_id === c.id))

  async function submitNew() {
    const major = parseFloat(newAmount)
    if (!newCatId || !isFinite(major) || major <= 0) return
    const minor = Math.round(major * (primary === 'JPY' ? 1 : 100))
    await writeBudget(userId, newCatId, minor, primary)
    setAdding(false); setNewCatId(''); setNewAmount('')
  }

  return (
    <section aria-labelledby={headingId}>
      <Collapsible open={adding} onOpenChange={setAdding} className="flex flex-col">
        <SectionHeading
          id={headingId}
          aside={unbudgeted.length > 0 && (
            <CollapsibleTrigger aria-label="Add budget" className={HEAD_LINK}>
              {adding ? 'Close' : 'Add'}
            </CollapsibleTrigger>
          )}
        >
          Budgets
        </SectionHeading>

        {progress.length === 0 && !adding && (
          <p className={EMPTY_NOTE}>No budgets yet. Add one, or type “set a budget for food 8000” above.</p>
        )}

        <ul className="flex flex-col">
          {progress.map(p => {
            const cat = catById.get(p.categoryId)
            return (
              <li key={p.categoryId} className="flex flex-col border-b border-border pb-3.5">
                <div className="flex min-h-11 items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[15px] font-medium">{cat?.name ?? 'Category'}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className={cn('text-[13px] tabular-nums text-muted-foreground', p.state === 'over' && 'font-medium text-warning')}>
                      <span className={cn('font-semibold', p.state !== 'over' && 'text-foreground')}>{fmt(p.spent, primary)}</span> of {fmt(p.limit, primary)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      aria-label={`Remove budget for ${cat?.name ?? 'category'}`}
                      className="-mr-3 text-muted-foreground hover:bg-transparent hover:text-destructive"
                      onClick={async () => {
                        const limit = p.limit
                        await removeBudget(userId, p.categoryId)
                        undo.push(`Removed the ${cat?.name ?? 'category'} budget`, () => writeBudget(userId, p.categoryId, limit, primary))
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </span>
                </div>
                <Progress
                  value={Math.min(p.pct, 100)}
                  aria-label={`${cat?.name ?? 'Category'} budget ${p.pct}%`}
                  className={cn('[&_[data-slot=progress-indicator]]:rounded-full [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-track]]:bg-muted', STATE_CLASS[p.state])}
                />
              </li>
            )
          })}
        </ul>

        <CollapsibleContent>
          <div className="flex flex-col gap-4 pt-4">
            <Field className="gap-2">
              <FieldLabel htmlFor={`${formId}-category`} className={LABEL}>Category</FieldLabel>
              <NativeSelect
                id={`${formId}-category`}
                className="w-full"
                value={newCatId}
                onChange={e => setNewCatId(e.target.value)}
              >
                <NativeSelectOption value="">Select a category…</NativeSelectOption>
                {unbudgeted.map(c => <NativeSelectOption key={c.id} value={c.id}>{c.name}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
            <Field className="gap-2">
              <FieldLabel htmlFor={`${formId}-amount`} className={LABEL}>Monthly limit ({currencySymbol(primary)})</FieldLabel>
              <Input
                id={`${formId}-amount`}
                aria-label="Monthly amount"
                inputMode="decimal"
                value={newAmount}
                onChange={e => setNewAmount(e.target.value)}
              />
            </Field>
            <Button
              aria-label="Save budget"
              className="self-start"
              disabled={!newCatId || !newAmount}
              onClick={submitNew}
            >
              Save
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}
