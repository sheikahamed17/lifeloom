'use client'

import { ChevronRight, Target } from 'lucide-react'
import { useMemo } from 'react'
import Link from 'next/link'
import { IconTile } from '@/components/shared/icon-tile'
import { buttonVariants } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription } from '@/components/ui/empty'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { useGoals } from '@/hooks/use-goals'
import { useAccounts } from '@/hooks/use-accounts'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useExpenseShares } from '@/hooks/use-expense-shares'
import { withSettlements } from '@/lib/shares'
import { useTransfers } from '@/hooks/use-transfers'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useFxRates } from '@/hooks/use-fx-rates'
import { convertViaRates } from '@/lib/fx'
import { currencySymbol } from '@/lib/currency'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { goalProgress } from '@/lib/goals'
import type { AccountLike } from '@/lib/accounts'

type Props = { userId: string }

export function GoalsWidget({ userId }: Props) {
  const goals = useGoals(userId)
  const accounts = useAccounts(userId)
  const entriesRaw = useMoneyEntries(userId)
  const shares = useExpenseShares(userId)
  const entries = useMemo(() => withSettlements(entriesRaw, shares), [entriesRaw, shares])
  const transfers = useTransfers(userId)
  const { prefs } = useUserPrefs()
  const { rates } = useFxRates([...SUPPORTED_CURRENCIES])

  // toAcct: convert entry amount to its account's currency
  const toAcct = useMemo(
    () => (entry: typeof entries[0]): number => {
      if (!entry.account_id) return 0
      const acct = accounts.find(a => a.id === entry.account_id)
      if (!acct) return 0

      if (entry.currency === acct.currency) {
        return entry.amount
      }
      // Entry currency differs from account currency; convert
      return (
        convertViaRates(
          entry.amount,
          entry.currency,
          acct.currency,
          entry.occurred_at,
          rates,
          prefs.fx_overrides ?? {},
        )?.amount ?? 0
      )
    },
    [accounts, rates, prefs.fx_overrides],
  )

  // Map AccountRow to AccountLike for goalProgress
  const accountLikes = useMemo(
    () =>
      accounts.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        opening_balance: a.opening_balance,
        currency: a.currency,
        icon: a.icon,
      })) as AccountLike[],
    [accounts],
  )

  if (goals.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Goals</h2>
        <Empty className="p-2">
          <EmptyDescription>Set a savings target (a trip, a new laptop) and watch your progress here.</EmptyDescription>
          <EmptyContent>
            <Link href="/settings/goals" className={cn(buttonVariants({ variant: 'link' }), 'h-11 self-center px-0')}>
              Add a goal<ChevronRight className="size-4" aria-hidden />
            </Link>
          </EmptyContent>
        </Empty>
      </div>
    )
  }

  const fmt = (amt: number, cur: string) =>
    `${currencySymbol(cur)}${(amt / (cur === 'JPY' ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Goals</h2>
      {goals.map(goal => {
        const p = goalProgress(goal, accountLikes, entries, transfers, toAcct)
        const pctDisplay = Math.round(p.pct)

        return (
          <div key={goal.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-3">
                <IconTile emoji={goal.icon} icon={Target} size="sm" />
                <span className="truncate">{goal.name}</span>
              </span>
              <span className="tabular-nums text-xs tabular-nums text-muted-foreground">
                {fmt(p.current, goal.currency)} of {fmt(goal.target_amount, goal.currency)}
              </span>
            </div>
            <Progress
              value={Math.min(p.pct, 100)}
              aria-label={`${goal.name} progress ${pctDisplay}%`}
              className="[&_[data-slot=progress-indicator]]:bg-accent-2 [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-track]]:bg-accent"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{pctDisplay}%</span>
              {p.remaining > 0 && (
                <span>{fmt(p.remaining, goal.currency)} to go</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
