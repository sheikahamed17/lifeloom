'use client'
import { useMemo } from 'react'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { entryTimeLabel } from '@/lib/entry-time'

/** Compact, tz-aware entry timestamp: relative when recent, absolute otherwise;
 *  full date-time on hover/press via title. Uses occurred_at/created_at ISO. */
export function EntryTimestamp({ occurredAt, className }: { occurredAt: string; className?: string }) {
  const { prefs } = useUserPrefs()
  const { relative, absolute } = useMemo(
    () => entryTimeLabel(occurredAt, prefs.tz, new Date().getTime()),
    [occurredAt, prefs.tz],
  )
  return (
    <time dateTime={occurredAt} title={absolute} className={className ?? 'font-mono tabular-nums text-xs text-muted-foreground'}>
      {relative ?? absolute}
    </time>
  )
}
