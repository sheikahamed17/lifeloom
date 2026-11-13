'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { MoneyCard, currentPeriodRange } from '@/components/money-card'
import { BudgetSection } from '@/components/budget-section'
import { CardsSection } from '@/components/cards-section'
import { DigestCard } from '@/components/digest-card'
import { AccountsWidget } from '@/components/dashboard/accounts-widget'
import { GoalsWidget } from '@/components/dashboard/goals-widget'
import { UpcomingWidget } from '@/components/dashboard/upcoming-widget'
import { OwedWidget } from '@/components/dashboard/owed-widget'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useExpenseShares } from '@/hooks/use-expense-shares'
import { useAllCategories } from '@/hooks/use-all-categories'
import { useAllPeople } from '@/hooks/use-all-people'
import { useBudgets } from '@/hooks/use-budgets'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useFxRates } from '@/hooks/use-fx-rates'
import { withYourShare, owedByPerson, owedTotal } from '@/lib/shares'
import { computeSpendBreakdown } from '@/lib/spend-breakdown'
import { computeBudgetProgress, yearMonthInTz } from '@/lib/budget-exec'
import { makeCategoryResolver } from '@/lib/category-resolve'
import { convertViaRates } from '@/lib/fx'
import { formatMinor } from '@/lib/currency'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { db, type MoneyEntryRow } from '@/lib/dexie'

const CARD = 'glass rounded-2xl p-4'

/**
 * Everything the old /dashboard showed that is about money, in one place (owner
 * decision, 13 Nov 2026): Spent, Budgets, Owed, Cards & debts, Accounts,
 * Upcoming and Goals. The desktop right column shows it whole; the phone shows it
 * under "This month" when opened.
 */
export function MoneyOverview({ userId, onSelectCategory, withDigest = false }: { userId: string; onSelectCategory?: (name: string) => void; withDigest?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {withDigest && <DigestCard userId={userId} />}
      <MoneyCard userId={userId} onSelectCategory={onSelectCategory} />
      <BudgetSection userId={userId} />
      <section className={CARD} aria-label="Owed to you"><OwedWidget userId={userId} /></section>
      <CardsSection userId={userId} />
      <section className={CARD} aria-label="Accounts and net worth"><AccountsWidget userId={userId} /></section>
      <UpcomingWidget userId={userId} />
      <section className={CARD} aria-label="Savings goals"><GoalsWidget userId={userId} /></section>
    </div>
  )
}

/**
 * Phone Money home: one compact "This month" card (spent, budgets, owed, a fresh
 * digest) with the full Overview one tap deeper. Every figure carries its name.
 */
export function MonthSummary({ userId, onSelectCategory }: { userId: string; onSelectCategory?: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const { prefs } = useUserPrefs()
  const { rates } = useFxRates([...SUPPORTED_CURRENCIES])
  const primary = prefs.primary_currency
  const range = useMemo(() => currentPeriodRange('month'), [])
  const shares = useExpenseShares(userId)
  const monthRaw = useMoneyEntries(userId, range)
  const allRaw = useMoneyEntries(userId)
  const month = useMemo(() => withYourShare(monthRaw, shares), [monthRaw, shares])
  const all = useMemo(() => withYourShare(allRaw, shares), [allRaw, shares])
  const allCats = useAllCategories(userId)
  const people = useAllPeople(userId)
  const budgets = useBudgets(userId)

  const toPrimary = useMemo(() => (e: MoneyEntryRow): number =>
    e.currency === primary ? e.amount : convertViaRates(e.amount, e.currency, primary, e.occurred_at, rates, prefs.fx_overrides ?? {})?.amount ?? 0,
  [primary, rates, prefs.fx_overrides])
  const resolve = useMemo(() => makeCategoryResolver(allCats.map(c => ({ id: c.id, name: c.name, icon: c.icon, kind: c.kind }))), [allCats])

  const spent = useMemo(() => computeSpendBreakdown(month, { resolve, toPrimary }).spend, [month, resolve, toPrimary])
  const monthKey = useMemo(() => yearMonthInTz(new Date().toISOString(), prefs.tz), [prefs.tz])
  const budgetState = useMemo(() => {
    const p = computeBudgetProgress(all, budgets, monthKey, prefs.tz, toPrimary)
    return { total: p.length, onTrack: p.filter(b => b.state !== 'over').length }
  }, [all, budgets, monthKey, prefs.tz, toPrimary])
  const owed = useMemo(() => {
    const rows = owedByPerson(allRaw, shares, people)
    return owedTotal(rows, (amount, currency) =>
      currency === primary ? amount : convertViaRates(amount, currency, primary, new Date().toISOString(), rates, prefs.fx_overrides ?? {})?.amount ?? null).total
  }, [allRaw, shares, people, primary, rates, prefs.fx_overrides])

  // A digest written in the last 7 days earns a line here.
  const freshDigest = useLiveQuery(async () => {
    const [latest] = await db.insights.where('[user_id+starts_at]').between([userId], [userId, '￿']).reverse().limit(1).toArray()
    return latest && new Date().getTime() - new Date(latest.ends_at).getTime() <= 7 * 24 * 60 * 60 * 1000 ? latest : null
  }, [userId])

  const LINK = 'inline-flex min-h-11 items-center gap-1 rounded-lg px-2 -mx-2 text-sm outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-accent-2'

  return (
    <section aria-labelledby="month-heading" className="flex flex-col gap-3">
      <div className={`${CARD} flex flex-col gap-1`}>
        <h2 id="month-heading" className="text-sm font-semibold">This month</h2>
        <p className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-semibold tabular-nums">{formatMinor(spent, primary, 0)}</span>
          <span className="text-sm text-muted-foreground">spent</span>
        </p>
        <div className="flex flex-col">
          {budgetState.total > 0 && (
            <button type="button" className={LINK} aria-expanded={open} aria-controls="money-overview" onClick={() => setOpen(true)}>
              {budgetState.onTrack} of {budgetState.total} budgets on track
            </button>
          )}
          {owed > 0 && (
            <Link href="/settings/people" className={LINK}>
              <span className="font-mono tabular-nums">{formatMinor(owed, primary, 0)}</span> owed to you
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          )}
          {freshDigest && (
            <Link href={`/insights/${freshDigest.id}`} className={LINK}>
              Your week in review is ready
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          )}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="money-overview"
          onClick={() => setOpen(o => !o)}
          className="mt-1 flex min-h-11 items-center justify-between rounded-lg border-t border-white/10 pt-2 text-sm text-accent-2 outline-none focus-visible:ring-2 focus-visible:ring-accent-2"
        >
          {open ? 'Hide overview' : 'Overview: categories, budgets, accounts, goals'}
          <ChevronDown className={`size-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </div>
      {open && (
        <div id="money-overview">
          <MoneyOverview userId={userId} onSelectCategory={onSelectCategory} />
        </div>
      )}
    </section>
  )
}
