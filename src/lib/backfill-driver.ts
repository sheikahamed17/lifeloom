export type BackfillPage = { processed: number; next_after: string | null; done: boolean; errors: unknown[] }

/** A failed page request; `status` is the HTTP status when there was a response. */
export class BackfillHttpError extends Error {
  constructor(readonly status: number) { super(`HTTP ${status}`) }
}

// Worth retrying: the platform shed or killed the request (Workers "exceeded CPU
// time limit" surfaces as a 503), a gateway hiccup, rate limiting, or a network
// failure (no status). Re-POSTing a page is safe — the replay is an idempotent,
// per-field LWW upsert. A 4xx like 401 is not retried.
const RETRYABLE = new Set([429, 502, 503, 504])
const isRetryable = (err: unknown) =>
  !(err instanceof BackfillHttpError) || RETRYABLE.has(err.status)

export type BackfillProgress = { totalProcessed: number; totalErrors: number; iterations: number; after?: string }

export type BackfillResult = BackfillProgress & {
  completed: boolean
  /** Set when a page still failed after its retries; resume with `startAfter: after`. */
  error?: string
}

export type BackfillRetry = {
  /** 1-based retry number for the current page. */
  attempt: number
  delayMs: number
  error: string
  /** Page size the retry will request (when page sizing is on). */
  pageSize?: number
}

export type BackfillOptions = {
  /** Runaway guard. */
  maxIterations?: number
  /** Retries per page for retryable failures (with backoff). */
  retries?: number
  /** Backoff before retry n (0-based). */
  retryDelayMs?: (attempt: number) => number
  /** Pause between successful pages — spreads CPU across time on the Workers Free plan. */
  pauseMs?: number
  /**
   * Ops per page. Omit to let the server pick. With it set, a retryable failure
   * halves the page (down to `minPageSize`) and each success doubles it back —
   * big pages amortise the per-request overhead, small ones get through when
   * the platform is pushing back.
   */
  maxPageSize?: number
  minPageSize?: number
  /** Resume cursor from a previous run's result. */
  startAfter?: string
  onProgress?: (p: BackfillProgress) => void
  /** Called before each backoff sleep. */
  onRetry?: (r: BackfillRetry) => void
  sleep?: (ms: number) => Promise<void>
}

/**
 * Drive the chunked backfill to completion. `postPage(after, limit)` performs
 * one POST /api/admin/backfill and returns its JSON (throw BackfillHttpError on
 * a non-OK response). Loops until `done`, the iteration cap, or a page that
 * keeps failing — then returns the cursor to resume from instead of throwing,
 * so a long rebuild never restarts from zero. Pure w.r.t. the injected
 * postPage/sleep.
 */
export async function runBackfill(
  postPage: (after: string | undefined, limit: number | undefined) => Promise<BackfillPage>,
  opts: BackfillOptions = {},
): Promise<BackfillResult> {
  const {
    maxIterations = 200, retries = 0, pauseMs = 0, onProgress, onRetry, maxPageSize,
    retryDelayMs = (attempt: number) => 1000 * 2 ** attempt,
    sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms)),
  } = opts
  const minPageSize = Math.min(opts.minPageSize ?? 1, maxPageSize ?? Infinity)
  let pageSize = maxPageSize
  const progress: BackfillProgress = { totalProcessed: 0, totalErrors: 0, iterations: 0, after: opts.startAfter }

  while (progress.iterations < maxIterations) {
    let page: BackfillPage | undefined
    for (let attempt = 0; ; attempt++) {
      try { page = await postPage(progress.after, pageSize); break }
      catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        if (attempt >= retries || !isRetryable(err)) {
          return { ...progress, completed: false, error }
        }
        if (pageSize !== undefined) pageSize = Math.max(minPageSize, Math.floor(pageSize / 2))
        const delayMs = retryDelayMs(attempt)
        onRetry?.({ attempt: attempt + 1, delayMs, error, pageSize })
        await sleep(delayMs)
      }
    }
    if (pageSize !== undefined && maxPageSize !== undefined) pageSize = Math.min(maxPageSize, pageSize * 2)
    progress.iterations++
    progress.totalProcessed += page.processed
    progress.totalErrors += page.errors.length
    if (page.done || !page.next_after) {
      onProgress?.({ ...progress })
      return { ...progress, completed: true }
    }
    progress.after = page.next_after
    onProgress?.({ ...progress })
    if (pauseMs > 0) await sleep(pauseMs)
  }
  return { ...progress, completed: false }
}
