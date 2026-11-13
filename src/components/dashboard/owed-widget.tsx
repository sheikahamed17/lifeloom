'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight, Users } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { Item, ItemContent, ItemTitle } from '@/components/ui/item'
import { cn } from '@/lib/utils'
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
        <Empty className="p-2">
          <EmptyDescription>Nobody owes you anything. Use “Share with…” when you add a spend to track who owes what.</EmptyDescription>
        </Empty>
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
            <Item
              size="xs"
              render={<Link href={`/settings/people#${r.personId}`} />}
              className="-mx-2 min-h-11 w-[calc(100%+1rem)] flex-nowrap justify-between"
            >
              <ItemContent className="min-w-0 flex-row items-center gap-2">
                <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <ItemTitle className="min-w-0 font-normal"><span className="truncate">{r.name}</span></ItemTitle>
              </ItemContent>
              <span className="font-mono text-sm tabular-nums">{Object.entries(r.byCurrency).map(([c, a]) => fmt(a, c)).join(' + ')}</span>
            </Item>
          </li>
        ))}
      </ul>
      <Link href="/settings/people" className={cn(buttonVariants({ variant: 'link' }), 'h-11 self-start px-0')}>
        {rows.length > 3 ? `All ${rows.length} people` : 'Mark repayments paid'}<ChevronRight className="size-4" aria-hidden />
      </Link>
    </div>
  )
}
