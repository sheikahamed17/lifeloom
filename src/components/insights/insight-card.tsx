'use client'

import { currencySymbol } from '@/lib/currency'
import { readDigestMetrics } from '@/lib/digest-metrics-read'
import { formatDayRange } from '@/lib/format'
import type { InsightRow } from '@/lib/dexie'
import { PanelStat, SummaryPanel } from '@/components/shared/summary-panel'
import { cn } from '@/lib/utils'

const HEADING = 'text-[19px] font-bold tracking-[-0.02em] lg:text-[22px]'

/**
 * One weekly review, in three shapes:
 * - `card`: the "Week in review" section on Money home (heading, sentence, figures).
 * - `row`: one ruled row in the Insights list (the week's dates lead).
 * - `detail`: the whole review, with the week's spend as the page's one green panel.
 */
export function InsightCard({ insight, variant = 'card' }: { insight: InsightRow; variant?: 'card' | 'row' | 'detail' }) {
  const metrics = readDigestMetrics(insight.metrics)
  const symbol = currencySymbol(metrics?.currency ?? 'INR')
  const div = (metrics?.currency ?? 'INR') === 'JPY' ? 1 : 100
  const weekLabel = formatDayRange(insight.starts_at, insight.ends_at)
  // Never render a figure that can't be computed (PRODUCT.md principle 4): a missing total is "—".
  const money = (n: number | null) => (n === null ? '—' : `${symbol}${(n / div).toLocaleString(undefined, { maximumFractionDigits: 0 })}`)

  const skipped = metrics && metrics.skipped_currencies.length > 0 && (
    <p className="text-[13px] text-muted-foreground">Conversions skipped for {metrics.skipped_currencies.join(', ')}: no rates yet.</p>
  )

  if (variant === 'detail') {
    const counts = metrics ? [
      ...(metrics.tasks_completed > 0 ? [{ label: 'Tasks done', value: metrics.tasks_completed }] : []),
      ...(metrics.tasks_overdue > 0 ? [{ label: 'Overdue', value: metrics.tasks_overdue, warn: true }] : []),
      ...(metrics.learnings_added > 0 ? [{ label: 'Learned', value: metrics.learnings_added }] : []),
      ...(metrics.notes_added > 0 ? [{ label: 'Notes', value: metrics.notes_added }] : []),
    ] : []
    const categories = metrics?.top_categories ?? []
    const largest = categories.reduce((m, c) => Math.max(m, c.amount), 0)
    const lead = categories[0]
    const leadShare = lead && metrics?.spend_total ? Math.round((lead.amount / metrics.spend_total) * 100) : null
    const tags = metrics?.top_learning_tags ?? []

    return (
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-x-14 lg:gap-y-10">
        <div className="flex min-w-0 flex-col gap-8 lg:gap-10">
          {metrics && (
            <SummaryPanel
              className="-mx-2 lg:mx-0"
              eyebrow="Spent this week"
              value={money(metrics.spend_total)}
              stats={
                <>
                  <PanelStat label="Income" value={money(metrics.income_total)} />
                  {(metrics.owed_total ?? 0) > 0 && <PanelStat label="Owed to you" value={money(metrics.owed_total ?? 0)} />}
                </>
              }
            />
          )}
          <p className="text-base leading-normal lg:text-[17px]">{insight.summary}</p>
          {categories.length > 0 && (
            <section aria-labelledby="insight-categories" className="flex flex-col">
              <div className="border-b border-border pb-2.5">
                <h2 id="insight-categories" className={HEADING}>Top categories</h2>
              </div>
              <ul className="flex flex-col divide-y divide-border border-b border-border" aria-label="Top categories">
                {categories.map(c => (
                  <li key={c.name} className="flex min-h-11 items-center gap-3 text-sm lg:min-h-12 lg:gap-4 lg:text-[15px]">
                    <span className="w-24 shrink-0 truncate font-medium lg:w-28">{c.name}</span>
                    <span className="h-2 flex-1 rounded-full bg-muted" aria-hidden>
                      <span className="block h-2 rounded-full bg-foreground" style={{ width: `${largest > 0 ? Math.max(0, (c.amount / largest) * 100) : 0}%` }} />
                    </span>
                    <span className="w-20 shrink-0 text-right font-semibold tabular-nums">{money(c.amount)}</span>
                  </li>
                ))}
              </ul>
              {lead && leadShare !== null && leadShare > 0 && leadShare <= 100 && (
                <p className="pt-3 text-[13px] tabular-nums text-muted-foreground">{lead.name} was {leadShare}% of the week&apos;s spending.</p>
              )}
            </section>
          )}
          {skipped}
        </div>
        {(counts.length > 0 || tags.length > 0) && (
          <div className="flex min-w-0 flex-col gap-8 lg:gap-10">
            {counts.length > 0 && (
              <section aria-labelledby="insight-numbers" className="flex flex-col">
                <div className="border-b border-border pb-2.5">
                  <h2 id="insight-numbers" className={HEADING}>The week in numbers</h2>
                </div>
                <dl className="flex flex-col">
                  {counts.map(c => (
                    <div key={c.label} className="flex min-h-[52px] items-center justify-between gap-4 border-b border-border">
                      <dt className={cn('text-[15px] font-medium', c.warn && 'text-warning')}>{c.label}</dt>
                      <dd className={cn('text-base font-semibold tabular-nums', c.warn && 'text-warning')}>{c.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            {tags.length > 0 && (
              <section aria-labelledby="insight-tags" className="flex flex-col">
                <div className="border-b border-border pb-2.5">
                  <h2 id="insight-tags" className={HEADING}>Learning tags</h2>
                </div>
                <ul className="flex flex-col">
                  {tags.map(tag => (
                    <li key={tag} className="flex min-h-[52px] items-center border-b border-border text-[15px] font-medium">{tag}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    )
  }

  const figures = metrics && (
    <dl className="flex flex-wrap gap-x-3.5 gap-y-0.5 text-[13px] text-muted-foreground lg:gap-x-[18px]">
      <Figure label="Spent" value={money(metrics.spend_total)} />
      <Figure label="Income" value={money(metrics.income_total)} />
      {metrics.tasks_completed > 0 && <Figure label="Tasks done" value={String(metrics.tasks_completed)} />}
      {metrics.tasks_overdue > 0 && <Figure label="Overdue" value={String(metrics.tasks_overdue)} warn />}
      {metrics.learnings_added > 0 && <Figure label="Learned" value={String(metrics.learnings_added)} />}
      {metrics.notes_added > 0 && <Figure label="Notes" value={String(metrics.notes_added)} />}
      {(metrics.owed_total ?? 0) > 0 && <Figure label="Owed to you" value={money(metrics.owed_total ?? 0)} />}
    </dl>
  )

  if (variant === 'row') {
    return (
      <div className="flex flex-col gap-1.5 py-4 lg:flex-row lg:items-start lg:gap-6 lg:py-[18px]">
        <h3 className="text-[15px] font-semibold leading-[1.45] tabular-nums lg:w-36 lg:shrink-0">{weekLabel}</h3>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-sm leading-[1.45] lg:text-[15px]">{insight.summary}</p>
          {figures}
          {skipped}
        </div>
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3 border-b border-border pb-2.5">
        <h3 className={HEADING}>Week in review</h3>
        <span className="text-[13px] tabular-nums text-muted-foreground">{weekLabel}</span>
      </div>
      <p className="text-[15px] leading-[1.45]">{insight.summary}</p>
      {figures}
      {skipped}
    </section>
  )
}

/** One figure in a sentence-like run: muted label, ink number. Overdue is the only attention colour. */
function Figure({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn('flex gap-1', warn && 'font-medium text-warning')}>
      <dt>{label}</dt>
      <dd className={cn('font-semibold tabular-nums', !warn && 'text-foreground')}>{value}</dd>
    </div>
  )
}
