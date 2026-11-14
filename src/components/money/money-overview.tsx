'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { MoneyCard } from '@/components/money/money-card'
import { BudgetSection } from '@/components/money/budget-section'
import { CardsSection } from '@/components/money/cards-section'
import { DigestCard } from '@/components/insights/digest-card'
import { AccountsWidget } from '@/components/money/accounts-widget'
import { GoalsWidget } from '@/components/money/goals-widget'
import { UpcomingWidget } from '@/components/money/upcoming-widget'
import { OwedWidget } from '@/components/money/owed-widget'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useExpenseShares } from '@/hooks/use-expense-shares'
import { useAllPeople } from '@/hooks/use-all-people'
import { useBudgets } from '@/hooks/use-budgets'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useFxRates } from '@/hooks/use-fx-rates'
import { withYourShare, owedByPerson, owedTotal } from '@/lib/shares'
import { computeBudgetProgress, yearMonthInTz } from '@/lib/budget-exec'
import { convertViaRates } from '@/lib/fx'
import { formatMinor } from '@/lib/currency'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { db, type MoneyEntryRow } from '@/lib/dexie'

const STACK = 'flex flex-col gap-8 lg:gap-10'

// A row that leads somewhere or opens something: ruled, on the page ground.
const ROW = 'flex min-h-14 w-full items-center gap-3 border-b border-border py-2.5 text-left outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'

/** Budgets, owed, cards and debts, goals: the parts of the overview that are not on the mockup's first screen. */
function MoreSections({ userId }: { userId: string }) {
  return (
    <>
      <BudgetSection userId={userId} />
      <OwedWidget userId={userId} />
      <CardsSection userId={userId} />
      <GoalsWidget userId={userId} />
    </>
  )
}

/**
 * Everything the old /dashboard showed that is about money, in one place (owner
 * decision, 13 Nov 2026), as ruled sections: where it went, coming up, accounts,
 * then budgets, owed, cards and debts, and goals. This is the desktop right column;
 * the month's headline figure lives in `MonthPanel`.
 */
export function MoneyOverview({ userId, onSelectCategory, withDigest = false }: { userId: string; onSelectCategory?: (name: string) => void; withDigest?: boolean }) {
  return (
    <div className={STACK}>
      {withDigest && <DigestCard userId={userId} />}
      <MoneyCard userId={userId} onSelectCategory={onSelectCategory} />
      <UpcomingWidget userId={userId} />
      <AccountsWidget userId={userId} />
      <MoreSections userId={userId} />
    </div>
  )
}

/**
 * Phone Money home, under the panel and the review queue: where it went and what is
 * coming up, with budgets, accounts and goals one tap deeper so the entries stay close.
 */
export function MonthSummary({ userId, onSelectCategory }: { userId: string; onSelectCategory?: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const { prefs } = useUserPrefs()
  const { rates } = useFxRates([...SUPPORTED_CURRENCIES])
  const primary = prefs.primary_currency
  const shares = useExpenseShares(userId)
  const allRaw = useMoneyEntries(userId)
  const all = useMemo(() => withYourShare(allRaw, shares), [allRaw, shares])
  const people = useAllPeople(userId)
  const budgets = useBudgets(userId)

  const toPrimary = useMemo(() => (e: MoneyEntryRow): number =>
    e.currency === primary ? e.amount : convertViaRates(e.amount, e.currency, primary, e.occurred_at, rates, prefs.fx_overrides ?? {})?.amount ?? 0,
  [primary, rates, prefs.fx_overrides])

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

  // What the closed row says about what is inside it. Every figure carries its name.
  const inside = [
    budgetState.total > 0 ? `${budgetState.onTrack} of ${budgetState.total} budgets on track` : null,
    owed > 0 ? `${formatMinor(owed, primary, 0)} owed to you` : null,
  ].filter(Boolean).join(', ')

  return (
    <div className={STACK}>
      {freshDigest && (
        <Link href={`/insights/${freshDigest.id}`} className={cn(ROW, 'border-t text-[15px] font-medium')}>
          <span className="min-w-0 flex-1">Your week in review is ready</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      )}
      <MoneyCard userId={userId} onSelectCategory={onSelectCategory} />
      <UpcomingWidget userId={userId} />
      <AccountsWidget userId={userId} />
      <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col">
        <CollapsibleTrigger className={cn(ROW, 'border-t')}>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-semibold">{open ? 'Hide budgets, debts and goals' : 'Budgets, debts and goals'}</span>
            {inside && <span className="text-[13px] tabular-nums text-muted-foreground">{inside}</span>}
          </span>
          <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden />
        </CollapsibleTrigger>
        <CollapsibleContent id="money-overview">
          <div className={cn(STACK, 'pt-8')}>
            <MoreSections userId={userId} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
