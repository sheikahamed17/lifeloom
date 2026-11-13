'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
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
          <Spinner aria-hidden /> Checking…
        </div>
      )}

      {!checking && result?.ok && (
        <Alert className="text-income">
          <CheckCircle2 aria-hidden />
          <AlertTitle>AI is connected and working.</AlertTitle>
        </Alert>
      )}

      {!checking && result && !result.ok && (
        <Alert variant="destructive">
          <XCircle aria-hidden />
          <AlertTitle>AI isn&apos;t working yet.</AlertTitle>
          <AlertDescription>
            <p className="break-words">{result.error}</p>
            <p>
              Get a free key at{' '}
              <a href="https://console.groq.com" target="_blank" rel="noopener">console.groq.com</a>, set it with <code>wrangler secret put GROQ_API_KEY</code>, then retry.
            </p>
          </AlertDescription>
        </Alert>
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
