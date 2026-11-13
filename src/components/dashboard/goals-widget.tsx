'use client'

import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import Link from 'next/link'
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
        <p className="text-sm text-muted-foreground">Set a savings target (a trip, a new laptop) and watch your progress here.</p>
        <Link href="/settings/goals" className="inline-flex min-h-11 items-center gap-1 self-start rounded-lg text-sm text-accent-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent-2">
          Add a goal<ChevronRight className="size-4" aria-hidden />
        </Link>
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
              <span className="flex min-w-0 items-center gap-1.5">
                {goal.icon && <span aria-hidden="true">{goal.icon}</span>}
                <span className="truncate">{goal.name}</span>
              </span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {fmt(p.current, goal.currency)} of {fmt(goal.target_amount, goal.currency)}
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuenow={pctDisplay}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${goal.name} progress ${pctDisplay}%`}
            >
              <div
                className="h-full bg-accent-2"
                style={{ width: `${Math.min(p.pct, 100)}%` }}
              />
            </div>
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
