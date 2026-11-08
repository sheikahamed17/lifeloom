'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { AuroraBackground } from '@/components/aurora-background'
import { BarTrend } from '@/components/charts/bar-trend'
import { DualSeriesTrend } from '@/components/charts/dual-series-trend'
import { MoversBars } from '@/components/charts/movers-bars'
import { CategorySmallMultiples } from '@/components/charts/category-small-multiples'
import { NetWorthLine } from '@/components/charts/net-worth-line'
import { useMoneyEntries } from '@/hooks/use-money-entries'
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
  const entries = useMoneyEntries(userId ?? undefined)
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
    () => netWorth(accts, entries, transfers, toAcctForNet, toPrimaryForNet).net,
    [accts, entries, transfers, toAcctForNet, toPrimaryForNet],
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
    () => netWorthSeries(currentNet, entries, activeAccountIds, analyticsPeriods(nowMs, 'month', 6), toPrimaryEntry),
    [currentNet, entries, activeAccountIds, nowMs, toPrimaryEntry],
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
      amount: entries
        .filter(e => e.direction === 'in' && e.occurred_at >= p.from && e.occurred_at < p.to && !e.deleted_at)
        .reduce((sum, e) => sum + toPrimary(e), 0),
    }))
  }, [periods, entries, toPrimary])

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

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex w-full max-w-md md:max-w-3xl flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <div className="flex gap-2">
            {(['week', 'month'] as const).map(b => (
              <button
                key={b}
                onClick={() => setBucket(b)}
                className={`min-h-[44px] px-3 py-1 text-xs font-medium uppercase tracking-wide rounded transition-colors ${
                  bucket === b ? 'text-accent-2' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* Net worth */}
        <div className="glass rounded-2xl p-4">
          {accts.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Net worth</p>
              <p className="text-xs text-muted-foreground">
                Add accounts (<Link href="/settings/accounts" className="text-blue-500 hover:underline">Settings → Accounts</Link>) to see net worth over time
              </p>
            </div>
          ) : (
            <NetWorthLine data={netWorthSeriesData} symbol={symbol} jpy={jpy} />
          )}
        </div>

        {/* Unusual spending */}
        <div className="glass rounded-2xl p-4">
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unusual spending</p>
            {anomalies.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {anomalies.map(anomaly => {
                  const fmt = (v: number) =>
                    (v / (jpy ? 1 : 100)).toLocaleString(undefined, { maximumFractionDigits: 0 })
                  return (
                    <li key={anomaly.name} className="flex flex-col gap-1">
                      <div className="text-xs text-foreground flex items-center gap-2">
                        {anomaly.icon && <span>{anomaly.icon}</span>}
                        <span className="font-medium">{anomaly.name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-mono">
                          {symbol}
                          {fmt(anomaly.current)}
                        </span>
                        <span> this month · </span>
                        <span className="text-rose-500 font-medium">{anomaly.pct}%</span>
                        <span> above your </span>
                        <span className="font-mono">
                          {symbol}
                          {fmt(anomaly.baseline)}
                        </span>
                        <span> average</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                No unusual spending this month &mdash; you&rsquo;re tracking to your norm.
              </p>
            )}
          </div>
        </div>

        {/* Spend per period */}
        <div className="glass rounded-2xl p-4">
          <BarTrend data={spendSeries} symbol={symbol} jpy={jpy} label="Spend per period" />
        </div>

        {/* Income vs Spend + Net */}
        <div className="glass rounded-2xl p-4">
          <DualSeriesTrend spend={spendSeries} income={incomeSeries} symbol={symbol} jpy={jpy} />
        </div>

        {/* Top Movers */}
        <div className="glass rounded-2xl p-4">
          <MoversBars movers={movers} symbol={symbol} jpy={jpy} />
        </div>

        {/* Spending by Category */}
        <div className="glass rounded-2xl p-4">
          <CategorySmallMultiples series={catSeries} periods={periods} symbol={symbol} jpy={jpy} />
        </div>

        <Link href="/app" className="text-sm text-muted-foreground hover:underline focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded">← Back to Lifeloom</Link>
      </main>
    </>
  )
}
