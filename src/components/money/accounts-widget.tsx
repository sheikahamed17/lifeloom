'use client'

import { useId, useMemo } from 'react'
import Link from 'next/link'
import { EMPTY_NOTE, FOOT_LINK, HEAD_LINK, SectionHeading } from '@/components/money/section-heading'
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
  const headingId = useId()
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
      <section aria-labelledby={headingId} className="flex flex-col">
        <SectionHeading id={headingId}>Accounts</SectionHeading>
        <p className={EMPTY_NOTE}>Add your bank accounts and cards to see balances and net worth.</p>
        <Link href="/settings/accounts" className={FOOT_LINK}>Add an account</Link>
      </section>
    )
  }

  const fmt = (amt: number) =>
    (amt / (prefs.primary_currency === 'JPY' ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })
  const symbol = currencySymbol(prefs.primary_currency)
  // Per-account rows are in each account's OWN currency (netWorth keeps them
  // unconverted); format with that account's symbol/divisor, not the primary's.
  const fmtIn = (amt: number, cur: string) =>
    `${amt < 0 ? '−' : ''}${currencySymbol(cur)}${(Math.abs(amt) / (cur === 'JPY' ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

  const ROW = 'flex min-h-12 items-center justify-between gap-4 border-b border-border py-2 text-[15px]'
  const assets = nw.perAccount.filter(a => a.type === 'asset')
  const liabilities = nw.perAccount.filter(a => a.type === 'liability')

  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      <SectionHeading id={headingId} aside={<Link href="/settings/accounts" className={HEAD_LINK}>Manage</Link>}>
        Accounts
      </SectionHeading>

      <ul className="flex flex-col">
        {assets.map(acct => (
          <li key={acct.id} className={ROW}>
            <span className="min-w-0 truncate font-medium">{acct.name}</span>
            <span className="shrink-0 font-semibold tabular-nums">{fmtIn(acct.balance, acct.currency)}</span>
          </li>
        ))}
      </ul>

      {liabilities.length > 0 && (
        <>
          <h3 className="pb-1 pt-3.5 text-xs font-semibold text-muted-foreground">Cards and loans</h3>
          <ul className="flex flex-col border-t border-border">
            {liabilities.map(acct => (
              <li key={acct.id} className={ROW}>
                <span className="min-w-0 truncate font-medium">{acct.name}</span>
                {/* What is owed counts against net worth, so it reads as a minus. */}
                <span className="shrink-0 font-semibold tabular-nums">{fmtIn(-acct.balance, acct.currency)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className={ROW}>
        <span className="font-semibold">Net worth</span>
        <span className="shrink-0 text-base font-bold tabular-nums">
          {nw.net < 0 ? '−' : ''}{symbol}{fmt(Math.abs(nw.net))}
        </span>
      </div>

      <Link href="/settings/transfers" className={FOOT_LINK}>Move money between accounts</Link>
    </section>
  )
}
