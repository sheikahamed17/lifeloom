'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { MoneyCard, currentPeriodRange } from '@/components/money/money-card'
import { BudgetSection } from '@/components/money/budget-section'
import { CardsSection } from '@/components/money/cards-section'
import { DigestCard } from '@/components/insights/digest-card'
import { AccountsWidget } from '@/components/money/accounts-widget'
import { GoalsWidget } from '@/components/money/goals-widget'
import { UpcomingWidget } from '@/components/money/upcoming-widget'
import { OwedWidget } from '@/components/money/owed-widget'
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

const CARD = 'p-4'

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
      <Card role="region" aria-label="Owed to you" className={CARD}><OwedWidget userId={userId} /></Card>
      <CardsSection userId={userId} />
      <Card role="region" aria-label="Accounts and net worth" className={CARD}><AccountsWidget userId={userId} /></Card>
      <UpcomingWidget userId={userId} />
      <Card role="region" aria-label="Savings goals" className={CARD}><GoalsWidget userId={userId} /></Card>
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

  const LINK = cn(buttonVariants({ variant: 'ghost' }), '-mx-2 h-auto min-h-11 justify-start px-2 font-normal')

  return (
    <section aria-labelledby="month-heading">
      <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-3">
        <Card className={`${CARD} gap-1`}>
          <h2 id="month-heading" className="text-sm font-semibold">This month</h2>
          <p className="flex items-baseline gap-2">
            <span className="tabular-nums text-2xl font-semibold tabular-nums">{formatMinor(spent, primary, 0)}</span>
            <span className="text-sm text-muted-foreground">spent</span>
          </p>
          <div className="flex flex-col">
            {budgetState.total > 0 && (
              <Button variant="ghost" className="-mx-2 h-auto min-h-11 justify-start px-2 font-normal" aria-expanded={open} aria-controls="money-overview" onClick={() => setOpen(true)}>
                {budgetState.onTrack} of {budgetState.total} budgets on track
              </Button>
            )}
            {owed > 0 && (
              <Link href="/settings/people" className={LINK}>
                <span className="tabular-nums">{formatMinor(owed, primary, 0)}</span> owed to you
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
          <Separator className="mt-1" />
          <CollapsibleTrigger
            className={cn(buttonVariants({ variant: 'ghost' }), 'h-auto min-h-11 justify-between px-2 -mx-2 text-accent-2')}
          >
            {open ? 'Hide overview' : 'Overview: categories, budgets, accounts, goals'}
            <ChevronDown className={`size-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden />
          </CollapsibleTrigger>
        </Card>
        <CollapsibleContent id="money-overview">
          <MoneyOverview userId={userId} onSelectCategory={onSelectCategory} />
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}
