'use client'

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
      <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
        <p>Add goals in Settings → Goals</p>
        <Link
          href="/settings/goals"
          className="text-xs text-blue-500 hover:underline"
        >
          Go to Settings
        </Link>
      </div>
    )
  }

  const fmt = (amt: number, cur: string) =>
    `${currencySymbol(cur)}${(amt / (cur === 'JPY' ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

  return (
    <div className="flex flex-col gap-3">
      {goals.map(goal => {
        const p = goalProgress(goal, accountLikes, entries, transfers, toAcct)
        const pctDisplay = Math.round(p.pct)

        return (
          <div key={goal.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1">
                {goal.icon && <span>{goal.icon}</span>}
                <span>{goal.name}</span>
              </span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {fmt(p.current, goal.currency)} / {fmt(goal.target_amount, goal.currency)}
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
                <span>remaining {fmt(p.remaining, goal.currency)}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
