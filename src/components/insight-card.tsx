'use client'

import { Sparkles } from 'lucide-react'
import { currencySymbol } from '@/lib/currency'
import { readDigestMetrics } from '@/lib/digest-metrics-read'
import { formatDayRange } from '@/lib/format'
import type { InsightRow } from '@/lib/dexie'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function InsightCard({ insight, variant = 'card' }: { insight: InsightRow; variant?: 'card' | 'detail' }) {
  const metrics = readDigestMetrics(insight.metrics)
  const symbol = currencySymbol(metrics?.currency ?? 'INR')
  const div = (metrics?.currency ?? 'INR') === 'JPY' ? 1 : 100
  const weekLabel = formatDayRange(insight.starts_at, insight.ends_at)
  // Never render a figure that can't be computed (PRODUCT.md principle 4): a missing total is "—".
  const money = (n: number | null) => (n === null ? '—' : `${symbol}${(n / div).toLocaleString(undefined, { maximumFractionDigits: 0 })}`)

  return (
    <Card className="glass-accent gap-0">
      <CardHeader className="mb-2">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-accent-2" aria-hidden />
          {/* On the detail page the page title already says "Week in review": show the dates instead, once. */}
          {variant === 'card' ? (
            <>
              <h3 className="text-sm font-semibold">Week in review</h3>
              <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">{weekLabel}</span>
            </>
          ) : (
            <h2 className="text-sm font-semibold tabular-nums">{weekLabel}</h2>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-foreground">{insight.summary}</p>
        {metrics && (
          <div className="mb-2 flex flex-wrap gap-2">
            <Chip label="Spent" value={money(metrics.spend_total)} />
            <Chip label="Income" value={money(metrics.income_total)} />
            {metrics.tasks_completed > 0 && <Chip label="Tasks done" value={String(metrics.tasks_completed)} />}
            {metrics.tasks_overdue > 0 && <Chip label="Overdue" value={String(metrics.tasks_overdue)} tone="danger" />}
            {metrics.learnings_added > 0 && <Chip label="Learned" value={String(metrics.learnings_added)} />}
            {metrics.notes_added > 0 && <Chip label="Notes" value={String(metrics.notes_added)} />}
            {(metrics.owed_total ?? 0) > 0 && <Chip label="Owed to you" value={money(metrics.owed_total ?? 0)} />}
          </div>
        )}
        {variant === 'detail' && metrics && (
          <>
            {metrics.top_categories.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1" aria-label="Top categories">
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
                  <Badge key={tag} variant="secondary" className="text-muted-foreground">{tag}</Badge>
                ))}
              </div>
            )}
          </>
        )}
        {metrics && metrics.skipped_currencies.length > 0 && (
          <p className="text-xs text-muted-foreground">Conversions skipped for {metrics.skipped_currencies.join(', ')}: no rates yet.</p>
        )}
      </CardContent>
    </Card>
  )
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <Badge variant="secondary" className="h-auto gap-1 rounded-lg px-2 py-1">
      <span className={tone === 'danger' ? 'text-destructive' : 'text-muted-foreground'}>{label}</span>
      <span className="font-mono font-semibold tabular-nums">{value}</span>
    </Badge>
  )
}
