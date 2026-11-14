'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { AiCheckResult } from '@/lib/setup'
import { STEP_BUTTON, STEP_NOTICE, StepActions, StepHeading } from '@/components/setup/step-layout'

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
    <div className="flex flex-col gap-5">
      <StepHeading title="Check AI is working">
        <p>
          Lifeloom uses Groq for voice, plain-language capture and questions about your data. This confirms your key works.
        </p>
      </StepHeading>

      {checking && (
        <p role="status" className="flex items-center gap-2 py-3.5 text-[15px] text-muted-foreground">
          <Spinner aria-hidden /> Checking…
        </p>
      )}

      {!checking && result?.ok && (
        <Alert className={STEP_NOTICE}>
          <AlertTitle className="flex items-center gap-2 text-[15px] font-semibold lg:text-base">
            <CheckCircle2 className="size-4.5 shrink-0" aria-hidden />
            AI is connected and working.
          </AlertTitle>
        </Alert>
      )}

      {!checking && result && !result.ok && (
        <Alert className={STEP_NOTICE}>
          <AlertTitle className="flex items-center gap-2 text-[15px] font-semibold text-warning lg:text-base">
            <XCircle className="size-4.5 shrink-0" aria-hidden />
            AI is not working yet
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-1.5 leading-normal [&_p:not(:last-child)]:mb-0">
            <p className="break-words text-foreground">{result.error}</p>
            <p className="text-[13px] lg:text-sm">
              Get a free key at{' '}
              <a href="https://console.groq.com" target="_blank" rel="noopener" className="text-foreground">console.groq.com</a>, set it with <code className="text-xs text-foreground lg:text-[13px]">wrangler secret put GROQ_API_KEY</code>, then retry.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <StepActions>
        {!checking && result && !result.ok && (
          <Button variant="outline" onClick={retry} size="lg" className={STEP_BUTTON}>Retry</Button>
        )}
        <Button onClick={onNext} disabled={checking} size="lg" className={STEP_BUTTON}>
          {result?.ok ? 'Continue' : 'Continue anyway'}
        </Button>
      </StepActions>

      {!checking && result && !result.ok && (
        <p className="-mt-2 text-[13px] leading-normal text-muted-foreground">
          You can finish setup, but capture, voice and questions will not work until the key is fixed.
        </p>
      )}
    </div>
  )
}
