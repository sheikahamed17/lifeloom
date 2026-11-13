'use client'

import { useState } from 'react'
import { Info, X } from 'lucide-react'
import { useDemo } from '@/hooks/use-demo'
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

// Shown only when DEMO_MODE=true. In-flow bar at the very top of the app (sits
// below the notch via the body's safe-area padding), so it never overlaps the
// fixed header or tab dock. Dismissible per session only; `useState` resets on
// reload, so it reappears on the next visit (not persisted to storage).
export function DemoBanner() {
  const { demoMode, resetHours } = useDemo()
  const [dismissed, setDismissed] = useState(false)

  if (!demoMode || dismissed) return null

  return (
    <Alert role="status" className="glass rounded-none border-x-0 border-t-0 py-2 pr-14 text-foreground">
      <Info aria-hidden />
      <AlertDescription className="text-foreground">
        You&apos;re viewing a live demo — data resets every {resetHours ?? 4} hours.{' '}
        <Button
          variant="link"
          className="h-auto min-h-10 p-0 font-medium"
          nativeButton={false}
          render={<a href="https://github.com/sheikahamed17/lifeloom#getting-started" target="_blank" rel="noopener" />}
        >
          Deploy your own instance
        </Button>
      </AlertDescription>
      <AlertAction className="top-1/2 -translate-y-1/2">
        <Button variant="ghost" size="icon" onClick={() => setDismissed(true)} aria-label="Dismiss demo banner" className="text-muted-foreground hover:text-foreground">
          <X className="size-4" aria-hidden />
        </Button>
      </AlertAction>
    </Alert>
  )
}
