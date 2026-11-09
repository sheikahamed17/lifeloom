'use client'

import { useMemo, useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
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
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { computeBudgetProgress, yearMonthInTz } from '@/lib/budget-exec'
import type { MoneyEntryRow } from '@/lib/dexie'

type Props = { userId: string }

const STATE_CLASS = {
  ok:   'bg-accent-2',
  warn: 'bg-warning',
  over: 'bg-destructive',
} as const

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
  const budgets = useBudgets(userId)
  const spendCats = useCategories(userId, 'spend')
  const entriesRaw = useMoneyEntries(userId)
  const shares = useExpenseShares(userId)
  // Budgets count your share of a shared entry, not the part others owe you.
  const entries = useMemo(() => withYourShare(entriesRaw, shares), [entriesRaw, shares])
  const { prefs } = useUserPrefs()
  const { rates } = useFxRates([...SUPPORTED_CURRENCIES])
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
    <section className="glass-soft rounded-2xl p-3 flex flex-col gap-3" aria-label="Budgets">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Budgets</h2>
        {unbudgeted.length > 0 && (
          <button
            type="button"
            aria-label="Add budget"
            className="flex items-center gap-1 min-h-[44px] px-2 text-xs text-accent-2 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
            onClick={() => setAdding(a => !a)}
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        )}
      </div>

      {progress.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">No budgets yet — add one or say &quot;set a budget for food 8000&quot;.</p>
      )}

      <ul className="flex flex-col gap-2">
        {progress.map(p => {
          const cat = catById.get(p.categoryId)
          return (
            <li key={p.categoryId} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1">
                  <span>{cat?.icon ?? ''}</span>
                  <span>{cat?.name ?? 'Category'}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {fmt(p.spent, primary)} / {fmt(p.limit, primary)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove budget for ${cat?.name ?? 'category'}`}
                    className="min-h-[44px] px-1 text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
                    onClick={() => removeBudget(userId, p.categoryId)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-white/10"
                role="progressbar"
                aria-valuenow={p.pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${cat?.name ?? 'Category'} budget ${p.pct}%`}
              >
                <div className={`h-full ${STATE_CLASS[p.state]}`} style={{ width: `${Math.min(p.pct, 100)}%` }} />
              </div>
            </li>
          )
        })}
      </ul>

      {adding && (
        <div className="flex flex-col gap-2 border-t border-white/10 pt-2">
          <select
            aria-label="Category"
            className="glass-soft rounded-lg px-2 py-2 min-h-[44px] text-xs bg-transparent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
            value={newCatId}
            onChange={e => setNewCatId(e.target.value)}
          >
            <option value="">Select a category…</option>
            {unbudgeted.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <input
              aria-label="Monthly amount"
              inputMode="decimal"
              placeholder={`Monthly limit (${currencySymbol(primary)})`}
              className="glass-soft flex-1 rounded-lg px-2 py-2 min-h-[44px] text-xs bg-transparent focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
              value={newAmount}
              onChange={e => setNewAmount(e.target.value)}
            />
            <button
              type="button"
              aria-label="Save budget"
              className="min-h-[44px] px-3 text-xs rounded-lg bg-accent-2/20 text-accent-2 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none disabled:opacity-40"
              disabled={!newCatId || !newAmount}
              onClick={submitNew}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
