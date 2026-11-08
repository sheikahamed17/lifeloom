'use client'

import { useEffect } from 'react'

/**
 * Root error boundary — the last line of defense. Catches errors thrown in the
 * ROOT layout itself, so it replaces the layout entirely (globals.css / Tailwind
 * are NOT guaranteed here). Uses inline styles so it always renders legibly, and
 * renders its own <html>/<body> as Next requires for global-error.
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
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0b16',
          color: '#e5e7eb',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '1.5rem',
        }}
      >
        <div
          style={{
            maxWidth: '22rem',
            width: '100%',
            textAlign: 'center',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '1rem',
            padding: '1.5rem',
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          <h1 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>Something went wrong</h1>
          <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#9ca3af' }}>
            Lifeloom hit an unexpected error. Your data is safe on this device — reloading usually fixes it.
          </p>
          <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{ borderRadius: '0.5rem', background: '#e5e7eb', color: '#0a0b16', border: 'none', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 500 }}
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => reset()}
              style={{ borderRadius: '0.5rem', background: 'transparent', color: '#e5e7eb', border: '1px solid rgba(255,255,255,0.15)', padding: '0.5rem 1rem', fontSize: '0.875rem' }}
            >
              Try again
            </button>
          </div>
          {error?.digest && (
            <p style={{ marginTop: '1rem', fontFamily: 'monospace', fontSize: '0.75rem', color: 'rgba(156,163,175,0.6)' }}>
              ref: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
