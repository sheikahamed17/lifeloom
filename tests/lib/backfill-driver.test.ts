import { describe, it, expect, vi } from 'vitest'
import { runBackfill, BackfillHttpError, type BackfillPage } from '@/lib/backfill-driver'

const page = (processed: number, next_after: string | null, done = false, errors: unknown[] = []): BackfillPage =>
  ({ processed, next_after, done, errors })
const noSleep = async () => {}

describe('runBackfill', () => {
  it('loops pages until done, accumulating totals', async () => {
    const pages = [page(2, 'h2'), page(2, 'h4', false, [{}]), page(1, 'h5', true)]
    let i = 0
    const r = await runBackfill(async () => pages[i++])
    expect(r).toEqual({ totalProcessed: 5, totalErrors: 1, iterations: 3, after: 'h4', completed: true })
  })

  it('stops at the iteration cap if never done (runaway guard)', async () => {
    const r = await runBackfill(async () => page(1, 'h'), { maxIterations: 5 })
    expect(r.completed).toBe(false)
    expect(r.iterations).toBe(5)
  })

  it('retries a page the platform killed (503 = Workers CPU limit) and carries on from the same cursor', async () => {
    const seen: Array<string | undefined> = []
    let calls = 0
    const r = await runBackfill(async (after) => {
      seen.push(after)
      calls++
      if (calls === 2) throw new BackfillHttpError(503)
      return calls === 1 ? page(5, 'h5') : page(3, 'h8', true)
    }, { retries: 3, sleep: noSleep })
    expect(r).toMatchObject({ completed: true, totalProcessed: 8, iterations: 2 })
    expect(seen).toEqual([undefined, 'h5', 'h5'])   // the failed page is re-POSTed, not skipped
  })

  it('treats a network failure (no status) as retryable', async () => {
    let calls = 0
    const r = await runBackfill(async () => { if (calls++ === 0) throw new TypeError('Failed to fetch'); return page(1, null, true) },
      { retries: 1, sleep: noSleep })
    expect(r.completed).toBe(true)
  })

  it('returns a resume cursor instead of throwing when a page keeps failing', async () => {
    let calls = 0
    const r = await runBackfill(async () => { if (calls++ === 0) return page(5, 'h5'); throw new BackfillHttpError(503) },
      { retries: 2, sleep: noSleep })
    expect(r).toMatchObject({ completed: false, error: 'HTTP 503', after: 'h5', totalProcessed: 5 })
    expect(calls).toBe(4)   // 1 good page + 1 try + 2 retries
  })

  it('does not retry a non-retryable status (401)', async () => {
    const post = vi.fn(async () => { throw new BackfillHttpError(401) })
    const r = await runBackfill(post, { retries: 5, sleep: noSleep })
    expect(r).toMatchObject({ completed: false, error: 'HTTP 401' })
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('resumes from startAfter, backs off exponentially, pauses between pages, and reports progress', async () => {
    const sleeps: number[] = []
    const progress: number[] = []
    let calls = 0
    const r = await runBackfill(async (after) => {
      calls++
      if (calls === 1) { expect(after).toBe('resume-here'); throw new BackfillHttpError(503) }
      if (calls === 2) throw new BackfillHttpError(503)
      return calls === 3 ? page(5, 'h10') : page(2, 'h12', true)
    }, { startAfter: 'resume-here', retries: 3, pauseMs: 250, sleep: async (ms) => { sleeps.push(ms) }, onProgress: p => progress.push(p.totalProcessed) })
    expect(r).toMatchObject({ completed: true, totalProcessed: 7 })
    expect(sleeps).toEqual([1000, 2000, 250])   // backoff ×2, then the between-page pause
    expect(progress).toEqual([5, 7])
  })

  it('sends no limit when no page size is configured (server default)', async () => {
    const limits: Array<number | undefined> = []
    await runBackfill(async (_after, limit) => { limits.push(limit); return page(1, null, true) })
    expect(limits).toEqual([undefined])
  })

  it('halves the page after a platform rejection and grows it back after successes', async () => {
    const limits: Array<number | undefined> = []
    let calls = 0
    const r = await runBackfill(async (_after, limit) => {
      limits.push(limit)
      calls++
      if (calls === 2 || calls === 3) throw new BackfillHttpError(503)
      return calls === 7 ? page(1, null, true) : page(limit ?? 0, `h${calls}`)
    }, { maxPageSize: 40, minPageSize: 5, retries: 5, sleep: noSleep })
    expect(r.completed).toBe(true)
    //            ok  503 503 ok  ok  ok  done
    expect(limits).toEqual([40, 40, 20, 10, 20, 40, 40])
  })

  it('never shrinks the page below the minimum', async () => {
    const limits: Array<number | undefined> = []
    await runBackfill(async (_after, limit) => { limits.push(limit); throw new BackfillHttpError(503) },
      { maxPageSize: 8, minPageSize: 5, retries: 3, sleep: noSleep })
    expect(limits).toEqual([8, 5, 5, 5])
  })

  it('reports each cool-down before sleeping, so the UI can say it is waiting rather than stuck', async () => {
    const events: string[] = []
    let calls = 0
    await runBackfill(async () => { if (calls++ < 2) throw new BackfillHttpError(503); return page(1, null, true) }, {
      retries: 3, retryDelayMs: a => [15000, 30000][a],
      sleep: async ms => { events.push(`sleep ${ms}`) },
      onRetry: i => events.push(`retry ${i.attempt} in ${i.delayMs} (${i.error})`),
    })
    expect(events).toEqual(['retry 1 in 15000 (HTTP 503)', 'sleep 15000', 'retry 2 in 30000 (HTTP 503)', 'sleep 30000'])
  })
})
