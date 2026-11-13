'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { useDemo } from '@/hooks/use-demo'

// Shown only when DEMO_MODE=true. In-flow bar at the very top of the app (sits
// below the notch via the body's safe-area padding), so it never overlaps the
// fixed header or tab dock. Dismissible per session only — `useState` resets on
// reload, so it reappears on the next visit (not persisted to storage).
export function DemoBanner() {
  const { demoMode, resetHours } = useDemo()
  const [dismissed, setDismissed] = useState(false)

  if (!demoMode || dismissed) return null

  return (
    <div className="glass flex items-center justify-center gap-2 px-3 py-2 text-center text-xs sm:text-sm">
      <p className="flex-1 text-foreground">
        You&apos;re viewing a live demo — data resets every {resetHours ?? 4} hours.{' '}
        <a
          href="https://github.com/sheikahamed17/lifeloom#getting-started"
          target="_blank"
          rel="noopener"
          className="font-medium text-accent-2 underline underline-offset-2"
        >
          Deploy your own instance
        </a>
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss demo banner"
        className="flex-shrink-0 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
