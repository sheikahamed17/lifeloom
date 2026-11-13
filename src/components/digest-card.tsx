'use client'

import Link from 'next/link'
import { ChevronRight, X } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/dexie'
import { InsightCard } from '@/components/insight-card'
import { Button } from '@/components/ui/button'

export function DigestCard({ userId }: { userId: string }) {
  // Hook 1: latest insight for this user (compound-index range, newest first)
  const insights = useLiveQuery(
    () => db.insights
      .where('[user_id+starts_at]')
      .between([userId], [userId, '￿'])
      .reverse()
      .limit(1)
      .toArray(),
    [userId],
  )
  const row = insights?.[0]

  // Hook 2: dismissal flag — called UNCONDITIONALLY; no-op query until row.id known
  const dismissalKey = row ? `digest-dismissed-${row.id}` : null
  const dismissal = useLiveQuery(
    () => (dismissalKey ? db.sync_meta.get(dismissalKey) : undefined),
    [dismissalKey],
  )

  // Early returns AFTER all hooks:
  if (!row) return null

  const rowStart = new Date(row.starts_at)
  const now = new Date()
  const withinSevenDays =
    rowStart.getTime() <= now.getTime() &&
    now.getTime() - rowStart.getTime() <= 7 * 24 * 60 * 60 * 1000
  if (!withinSevenDays) return null
  if (dismissal) return null

  async function dismiss() {
    await db.sync_meta.put({ key: dismissalKey as string, value: new Date().toISOString() })
  }

  // The dismiss sits under the card, not on it: a 44 px target in the card's corner
  // would cover the week's date in InsightCard's header.
  return (
    <div className="flex flex-col gap-1">
      <InsightCard insight={row} variant="card" />
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/insights"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2"
        >
          See past weeks
          <ChevronRight className="size-4" aria-hidden />
        </Link>
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={dismiss}
          aria-label="Dismiss this week's review"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
