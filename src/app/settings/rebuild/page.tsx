'use client'

import { useState } from 'react'
import { CircleCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageShell } from '@/components/page-shell'
import { runBackfill, BackfillHttpError, type BackfillResult } from '@/lib/backfill-driver'

// Workers Free plan: 10 ms CPU per request, tolerated only "infrequently" —
// once a Worker overruns consistently, Cloudflare kills its requests (503).
// Every request pays a fixed framework cost above 10 ms, so the rebuild uses
// few, large pages (the server caps at 50) spaced apart, and on a 503 it cools
// down for a long while and retries a smaller page from the same cursor (safe:
// the replay is an idempotent per-field LWW upsert). 5-op pages made it worse —
// 10× the requests, each over budget.
const MAX_PAGE = 50
const MIN_PAGE = 10
const PAUSE_MS = 2000
const COOLDOWN_MS = [15_000, 30_000, 60_000, 60_000, 60_000, 60_000]
const MAX_PAGES = 2000   // far above a single user's op_log

export default function RebuildPage() {
  const [busy, setBusy] = useState(false)
  const [processed, setProcessed] = useState(0)
  const [waitingSec, setWaitingSec] = useState<number | null>(null)
  const [result, setResult] = useState<BackfillResult | null>(null)

  async function rebuild(startAfter?: string) {
    const base = startAfter ? (result?.totalProcessed ?? 0) : 0
    const baseErrors = startAfter ? (result?.totalErrors ?? 0) : 0
    setBusy(true); setResult(null); setProcessed(base); setWaitingSec(null)
    const res = await runBackfill(async (after, limit) => {
      const response = await fetch('/api/admin/backfill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ after, limit }),
      })
      if (!response.ok) throw new BackfillHttpError(response.status)
      return response.json()
    }, {
      startAfter, maxPageSize: MAX_PAGE, minPageSize: MIN_PAGE, pauseMs: PAUSE_MS, maxIterations: MAX_PAGES,
      retries: COOLDOWN_MS.length, retryDelayMs: attempt => COOLDOWN_MS[attempt],
      onRetry: r => setWaitingSec(Math.round(r.delayMs / 1000)),
      onProgress: p => { setWaitingSec(null); setProcessed(base + p.totalProcessed) },
    })
    setWaitingSec(null)
    setResult({ ...res, totalProcessed: base + res.totalProcessed, totalErrors: baseErrors + res.totalErrors })
    setBusy(false)
  }

  return (
    <PageShell title="Rebuild server data" back={{ href: '/settings', label: 'Settings' }}>
      <section className="glass flex flex-col gap-2 rounded-2xl p-4 text-sm">
        <p>Rebuilds the server&apos;s copy of your data from your history. Use it if budgets or insights look out of date. Safe to run any time; the data on this device isn&apos;t touched.</p>
        <p className="text-xs text-muted-foreground">It works in batches and pauses whenever Cloudflare&apos;s free plan asks it to slow down, so it can take a few minutes. Keep this page open.</p>
      </section>

      <section className="glass flex flex-col gap-3 rounded-2xl p-4" aria-live="polite">
        <Button onClick={() => rebuild()} disabled={busy}>{busy ? 'Rebuilding…' : 'Start rebuild'}</Button>
        {busy && <p className="text-sm text-muted-foreground">Rebuilt {processed} saved changes so far…</p>}
        {busy && waitingSec !== null && (
          <p className="text-sm text-muted-foreground">Cloudflare&apos;s free plan asked us to slow down. Trying again in {waitingSec} s; nothing is lost.</p>
        )}
        {result?.completed && (
          <div className="flex flex-col gap-2 text-sm">
            <p className="flex items-center gap-2 text-income">
              <CircleCheck className="size-4 shrink-0" aria-hidden />
              Rebuilt {result.totalProcessed} saved changes.
            </p>
            {result.totalErrors > 0 && <p className="text-warning">{result.totalErrors} changes couldn&apos;t be rebuilt. They stay safe in your history.</p>}
          </div>
        )}
        {result && !result.completed && (
          <div role="alert" className="flex flex-col gap-2 text-sm">
            <p className="text-warning">
              Paused after {result.totalProcessed} saved changes{result.error ? ` (${result.error})` : ''}. Nothing is lost; continue where it stopped.
            </p>
            <Button variant="outline" onClick={() => rebuild(result.after)} disabled={busy}>Continue rebuild</Button>
          </div>
        )}
      </section>
    </PageShell>
  )
}
