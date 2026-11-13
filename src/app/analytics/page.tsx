'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty'
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

  const bucketToggle = (
    <ToggleGroup
      aria-label="Group by"
      className="glass-soft p-0.5"
      value={[bucket]}
      onValueChange={next => { if (next[0]) setBucket(next[0] as 'week' | 'month') }}
    >
      <ToggleGroupItem value="week" className="h-10 px-3">Weeks</ToggleGroupItem>
      <ToggleGroupItem value="month" className="h-10 px-3">Months</ToggleGroupItem>
    </ToggleGroup>
  )

  return (
    <PageShell title="Analytics" width="wide" actions={bucketToggle}>
      <div className="grid gap-4 lg:grid-cols-2">
        {accts.length === 0 ? (
          <Card role="region" aria-labelledby="networth-heading">
            <CardHeader>
              <CardTitle><h2 id="networth-heading" className="text-sm font-semibold">Net worth</h2></CardTitle>
            </CardHeader>
            <CardContent>
              <Empty className="border p-4">
                <EmptyHeader>
                  <EmptyDescription>
                    Add your accounts in <Link href="/settings/accounts" className="text-accent-2 underline-offset-4 hover:underline">Settings → Accounts</Link> to see net worth over time.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          </Card>
        ) : (
          <NetWorthLine data={netWorthSeriesData} symbol={symbol} jpy={jpy} />
        )}

        <DualSeriesTrend spend={spendSeries} income={incomeSeries} symbol={symbol} jpy={jpy} />

        <BarTrend data={spendSeries} symbol={symbol} jpy={jpy} label={bucket === 'week' ? 'Spend per week' : 'Spend per month'} />

        <MoversBars movers={movers} symbol={symbol} jpy={jpy} />

        <Card role="region" aria-labelledby="unusual-heading" className="lg:col-span-2">
          <CardHeader>
            <CardTitle><h2 id="unusual-heading" className="text-sm font-semibold">Unusual spending this month</h2></CardTitle>
          </CardHeader>
          <CardContent>
            {anomalies.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {anomalies.map(anomaly => {
                  const fmt = (v: number) => `${symbol}${(v / (jpy ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  return (
                    <li key={anomaly.name} className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {anomaly.icon && <span aria-hidden="true">{anomaly.icon}</span>}
                        {anomaly.name}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        <span className="font-mono tabular-nums text-foreground">{fmt(anomaly.current)}</span>, {' '}
                        <Badge variant="destructive" className="align-middle">{anomaly.pct}% above</Badge> your usual{' '}
                        <span className="font-mono tabular-nums">{fmt(anomaly.baseline)}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Empty className="border p-4">
                <EmptyHeader>
                  <EmptyDescription>Nothing unusual: every category is close to its normal level.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <CategorySmallMultiples series={catSeries} periods={periods} symbol={symbol} jpy={jpy} />
        </div>
      </div>
    </PageShell>
  )
}
