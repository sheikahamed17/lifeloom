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
import { netWorth, type AccountLike } from '@/lib/accounts'

type Props = { userId: string }

export function AccountsWidget({ userId }: Props) {
  const accounts = useAccounts(userId)
  const entriesRaw = useMoneyEntries(userId)
  const shares = useExpenseShares(userId)
  // Ledger view: full amounts, plus each settled share as a credit into the account it landed in.
  const entries = useMemo(() => withSettlements(entriesRaw, shares), [entriesRaw, shares])
  const transfers = useTransfers(userId)
  const { prefs } = useUserPrefs()
  const { rates } = useFxRates([...SUPPORTED_CURRENCIES])

  // toAcct: convert entry amount to its account's currency
  // Most entries will already be in the account's currency, but handle FX if needed
  const toAcct = useMemo(
    () => (entry: typeof entries[0], acct: AccountLike) => {
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
    [rates, prefs.fx_overrides],
  )

  // toPrimary: convert account balance (in account currency) to primary currency
  const toPrimary = useMemo(
    () => (balance: number, acctCurrency: string) => {
      if (acctCurrency === prefs.primary_currency) {
        return balance
      }
      // Need to convert from account currency to primary
      // Use a reference date (now) since we're looking at aggregated balances, not a specific entry
      const now = new Date().toISOString()
      return convertViaRates(balance, acctCurrency, prefs.primary_currency, now, rates, prefs.fx_overrides ?? {})?.amount ?? 0
    },
    [prefs.primary_currency, rates, prefs.fx_overrides],
  )

  const nw = useMemo(() => {
    // Build a toAcct wrapper that captures each account
    const toAcctForNetWorth = (entry: typeof entries[0]) => {
      // Find the account for this entry
      if (!entry.account_id) return 0
      const acct = accounts.find(a => a.id === entry.account_id)
      if (!acct) return 0
      return toAcct(entry, acct)
    }
    return netWorth(accounts, entries, transfers, toAcctForNetWorth, toPrimary)
  }, [accounts, entries, transfers, toAcct, toPrimary])

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
        <p>Add accounts in Settings → Accounts</p>
        <Link
          href="/settings/accounts"
          className="text-xs text-blue-500 hover:underline"
        >
          Go to Settings
        </Link>
      </div>
    )
  }

  const fmt = (amt: number) =>
    (amt / (prefs.primary_currency === 'JPY' ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })
  const symbol = currencySymbol(prefs.primary_currency)
  // Per-account rows are in each account's OWN currency (netWorth keeps them
  // unconverted); format with that account's symbol/divisor, not the primary's.
  const fmtIn = (amt: number, cur: string) =>
    `${currencySymbol(cur)}${(amt / (cur === 'JPY' ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

  return (
    <div className="flex flex-col gap-4">
      {/* Net worth headline */}
      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Net worth</span>
        <div className="text-2xl font-bold font-mono">
          {symbol}
          {fmt(nw.net)}
        </div>
      </div>

      {/* Per-account list */}
      <div className="flex flex-col gap-2">
        {/* Assets section */}
        {nw.perAccount
          .filter(a => a.type === 'asset')
          .map(acct => (
            <div key={acct.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                {acct.icon && <span>{acct.icon}</span>}
                <span>{acct.name}</span>
              </div>
              <span className="font-mono">
                {fmtIn(acct.balance, acct.currency)}
              </span>
            </div>
          ))}

        {/* Liabilities section */}
        {nw.perAccount
          .filter(a => a.type === 'liability')
          .length > 0 && (
          <div className="border-t pt-2">
            <div className="text-xs font-medium text-muted-foreground mb-2">Owed</div>
            {nw.perAccount
              .filter(a => a.type === 'liability')
              .map(acct => (
                <div key={acct.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {acct.icon && <span>{acct.icon}</span>}
                    <span>{acct.name}</span>
                  </div>
                  <span className="font-mono">
                    {fmtIn(acct.balance, acct.currency)}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>

      {accounts.length > 0 && (
        <div className="border-t pt-2">
          <Link
            href="/settings/transfers"
            className="text-xs text-blue-500 hover:underline"
          >
            Transfer →
          </Link>
        </div>
      )}
    </div>
  )
}
