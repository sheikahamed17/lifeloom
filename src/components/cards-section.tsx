'use client'

import { formatDay } from '@/lib/format'
import { useMemo } from 'react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { cn } from '@/lib/utils'
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
    <Card role="region" aria-labelledby="cards-heading" className="gap-3 p-4">
      <h2 id="cards-heading" className="text-sm font-semibold">Cards &amp; debts</h2>
      <ul className="flex flex-col gap-2">
        {summaries.map(({ acct, s }) => (
          <li key={acct.id} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
            <Item size="xs" className="flex-nowrap items-start p-0">
              <ItemContent className="min-w-0 gap-1">
                <ItemTitle className="max-w-full text-sm font-normal">
                  {acct.icon && <span aria-hidden="true">{acct.icon}</span>}
                  <span className="truncate">{acct.name}</span>
                </ItemTitle>
                <ItemDescription className="text-xs">
                  This month <span className="font-mono tabular-nums">{fmtIn(s.monthSpend, acct.currency)}</span>
                </ItemDescription>
                {s.recentPayments.length > 0 && (
                  <ItemDescription className="text-xs">
                    Last payment {fmtIn(s.recentPayments[0].amount, acct.currency)} on {formatDay(s.recentPayments[0].occurred_at)}
                  </ItemDescription>
                )}
              </ItemContent>
              <ItemActions className="flex-col items-end gap-0">
                <span className="text-xs text-muted-foreground">You owe</span>
                <span className={`font-mono tabular-nums text-sm font-medium ${s.owed > 0 ? 'text-destructive' : 'text-income'}`}>
                  {fmtIn(s.owed, acct.currency)}
                </span>
                <Link
                  href="/settings/transfers"
                  className={cn(buttonVariants({ variant: 'ghost' }), '-mr-2 min-h-11 px-2 font-normal text-accent-2')}
                >
                  Pay it off
                </Link>
              </ItemActions>
            </Item>
          </li>
        ))}
      </ul>
    </Card>
  )
}
