'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { AuroraBackground } from '@/components/aurora-background'
import { runBackfill, BackfillHttpError, type BackfillResult } from '@/lib/backfill-driver'

// Small pages + a pause keep each request inside the Workers Free plan's 10 ms
// CPU budget (20-op pages were killed with "exceeded CPU time limit" → 503);
// a killed page is retried from the same cursor, which is safe because the
// replay is an idempotent per-field LWW upsert.
const PAGE_SIZE = 5
const PAUSE_MS = 300
const RETRIES = 5
const MAX_PAGES = 2000   // 10,000 ops — far above a single user's op_log

export default function RebuildPage() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [processed, setProcessed] = useState(0)
  const [result, setResult] = useState<BackfillResult | null>(null)

  async function rebuild(startAfter?: string) {
    const base = startAfter ? (result?.totalProcessed ?? 0) : 0
    const baseErrors = startAfter ? (result?.totalErrors ?? 0) : 0
    setBusy(true); setResult(null); setProcessed(base)
    const res = await runBackfill(async (after) => {
      const response = await fetch('/api/admin/backfill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ after, limit: PAGE_SIZE }),
      })
      if (!response.ok) throw new BackfillHttpError(response.status)
      return response.json()
    }, {
      startAfter, retries: RETRIES, pauseMs: PAUSE_MS, maxIterations: MAX_PAGES,
      onProgress: p => setProcessed(base + p.totalProcessed),
    })
    setResult({ ...res, totalProcessed: base + res.totalProcessed, totalErrors: baseErrors + res.totalErrors })
    setBusy(false)
  }

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex w-full max-w-md md:max-w-3xl flex-col gap-6 p-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Rebuild server data</h1>
          <Button size="sm" variant="ghost" onClick={() => router.push('/settings')}>← Settings</Button>
        </header>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4 text-sm">
          <p>Re-sync your history into the server tables (fixes stale budgets/insights). Safe to run anytime — your on-device data isn&apos;t touched.</p>
          <p className="text-xs text-muted-foreground">It works in small batches to stay within Cloudflare&apos;s free-plan limits, so a large history can take a few minutes. Keep this page open.</p>
        </section>

        <section className="glass flex flex-col gap-3 rounded-2xl p-4" aria-live="polite">
          <Button onClick={() => rebuild()} disabled={busy}>{busy ? 'Rebuilding…' : 'Start rebuild'}</Button>
          {busy && <p className="text-sm text-muted-foreground">Rebuilt {processed} ops so far…</p>}
          {result?.completed && (
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-green-400">Rebuilt {result.totalProcessed} ops ✓</p>
              {result.totalErrors > 0 && <p className="text-amber-400">…{result.totalErrors} ops could not be projected (they stay safe in your history)</p>}
            </div>
          )}
          {result && !result.completed && (
            <div role="alert" className="flex flex-col gap-2 text-sm">
              <p className="text-amber-400">
                Paused after {result.totalProcessed} ops{result.error ? ` (${result.error})` : ''}. Nothing is lost — continue where it stopped.
              </p>
              <Button variant="outline" onClick={() => rebuild(result.after)} disabled={busy}>Continue rebuild</Button>
            </div>
          )}
        </section>
      </main>
    </>
  )
}
