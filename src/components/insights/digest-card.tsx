'use client'

import Link from 'next/link'
import { X } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/dexie'
import { InsightCard } from '@/components/insights/insight-card'
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

  // The dismiss sits under the review, not on it: a 44 px target in the corner
  // would cover the week's date in InsightCard's heading row.
  return (
    <div className="flex flex-col gap-1">
      <InsightCard insight={row} variant="card" />
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="link"
          nativeButton={false}
          render={<Link href="/insights" />}
          className="px-0 text-sm"
        >
          See past weeks
        </Button>
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={dismiss}
          aria-label="Dismiss this week's review"
          className="-mr-3 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
