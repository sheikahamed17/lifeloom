'use client'

import { useMemo } from 'react'
import Link from 'next/link'
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
    <section className="glass-soft rounded-2xl p-3 flex flex-col gap-3" aria-label="Cards and debts">
      <h2 className="text-sm font-medium">Cards &amp; debts</h2>
      <ul className="flex flex-col gap-2">
        {summaries.map(({ acct, s }) => (
          <li key={acct.id} className="flex flex-col gap-1 border-t border-white/10 pt-2 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-sm min-w-0">
                {acct.icon && <span>{acct.icon}</span>}
                <span className="truncate">{acct.name}</span>
              </span>
              <span className="flex flex-col items-end">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Owed</span>
                <span className={`font-mono tabular-nums text-sm font-medium ${s.owed > 0 ? 'text-destructive' : 'text-income'}`}>
                  {fmtIn(s.owed, acct.currency)}
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>This month <span className="font-mono tabular-nums">{fmtIn(s.monthSpend, acct.currency)}</span></span>
              <Link
                href="/settings/transfers"
                className="min-h-[44px] flex items-center text-accent-2 hover:underline focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded"
              >
                Pay →
              </Link>
            </div>
            {s.recentPayments.length > 0 && (
              <div className="text-[10px] text-muted-foreground">
                Last payment {fmtIn(s.recentPayments[0].amount, acct.currency)} · {s.recentPayments[0].occurred_at.slice(0, 10)}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
