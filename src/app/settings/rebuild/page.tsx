'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { PageShell } from '@/components/layout/page-shell'
import { SummaryPanel } from '@/components/shared/summary-panel'
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

/** A second line of status inside the green panel, under its divider. */
const PANEL_NOTE = 'flex flex-col gap-1 border-t border-panel-border pt-3.5'
const ACTION = 'lg:h-12 lg:px-8 lg:text-[15px]'

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

  const paused = result !== null && !result.completed

  return (
    <PageShell title="Rebuild server data" back={{ href: '/settings', label: 'Settings' }} description="Use it if budgets or insights look out of date.">
      {/* The live region is always mounted so each status change is announced. */}
      <div aria-live="polite" className="empty:hidden">
        {busy && (
          <SummaryPanel eyebrow="Rebuilding now" value={processed.toLocaleString()} unit="saved changes so far">
            {waitingSec !== null && (
              <div className={PANEL_NOTE}>
                <p className="text-[15px] font-semibold text-panel-highlight lg:text-[17px]">Trying again in {waitingSec} s</p>
                <p className="text-[13px] leading-[1.45] text-panel-muted">Cloudflare&apos;s free plan asked us to slow down. Nothing is lost.</p>
              </div>
            )}
          </SummaryPanel>
        )}
        {!busy && result?.completed && (
          <SummaryPanel eyebrow="Rebuild finished" value={result.totalProcessed.toLocaleString()} unit="saved changes rebuilt">
            {result.totalErrors > 0 && (
              <div className={PANEL_NOTE}>
                <p className="text-[15px] font-semibold text-panel-highlight">{result.totalErrors} changes couldn&apos;t be rebuilt</p>
                <p className="text-[13px] leading-[1.45] text-panel-muted">They stay safe in your history.</p>
              </div>
            )}
          </SummaryPanel>
        )}
        {!busy && result && paused && (
          <SummaryPanel eyebrow="Paused" value={result.totalProcessed.toLocaleString()} unit="saved changes so far">
            <div className={PANEL_NOTE}>
              {result.error && <p className="break-words text-[15px] font-semibold text-panel-highlight">{result.error}</p>}
              <p className="text-[13px] leading-[1.45] text-panel-muted">Nothing is lost. Continue where it stopped.</p>
            </div>
          </SummaryPanel>
        )}
      </div>

      <section className="flex flex-col">
        <div className="border-b border-border pb-2.5 lg:pb-3">
          <h2 className="text-[19px] font-bold tracking-[-0.02em] lg:text-[22px]">What this does</h2>
        </div>
        <p className="border-b border-border py-3.5 text-[15px] leading-normal">Rebuilds the server&apos;s copy of your data from your history. Safe to run any time. The data on this device is not touched.</p>
        <p className="border-b border-border py-3.5 text-[13px] leading-normal text-muted-foreground">It works in batches and pauses whenever Cloudflare&apos;s free plan asks it to slow down, so it can take a few minutes. Keep this page open.</p>
        <div className="flex flex-col gap-2 pt-5 lg:flex-row lg:flex-wrap">
          {paused && result && (
            <Button onClick={() => rebuild(result.after)} disabled={busy} size="lg" className={ACTION}>Continue rebuild</Button>
          )}
          <Button variant={paused ? 'outline' : 'default'} onClick={() => rebuild()} disabled={busy} size="lg" className={ACTION}>
            {busy && <Spinner className="size-4" aria-hidden />}
            {busy ? 'Rebuilding…' : 'Start rebuild'}
          </Button>
        </div>
      </section>
    </PageShell>
  )
}
