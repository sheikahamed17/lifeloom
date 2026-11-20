'use client'

import { useId, useMemo } from 'react'
import Link from 'next/link'
import { IconTile } from '@/components/shared/icon-tile'
import { EMPTY_NOTE, FOOT_LINK, SectionHeading } from '@/components/money/section-heading'
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
  const headingId = useId()
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
      <section aria-labelledby={headingId} className="flex flex-col">
        <SectionHeading id={headingId}>Owed to you</SectionHeading>
        <p className={EMPTY_NOTE}>Nobody owes you anything. Paid for someone? Choose “I paid this for someone” in Needs you, or “Share with…” on the entry.</p>
      </section>
    )
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      <SectionHeading
        id={headingId}
        aside={<p className="shrink-0 text-base font-semibold tabular-nums">{fmt(headline.total, prefs.primary_currency)}</p>}
      >
        Owed to you
      </SectionHeading>
      <ul className="flex flex-col">
        {top.map(r => (
          <li key={r.personId} className="border-b border-border">
            <Link
              href={`/settings/people#${r.personId}`}
              className="-mx-2 flex min-h-14 items-center gap-3 rounded-lg px-2 py-2 text-[15px] outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <IconTile name={r.name} size="sm" />
              <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
              <span className="shrink-0 font-semibold tabular-nums">{Object.entries(r.byCurrency).map(([c, a]) => fmt(a, c)).join(' + ')}</span>
            </Link>
          </li>
        ))}
      </ul>
      {headline.skipped.length > 0 && (
        <p className="pt-3 text-xs text-muted-foreground">Not converted (no FX rate yet): {headline.skipped.join(', ')}</p>
      )}
      <Link href="/settings/people" className={FOOT_LINK}>
        {rows.length > 3 ? `All ${rows.length} people` : 'Mark repayments paid'}
      </Link>
    </section>
  )
}
