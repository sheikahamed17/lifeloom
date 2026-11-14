'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { PageShell } from '@/components/layout/page-shell'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BarTrend } from '@/components/charts/bar-trend'
import { DualSeriesTrend } from '@/components/charts/dual-series-trend'
import { MoversBars } from '@/components/charts/movers-bars'
import { CategorySmallMultiples } from '@/components/charts/category-small-multiples'
import { NetWorthLine } from '@/components/charts/net-worth-line'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useExpenseShares } from '@/hooks/use-expense-shares'
import { withYourShare, withSettlements } from '@/lib/shares'
import { useAllCategories } from '@/hooks/use-all-categories'
import { useAccounts } from '@/hooks/use-accounts'
import { useTransfers } from '@/hooks/use-transfers'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { useFxRates } from '@/hooks/use-fx-rates'
import { makeCategoryResolver } from '@/lib/category-resolve'
import { convertViaRates } from '@/lib/fx'
import { currencySymbol } from '@/lib/currency'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { analyticsPeriods, computeTopMovers, computeCategorySeries } from '@/lib/analytics'
import { detectSpendingAnomalies } from '@/lib/spending-anomaly'
import { netWorth, netWorthSeries, type AccountLike } from '@/lib/accounts'

export default function AnalyticsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [bucket, setBucket] = useState<'week' | 'month'>('month')

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  const count = bucket === 'week' ? 12 : 6
  const entriesRaw = useMoneyEntries(userId ?? undefined)
  const shares = useExpenseShares(userId ?? undefined)
  // Spend view (your share) drives every spend chart; the ledger view (full
  // amounts + repayments as credits) drives net worth. Income uses the raw list.
  const entries = useMemo(() => withYourShare(entriesRaw, shares), [entriesRaw, shares])
  const ledger = useMemo(() => withSettlements(entriesRaw, shares), [entriesRaw, shares])
  const allCats = useAllCategories(userId ?? undefined)
  const accts = useAccounts(userId ?? undefined)
  const transfers = useTransfers(userId ?? undefined)
  const { prefs } = useUserPrefs()
  const { rates } = useFxRates([...SUPPORTED_CURRENCIES])

  const nowMs = useMemo(() => new Date().getTime(), [])

  const resolve = useMemo(
    () =>
      makeCategoryResolver(
        allCats.map(c => ({ id: c.id, name: c.name, icon: c.icon, kind: c.kind })),
      ),
    [allCats],
  )

  const activeAccountIds = useMemo(() => new Set(accts.map(a => a.id)), [accts])

  // Convert entry amount to its account's currency (for net worth computation)
  const toAcct = useMemo(
    () => (entry: typeof entries[0], acct: AccountLike) => {
      if (entry.currency === acct.currency) {
        return entry.amount
      }
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

  // Convert account balance (in account currency) to primary currency
  const toPrimaryForNet = useMemo(
    () => (balance: number, acctCurrency: string) => {
      if (acctCurrency === prefs.primary_currency) {
        return balance
      }
      const now = new Date().toISOString()
      return convertViaRates(balance, acctCurrency, prefs.primary_currency, now, rates, prefs.fx_overrides ?? {})?.amount ?? 0
    },
    [prefs.primary_currency, rates, prefs.fx_overrides],
  )

  // Wrapper to convert entry amount to its account's currency for net worth series
  const toAcctForNet = useMemo(
    () => (entry: typeof entries[0]) => {
      if (!entry.account_id) return 0
      const acct = accts.find(a => a.id === entry.account_id)
      if (!acct) return 0
      return toAcct(entry, acct)
    },
    [accts, toAcct],
  )

  const toPrimary = useMemo(
    () => (e: typeof entries[0]) =>
      e.currency === prefs.primary_currency
        ? e.amount
        : convertViaRates(e.amount, e.currency, prefs.primary_currency, e.occurred_at, rates, prefs.fx_overrides ?? {})?.amount ?? 0,
    [prefs.primary_currency, rates, prefs.fx_overrides],
  )

  const periods = useMemo(() => analyticsPeriods(nowMs, bucket, count), [nowMs, bucket, count])

  // Current net worth (for net worth series computation)
  const currentNet = useMemo(
    () => netWorth(accts, ledger, transfers, toAcctForNet, toPrimaryForNet).net,
    [accts, ledger, transfers, toAcctForNet, toPrimaryForNet],
  )

  // Entry to primary currency (for net worth series)
  const toPrimaryEntry = useMemo(
    () => (e: typeof entries[0]) =>
      e.currency === prefs.primary_currency
        ? e.amount
        : convertViaRates(e.amount, e.currency, prefs.primary_currency, e.occurred_at, rates, prefs.fx_overrides ?? {})?.amount ?? 0,
    [prefs.primary_currency, rates, prefs.fx_overrides],
  )

  // Net worth series over time
  const netWorthSeriesData = useMemo(
    () => netWorthSeries(currentNet, ledger, activeAccountIds, analyticsPeriods(nowMs, 'month', 6), toPrimaryEntry),
    [currentNet, ledger, activeAccountIds, nowMs, toPrimaryEntry],
  )

  // Compute spend and income series aligned 1:1 to periods
  const spendSeries = useMemo(() => {
    return periods.map(p => ({
      label: p.label,
      amount: entries
        .filter(e => e.direction === 'out' && e.occurred_at >= p.from && e.occurred_at < p.to && !e.deleted_at)
        .reduce((sum, e) => sum + toPrimary(e), 0),
    }))
  }, [periods, entries, toPrimary])

  const incomeSeries = useMemo(() => {
    return periods.map(p => ({
      label: p.label,
      amount: entriesRaw
        .filter(e => e.direction === 'in' && e.occurred_at >= p.from && e.occurred_at < p.to && !e.deleted_at)
        .reduce((sum, e) => sum + toPrimary(e), 0),
    }))
  }, [periods, entriesRaw, toPrimary])

  // Compute movers (current vs previous period)
  const movers = useMemo(() => {
    if (periods.length < 2) return []
    const currentPeriod = periods[periods.length - 1]
    const previousPeriod = periods[periods.length - 2]

    const currentEntries = entries.filter(
      e => e.occurred_at >= currentPeriod.from && e.occurred_at < currentPeriod.to && !e.deleted_at,
    )
    const previousEntries = entries.filter(
      e => e.occurred_at >= previousPeriod.from && e.occurred_at < previousPeriod.to && !e.deleted_at,
    )

    return computeTopMovers(currentEntries, previousEntries, { resolve, toPrimary })
  }, [periods, entries, resolve, toPrimary])

  // Compute category series
  const catSeries = useMemo(
    () => computeCategorySeries(entries.filter(e => !e.deleted_at), { periods, resolve, toPrimary, topN: 6 }),
    [entries, periods, resolve, toPrimary],
  )

  // Compute spending anomalies (using month buckets, independent of period toggle)
  const anomalies = useMemo(() => {
    const monthPeriods = analyticsPeriods(nowMs, 'month', 4)
    const series = computeCategorySeries(
      entries.filter(e => !e.deleted_at),
      { periods: monthPeriods, resolve, toPrimary, topN: 50 },
    )
    return detectSpendingAnomalies(series)
  }, [entries, nowMs, resolve, toPrimary])

  const symbol = currencySymbol(prefs.primary_currency)
  const jpy = prefs.primary_currency === 'JPY'

  const TOGGLE_ITEM = 'h-11 rounded-none border-b-2 border-transparent bg-transparent px-0 text-[15px] font-medium text-muted-foreground hover:bg-transparent aria-pressed:border-foreground aria-pressed:bg-transparent data-[state=on]:bg-transparent aria-pressed:font-semibold aria-pressed:text-foreground'
  const bucketToggle = (
    <div className="flex items-center gap-5">
      <span aria-hidden className="text-[13px] font-semibold text-muted-foreground">Group by</span>
      <ToggleGroup
        aria-label="Group by"
        spacing={5}
        value={[bucket]}
        onValueChange={next => { if (next[0]) setBucket(next[0] as 'week' | 'month') }}
      >
        <ToggleGroupItem value="week" className={TOGGLE_ITEM}>Weeks</ToggleGroupItem>
        <ToggleGroupItem value="month" className={TOGGLE_ITEM}>Months</ToggleGroupItem>
      </ToggleGroup>
    </div>
  )

  const HEADING = 'text-[19px] font-bold leading-snug tracking-[-0.02em] lg:text-[22px]'
  const fmt = (v: number) => `${symbol}${(v / (jpy ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  const comparison = periods.length >= 2
    ? `${periods[periods.length - 1].label} so far against ${periods[periods.length - 2].label}`
    : undefined

  return (
    <PageShell
      title="Analytics"
      width="wide"
      description={bucket === 'week' ? 'The last twelve weeks, up to today.' : 'The last six months, up to today.'}
      actions={bucketToggle}
    >
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] lg:items-start lg:gap-x-14 lg:gap-y-10">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          {accts.length === 0 ? (
            <section role="region" aria-labelledby="networth-heading" className="flex flex-col">
              <div className="border-b border-border pb-2.5">
                <h2 id="networth-heading" className={HEADING}>Net worth</h2>
              </div>
              <p className="pt-3.5 text-[15px] text-muted-foreground">
                Add your accounts in <Link href="/settings/accounts" className="font-medium text-foreground underline underline-offset-4">Settings → Accounts</Link> to see net worth over time.
              </p>
            </section>
          ) : (
            <NetWorthLine data={netWorthSeriesData} current={currentNet} symbol={symbol} jpy={jpy} />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-8 lg:col-start-1 lg:row-start-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-12">
          <DualSeriesTrend spend={spendSeries} income={incomeSeries} symbol={symbol} jpy={jpy} />
          <BarTrend data={spendSeries} symbol={symbol} jpy={jpy} label={bucket === 'week' ? 'Spend per week' : 'Spend per month'} />
        </div>

        <div className="flex min-w-0 flex-col gap-8 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:gap-10">
          <MoversBars movers={movers} symbol={symbol} jpy={jpy} comparison={comparison} />

          <section role="region" aria-labelledby="unusual-heading" className="flex flex-col">
            <div className="border-b border-border pb-2.5">
              <h2 id="unusual-heading" className={HEADING}>Unusual spending this month</h2>
            </div>
            {anomalies.length > 0 ? (
              <ul className="flex flex-col">
                {anomalies.map(anomaly => (
                  <li key={anomaly.name} className="flex min-h-14 items-center justify-between gap-3 border-b border-border py-2.5">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[15px] font-medium">{anomaly.name}</span>
                      <span className="text-[13px] text-muted-foreground">
                        <span className="font-semibold text-warning">{anomaly.pct}% above</span> your usual{' '}
                        <span className="tabular-nums">{fmt(anomaly.baseline)}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums">{fmt(anomaly.current)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pt-3.5 text-[15px] text-muted-foreground">Nothing unusual: every category is close to its normal level.</p>
            )}
          </section>
        </div>

        <CategorySmallMultiples series={catSeries} periods={periods} symbol={symbol} jpy={jpy} className="lg:col-start-1 lg:row-start-3" />
      </div>
    </PageShell>
  )
}
