'use client'

import { Sparkles } from 'lucide-react'
import { currencySymbol } from '@/lib/currency'
import type { DigestMetrics } from '@/lib/digest-aggregate'
import type { InsightRow } from '@/lib/dexie'

export function InsightCard({ insight, variant = 'card' }: { insight: InsightRow; variant?: 'card' | 'detail' }) {
  let metrics: DigestMetrics | null = null
  try { metrics = JSON.parse(insight.metrics) as DigestMetrics } catch { metrics = null }
  const symbol = currencySymbol(metrics?.currency ?? 'INR')
  const div = (metrics?.currency ?? 'INR') === 'JPY' ? 1 : 100
  const weekLabel = `${insight.starts_at.slice(0, 10)} – ${insight.ends_at.slice(0, 10)}`
  const money = (n: number) => `${symbol}${(n / div).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

  return (
    <div className="glass-accent rounded-lg p-4">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent-2" />
        <h3 className="text-sm font-semibold">Week in review</h3>
        <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">{weekLabel}</span>
      </div>
      <p className="mb-3 text-sm text-foreground">{insight.summary}</p>
      {metrics && (
        <div className="mb-2 flex flex-wrap gap-2">
          <Chip label="Spend" value={money(metrics.spend_total)} />
          <Chip label="Income" value={money(metrics.income_total)} />
          {metrics.tasks_completed > 0 && <Chip label="Done" value={String(metrics.tasks_completed)} />}
          {metrics.tasks_overdue > 0 && <Chip label="Overdue" value={String(metrics.tasks_overdue)} tone="danger" />}
          {metrics.learnings_added > 0 && <Chip label="Learned" value={String(metrics.learnings_added)} />}
          {metrics.notes_added > 0 && <Chip label="Notes" value={String(metrics.notes_added)} />}
          {(metrics.owed_total ?? 0) > 0 && <Chip label="Owed to you" value={money(metrics.owed_total ?? 0)} />}
        </div>
      )}
      {variant === 'detail' && metrics && (
        <>
          {metrics.top_categories.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {metrics.top_categories.map(c => (
                <li key={c.name} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{c.name}</span>
                  <span className="font-mono tabular-nums">{money(c.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          {metrics.top_learning_tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {metrics.top_learning_tags.map(tag => (
                <span key={tag} className="inline-block rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </>
      )}
      {metrics?.skipped_currencies && metrics.skipped_currencies.length > 0 && (
        <p className="text-[10px] text-muted-foreground">(Conversions skipped for {metrics.skipped_currencies.join(', ')} — no rates yet)</p>
      )}
    </div>
  )
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
      <span className={tone === 'danger' ? 'text-rose-600' : 'text-muted-foreground'}>{label}</span>
      <span className="font-mono font-semibold tabular-nums">{value}</span>
    </div>
  )
}
