'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
        className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground antialiased"
        style={{ background: '#0a0b16', color: '#e5e7eb', fontFamily: 'system-ui, -apple-system, sans-serif' }}
      >
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
              <p className="font-mono text-xs text-muted-foreground">ref: {error.digest}</p>
            )}
          </CardContent>
        </Card>
      </body>
    </html>
  )
}
