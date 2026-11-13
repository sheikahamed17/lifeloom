'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AiCheckResult } from '@/lib/setup'

export function VerifyAi({ onNext }: { onNext: () => void }) {
  const [result, setResult] = useState<AiCheckResult | null>(null)
  const [retrying, setRetrying] = useState(false)

  // Initial check on mount — setState only inside the async callbacks (never
  // synchronously in the effect body, which the lint rules reject).
  useEffect(() => {
    let alive = true
    fetch('/api/setup/verify-ai', { method: 'POST' })
      .then(r => r.json() as Promise<AiCheckResult>)
      .then(r => { if (alive) setResult(r) })
      .catch(() => { if (alive) setResult({ ok: false, error: 'Could not reach the server. Try again.' }) })
    return () => { alive = false }
  }, [])

  async function retry() {
    setRetrying(true)
    setResult(null)
    try {
      const res = await fetch('/api/setup/verify-ai', { method: 'POST' })
      setResult(await res.json() as AiCheckResult)
    } catch {
      setResult({ ok: false, error: 'Could not reach the server. Try again.' })
    } finally {
      setRetrying(false)
    }
  }

  const checking = result === null || retrying

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 text-center">
        <h2 className="text-xl font-semibold">Check AI is working</h2>
        <p className="text-sm text-muted-foreground">
          Lifeloom uses Groq for voice, natural-language capture, and &ldquo;ask your data&rdquo;. Let&apos;s confirm your key works.
        </p>
      </div>

      {checking && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Checking…
        </div>
      )}

      {!checking && result?.ok && (
        <div className="flex items-center gap-2 rounded-lg bg-income/10 p-3 text-sm text-income">
          <CheckCircle2 className="size-5 flex-shrink-0" aria-hidden /> AI is connected and working.
        </div>
      )}

      {!checking && result && !result.ok && (
        <div className="flex flex-col gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <XCircle className="size-5 flex-shrink-0" aria-hidden /> AI isn&apos;t working yet.
          </div>
          <p className="break-words text-xs opacity-90">{result.error}</p>
          <p className="text-xs opacity-90">
            Get a free key at{' '}
            <a className="underline" href="https://console.groq.com" target="_blank" rel="noopener">console.groq.com</a>, set it with <code>wrangler secret put GROQ_API_KEY</code>, then retry.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        {!checking && result && !result.ok && (
          <Button variant="secondary" onClick={retry} className="flex-1">Retry</Button>
        )}
        <Button onClick={onNext} disabled={checking} className="flex-1">
          {result?.ok ? 'Continue' : 'Continue anyway'}
        </Button>
      </div>

      {!checking && result && !result.ok && (
        <p className="text-center text-xs text-muted-foreground">
          You can finish setup, but AI capture / voice / queries won&apos;t work until the key is fixed.
        </p>
      )}
    </div>
  )
}
