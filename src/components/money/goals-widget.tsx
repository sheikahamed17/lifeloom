'use client'

import { useId, useMemo } from 'react'
import Link from 'next/link'
import { Progress } from '@/components/ui/progress'
import { EMPTY_NOTE, FOOT_LINK, HEAD_LINK, SectionHeading } from '@/components/money/section-heading'
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
  const headingId = useId()
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
      <section aria-labelledby={headingId} className="flex flex-col">
        <SectionHeading id={headingId}>Goals</SectionHeading>
        <p className={EMPTY_NOTE}>Set a savings target (a trip, a new laptop) and watch your progress here.</p>
        <Link href="/settings/goals" className={FOOT_LINK}>Add a goal</Link>
      </section>
    )
  }

  const fmt = (amt: number, cur: string) =>
    `${currencySymbol(cur)}${(amt / (cur === 'JPY' ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      <SectionHeading id={headingId} aside={<Link href="/settings/goals" className={HEAD_LINK}>Manage</Link>}>
        Goals
      </SectionHeading>
      <ul className="flex flex-col">
        {goals.map(goal => {
          const p = goalProgress(goal, accountLikes, entries, transfers, toAcct)
          const pctDisplay = Math.round(p.pct)

          return (
            <li key={goal.id} className="flex flex-col gap-2 border-b border-border py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[15px] font-medium">{goal.name}</span>
                <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
                  <span className="font-semibold text-foreground">{fmt(p.current, goal.currency)}</span> of {fmt(goal.target_amount, goal.currency)}
                </span>
              </div>
              <Progress
                value={Math.min(p.pct, 100)}
                aria-label={`${goal.name} progress ${pctDisplay}%`}
                className="[&_[data-slot=progress-indicator]]:rounded-full [&_[data-slot=progress-indicator]]:bg-foreground [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-track]]:bg-muted"
              />
              <div className="flex items-center justify-between text-[13px] tabular-nums text-muted-foreground">
                <span>{pctDisplay}%</span>
                {p.remaining > 0 && (
                  <span>{fmt(p.remaining, goal.currency)} to go</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
