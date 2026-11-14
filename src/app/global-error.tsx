'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import './globals.css'

/**
 * Root error boundary: the last line of defense. Catches errors thrown in the
 * ROOT layout itself, so it replaces the layout entirely and renders its own
 * <html>/<body> as Next requires for global-error. It imports globals.css itself
 * (the layout's import is not applied here); the inline body style is only a
 * fallback so the page is legible even if the stylesheet fails to load.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Lifeloom] global error boundary caught:', error)
  }, [error])

  return (
    <html lang="en">
      <body
        className="flex min-h-screen items-center justify-center bg-background p-5 text-foreground antialiased"
        style={{ background: '#F2F3EE', color: '#10261F', fontFamily: 'system-ui, -apple-system, sans-serif' }}
      >
        <div className="flex w-full max-w-sm flex-col gap-6 text-left">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              Lifeloom hit an unexpected error. Your data is safe on this device. Reloading usually fixes it.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Button onClick={() => window.location.reload()}>Reload</Button>
              <Button variant="outline" onClick={() => reset()}>Try again</Button>
            </div>
            {error?.digest && (
              <p className="tabular-nums text-xs text-muted-foreground">ref: {error.digest}</p>
            )}
          </div>
        </div>
      </body>
    </html>
  )
}
