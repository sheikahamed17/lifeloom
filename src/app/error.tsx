'use client'

import { useEffect } from 'react'

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
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Lifeloom hit an unexpected error. Your data is safe on this device — reloading usually fixes it.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-foreground"
          >
            Try again
          </button>
        </div>
        {error?.digest && (
          <p className="mt-4 font-mono text-xs text-muted-foreground/60">ref: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
