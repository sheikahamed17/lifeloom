'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Route-segment error boundary. Catches any unhandled render/runtime error in a
 * page below the root layout (e.g. /app) and shows a RECOVERABLE card instead of
 * crashing the whole app to the framework's "couldn't load" page. Also logs the
 * error so it is diagnosable in the console (prod stacks are minified, but the
 * message + digest still narrow it down).
 *
 * Because Lifeloom is local-first, the user's data lives in IndexedDB and is never
 * at risk here — a reload almost always recovers (esp. if an older cached shell
 * was the culprit; the service worker is skipWaiting + clientsClaim).
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Lifeloom] error boundary caught:', error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center text-foreground">
      <Card className="w-full max-w-sm p-2">
        <CardHeader className="text-center">
          <CardTitle><h1 className="text-lg font-semibold">Something went wrong</h1></CardTitle>
          <CardDescription>
            Lifeloom hit an unexpected error. Your data is safe on this device — reloading usually fixes it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <div className="flex justify-center gap-2">
            <Button onClick={() => window.location.reload()}>Reload</Button>
            <Button variant="outline" onClick={() => reset()}>Try again</Button>
          </div>
          {error?.digest && (
            <p className="tabular-nums text-xs text-muted-foreground">ref: {error.digest}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
