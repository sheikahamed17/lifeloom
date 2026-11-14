'use client'

import { formatDay } from '@/lib/format'
import { useId, useMemo } from 'react'
import Link from 'next/link'
import { HEAD_LINK, SectionHeading } from '@/components/money/section-heading'
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
import { cardSummary } from '@/lib/card-summary'
import type { AccountLike } from '@/lib/accounts'
import type { MoneyEntryRow } from '@/lib/dexie'

type Props = { userId: string }

// "Cards & debts" — one row per liability account: what's owed now, this month's
// spend charged to it, and the last payment. Read-only aggregation over existing
// accounts/money/transfers; renders nothing when there are no liability accounts.
export function CardsSection({ userId }: Props) {
  const headingId = useId()
  const accounts = useAccounts(userId)
  const entriesRaw = useMoneyEntries(userId)
  const shares = useExpenseShares(userId)
  const entries = useMemo(() => withSettlements(entriesRaw, shares), [entriesRaw, shares])
  const transfers = useTransfers(userId)
  const { prefs } = useUserPrefs()
  const { rates } = useFxRates([...SUPPORTED_CURRENCIES])
  const now = useMemo(() => new Date().toISOString(), [])

  const liabilities = useMemo(() => accounts.filter(a => a.type === 'liability'), [accounts])

  const toAcct = useMemo(
    () => (entry: MoneyEntryRow, acct: AccountLike) =>
      entry.currency === acct.currency
        ? entry.amount
        : convertViaRates(entry.amount, entry.currency, acct.currency, entry.occurred_at, rates, prefs.fx_overrides ?? {})?.amount ?? 0,
    [rates, prefs.fx_overrides],
  )

  const summaries = useMemo(
    () => liabilities.map(acct => ({ acct, s: cardSummary(acct, entries, transfers, now, prefs.tz, (e: MoneyEntryRow) => toAcct(e, acct)) })),
    [liabilities, entries, transfers, now, prefs.tz, toAcct],
  )

  if (liabilities.length === 0) return null

  const fmtIn = (amt: number, cur: string) =>
    `${currencySymbol(cur)}${(amt / (cur === 'JPY' ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      <SectionHeading id={headingId}>Cards &amp; debts</SectionHeading>
      <ul className="flex flex-col">
        {summaries.map(({ acct, s }) => (
          <li key={acct.id} className="flex min-h-15 items-center gap-4 border-b border-border py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[15px] font-medium">{acct.name}</span>
              <span className="text-[13px] text-muted-foreground">
                This month <span className="tabular-nums">{fmtIn(s.monthSpend, acct.currency)}</span>
              </span>
              {s.recentPayments.length > 0 && (
                <span className="text-[13px] text-muted-foreground">
                  Last payment {fmtIn(s.recentPayments[0].amount, acct.currency)} on {formatDay(s.recentPayments[0].occurred_at)}
                </span>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="text-xs text-muted-foreground">You owe</span>
              <span className="text-[15px] font-semibold tabular-nums">{fmtIn(s.owed, acct.currency)}</span>
            </div>
            <Link href="/settings/transfers" className={HEAD_LINK}>Pay it off</Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
