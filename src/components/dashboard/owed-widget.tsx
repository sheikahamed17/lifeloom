'use client'

import { useMemo } from 'react'
import Link from 'next/link'
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
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Owed to you</span>
        <p className="text-sm text-muted-foreground">Nobody owes you anything. Share an expense from the capture chip to track it here.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Owed to you</span>
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
              className="flex min-h-[44px] items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
            >
              <span className="truncate"><span aria-hidden="true">👥 </span>{r.name}</span>
              <span className="font-mono tabular-nums">{Object.entries(r.byCurrency).map(([c, a]) => fmt(a, c)).join(' + ')}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/settings/people" className="text-xs text-accent-2 hover:underline focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded">
        {rows.length > 3 ? `All ${rows.length} people →` : 'Mark paid →'}
      </Link>
    </div>
  )
}
