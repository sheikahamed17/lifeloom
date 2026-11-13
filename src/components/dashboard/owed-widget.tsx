'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight, Users } from 'lucide-react'
import { useExpenseShares } from '@/hooks/use-expense-shares'
import { useAllPeople } from '@/hooks/use-all-people'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useFxRates } from '@/hooks/use-fx-rates'
import { owedByPerson, owedTotal } from '@/lib/shares'
import { convertViaRates } from '@/lib/fx'
import { formatMinor } from '@/lib/currency'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'

type Props = { userId: string }

const fmt = (minor: number, currency: string) => formatMinor(minor, currency, 0)

/** "Owed to you": outstanding shares, headline + top three people. */
export function OwedWidget({ userId }: Props) {
  const shares = useExpenseShares(userId)
  const people = useAllPeople(userId)
  const entries = useMoneyEntries(userId)
  const { prefs } = useUserPrefs()
  const { rates } = useFxRates([...SUPPORTED_CURRENCIES])

  const rows = useMemo(() => owedByPerson(entries, shares, people), [entries, shares, people])
  const toPrimary = useMemo(
    () => (amount: number, currency: string) =>
      currency === prefs.primary_currency
        ? amount
        : convertViaRates(amount, currency, prefs.primary_currency, new Date().toISOString(), rates, prefs.fx_overrides ?? {})?.amount ?? null,
    [prefs.primary_currency, rates, prefs.fx_overrides],
  )
  const headline = useMemo(() => owedTotal(rows, toPrimary), [rows, toPrimary])
  const top = useMemo(
    () => rows
      .map(r => ({ ...r, primary: owedTotal([r], toPrimary).total }))
      .sort((a, b) => b.primary - a.primary)
      .slice(0, 3),
    [rows, toPrimary],
  )

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Owed to you</h2>
        <p className="text-sm text-muted-foreground">Nobody owes you anything. Use “Share with…” when you add a spend to track who owes what.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Owed to you</h2>
        <span className="font-mono text-2xl font-semibold tabular-nums">{fmt(headline.total, prefs.primary_currency)}</span>
      </div>
      {headline.skipped.length > 0 && (
        <p className="text-xs text-muted-foreground">Not converted (no FX rate yet): {headline.skipped.join(', ')}</p>
      )}
      <ul className="flex flex-col gap-1.5">
        {top.map(r => (
          <li key={r.personId}>
            <Link
              href={`/settings/people#${r.personId}`}
              className="-mx-2 flex min-h-11 items-center justify-between gap-2 rounded-lg px-2 text-sm outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-accent-2"
            >
              <span className="flex min-w-0 items-center gap-2"><Users className="size-4 shrink-0 text-muted-foreground" aria-hidden /><span className="truncate">{r.name}</span></span>
              <span className="font-mono tabular-nums">{Object.entries(r.byCurrency).map(([c, a]) => fmt(a, c)).join(' + ')}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/settings/people" className="inline-flex min-h-11 items-center gap-1 self-start rounded-lg text-sm text-accent-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent-2">
        {rows.length > 3 ? `All ${rows.length} people` : 'Mark repayments paid'}<ChevronRight className="size-4" aria-hidden />
      </Link>
    </div>
  )
}
