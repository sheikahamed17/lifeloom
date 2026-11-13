'use client'

import { useId, useMemo, useState } from 'react'
import { DIVERGING, SPEND_COLOR, INCOME_COLOR } from '@/lib/chart-palette'
import { cn } from '@/lib/utils'
import { ChartHeader, TABLE, compactMoney, fullMoney, tickClass } from '@/components/charts/chart-kit'

interface DualSeriesTrendProps {
  spend: { label: string; amount: number }[]
  income: { label: string; amount: number }[]
  symbol: string
  jpy: boolean
}

/**
 * Income and spend per period on ONE shared axis (never two y-scales), with the
 * net under each period. A period with neither shows no net at all, not "+0".
 */
export function DualSeriesTrend({ spend, income, symbol, jpy }: DualSeriesTrendProps) {
  const id = useId()
  const [showTable, setShowTable] = useState(false)
  const money = (m: number) => fullMoney(m, symbol, jpy)

  const periods = useMemo(() => {
    const spendMap = new Map(spend.map(s => [s.label, s.amount]))
    const incomeMap = new Map(income.map(i => [i.label, i.amount]))
    const labels = Array.from(new Set([...spendMap.keys(), ...incomeMap.keys()]))
    return labels.map(label => ({ label, spend: spendMap.get(label) ?? 0, income: incomeMap.get(label) ?? 0 }))
  }, [spend, income])
  const max = useMemo(() => Math.max(0, ...periods.map(p => Math.max(p.spend, p.income))), [periods])
  const n = periods.length
  const pct = (v: number) => (v > 0 && max > 0 ? `${Math.max(2, (v / max) * 100)}%` : 0)

  if (n === 0) {
    return (
      <section aria-labelledby={id} className="flex flex-col gap-2">
        <h2 id={id} className="text-sm font-semibold">Income and spend</h2>
        <p className="text-sm text-muted-foreground">No entries in this range yet.</p>
      </section>
    )
  }

  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <ChartHeader id={id} title="Income and spend" showTable={showTable} onToggle={() => setShowTable(s => !s)}>
        <span className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
          <Legend />
        </span>
      </ChartHeader>
      <div className="flex items-center gap-3 text-xs text-muted-foreground sm:hidden"><Legend /></div>
      {showTable ? (
        <table className={TABLE}>
          <thead><tr><th>Period</th><th className="!text-right">Spend</th><th className="!text-right">Income</th><th className="!text-right">Net</th></tr></thead>
          <tbody>
            {periods.map(p => (
              <tr key={p.label}>
                <td>{p.label}</td>
                <td className="text-right font-mono tabular-nums">{money(p.spend)}</td>
                <td className="text-right font-mono tabular-nums">{money(p.income)}</td>
                <td className="text-right font-mono tabular-nums">{p.spend || p.income ? `${p.income - p.spend >= 0 ? '+' : ''}${money(p.income - p.spend)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <figure
          role="img"
          aria-label={`Income and spend: ${periods.map(p => `${p.label} spend ${money(p.spend)}, income ${money(p.income)}`).join('; ')}`}
          className="flex flex-col gap-1"
        >
          <p className="text-right text-xs text-muted-foreground">Highest <span className="font-mono tabular-nums">{money(max)}</span></p>
          <div className="relative flex h-44 items-end gap-1 border-b border-white/15">
            <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-white/10" />
            {periods.map(p => (
              <div
                key={p.label}
                title={`${p.label}: spend ${money(p.spend)}, income ${money(p.income)}, net ${money(p.income - p.spend)}`}
                className="group flex h-full flex-1 items-end justify-center gap-0.5"
              >
                <div className="w-1/2 max-w-5 rounded-t-[4px] transition-[filter] group-hover:brightness-125" style={{ height: pct(p.spend), backgroundColor: SPEND_COLOR }} />
                <div className="w-1/2 max-w-5 rounded-t-[4px] transition-[filter] group-hover:brightness-125" style={{ height: pct(p.income), backgroundColor: INCOME_COLOR }} />
              </div>
            ))}
          </div>
          {/* Net per period: a sign-coloured tick plus a compact figure in text ink; nothing for an empty period. */}
          <div className="flex gap-1" aria-hidden>
            {periods.map((p, i) => {
              const empty = !p.spend && !p.income
              const net = p.income - p.spend
              return (
                <span key={p.label} className={cn('flex flex-1 flex-col items-center gap-0.5', tickClass(i, n))}>
                  {!empty && (
                    <>
                      <span className="h-1 w-6 max-w-full rounded-full" style={{ backgroundColor: net >= 0 ? DIVERGING.positive : DIVERGING.negative }} />
                      <span className="max-w-full truncate font-mono text-xs tabular-nums text-muted-foreground">{net >= 0 ? '+' : ''}{compactMoney(net, symbol, jpy)}</span>
                    </>
                  )}
                </span>
              )
            })}
          </div>
          <div className="flex gap-1" aria-hidden>
            {periods.map((p, i) => (
              <span key={p.label} className={cn('flex-1 truncate text-center text-xs text-muted-foreground', tickClass(i, n), i === n - 1 && 'text-foreground')}>{p.label}</span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Under each period: net (income minus spend).</p>
        </figure>
      )}
    </section>
  )
}

function Legend() {
  return (
    <>
      <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ backgroundColor: SPEND_COLOR }} />Spend</span>
      <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ backgroundColor: INCOME_COLOR }} />Income</span>
    </>
  )
}
