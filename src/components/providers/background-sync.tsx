'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { pushPullOnce } from '@/lib/sync-client'

const PUBLIC_PREFIXES = ['/login', '/setup']
const INTERVAL_MS = 10_000
// Keep pulling until a round brings nothing new (normally two rounds: the
// catch-up, then an empty confirmation), with a cap as a safety net.
const MAX_CATCH_UP_ROUNDS = 25

/**
 * App-wide sync, mounted once in the root layout. Before this, only /app pulled
 * from the server, so opening /analytics (or any page) in a fresh browser showed
 * "No data yet" until /app had been visited once (critique, 10 Nov 2026).
 * Pages that write still call pushPullOnce themselves after a write.
 */
export function BackgroundSync() {
  const pathname = usePathname()
  const isPublic = PUBLIC_PREFIXES.some(p => pathname?.startsWith(p))

  useEffect(() => {
    if (isPublic) return
    let cancelled = false
    let userId: string | null = null
    let running = false

    async function sync(catchUp: boolean) {
      if (!userId || running || cancelled) return
      if (!navigator.onLine) return
      running = true
      try {
        const rounds = catchUp ? MAX_CATCH_UP_ROUNDS : 1
        for (let i = 0; i < rounds && !cancelled; i++) {
          const { received } = await pushPullOnce({ userId })
          if (received === 0) break
        }
      } catch (err) {
        console.error('sync', err)
      } finally {
        running = false
      }
    }

    authClient.getSession()
      .then(res => {
        if (cancelled || !res.data?.user) return
        userId = res.data.user.id
        return sync(true)
      })
      .catch(err => console.error('session', err))

    // Hidden tabs and backgrounded PWA windows don't poll; coming back catches up.
    const interval = setInterval(() => { if (document.visibilityState === 'visible') void sync(false) }, INTERVAL_MS)
    const onOnline = () => { void sync(true) }
    const onVisible = () => { if (document.visibilityState === 'visible') void sync(true) }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [isPublic])

  return null
}
