'use client'

import { useId, useMemo, useState } from 'react'
import type { CategorySeries, Period } from '@/lib/analytics'
import { CATEGORICAL, DIVERGING } from '@/lib/chart-palette'
import { ChartHeader, TABLE, fullMoney } from '@/components/charts/chart-kit'

// Color follows the ENTITY, not its rank: hash the (stable) category name to a
// fixed CATEGORICAL slot so a category keeps its hue when its rank changes
// (e.g. on the week/month toggle). "Other" is always the neutral gray.
function categoricalColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return CATEGORICAL[Math.abs(h) % CATEGORICAL.length]
}

interface CategorySmallMultiplesProps {
  series: CategorySeries[]
  periods: Period[]
  symbol: string
  jpy: boolean
}

/**
 * One small chart per top category on a SHARED y-scale. Each panel labels only
 * its first and last period (the six month names used to collide, "JunJulAug…").
 */
export function CategorySmallMultiples({ series, periods, symbol, jpy }: CategorySmallMultiplesProps) {
  const id = useId()
  const [showTable, setShowTable] = useState(false)
  const money = (m: number) => fullMoney(m, symbol, jpy)
  const max = useMemo(() => Math.max(0, ...series.flatMap(s => s.points)), [series])

  if (series.length === 0) {
    return (
      <section aria-labelledby={id} className="flex flex-col gap-2">
        <h2 id={id} className="text-sm font-semibold">Spending by category</h2>
        <p className="text-sm text-muted-foreground">No categorised spending in this range yet.</p>
      </section>
    )
  }

  const first = periods[0]?.label
  const last = periods[periods.length - 1]?.label

  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <ChartHeader id={id} title="Spending by category" showTable={showTable} onToggle={() => setShowTable(s => !s)} />
      {showTable ? (
        <div className="overflow-x-auto">
          <table className={TABLE}>
            <thead><tr><th>Category</th>{periods.map(p => <th key={p.label} className="!text-right">{p.label}</th>)}</tr></thead>
            <tbody>
              {series.map(s => (
                <tr key={s.name}>
                  <td className="whitespace-nowrap">{s.icon && <span aria-hidden="true">{s.icon} </span>}{s.name}</td>
                  {s.points.map((v, i) => <td key={i} className="text-right font-mono tabular-nums">{money(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Same scale in every panel. Tallest bar {money(max)}.</p>
          <ul className="grid gap-x-4 gap-y-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(9.5rem, 1fr))' }}>
            {series.map(s => {
              const color = s.name === 'Other' ? DIVERGING.neutral : categoricalColor(s.name)
              const total = s.points.reduce((sum, v) => sum + v, 0)
              return (
                <li key={s.name} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {s.icon && <span aria-hidden="true">{s.icon}</span>}
                      <span className="truncate">{s.name}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{money(total)}</span>
                  </div>
                  <figure
                    role="img"
                    aria-label={`${s.name}: ${s.points.map((v, i) => `${periods[i]?.label} ${money(v)}`).join(', ')}`}
                    className="flex h-16 items-end gap-0.5 border-b border-white/15"
                  >
                    {s.points.map((v, i) => (
                      <div key={i} title={`${s.name}, ${periods[i]?.label}: ${money(v)}`} className="group flex h-full flex-1 items-end">
                        <div
                          className="w-full rounded-t-[4px] transition-[filter] group-hover:brightness-125"
                          style={{ height: v > 0 && max > 0 ? `${Math.max(3, (v / max) * 100)}%` : 0, backgroundColor: color }}
                        />
                      </div>
                    ))}
                  </figure>
                  <div className="flex justify-between text-xs text-muted-foreground" aria-hidden>
                    <span>{first}</span><span>{last}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
