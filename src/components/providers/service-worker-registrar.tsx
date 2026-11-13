'use client'

import { useEffect } from 'react'

/**
 * Registers the Serwist-built service worker (`public/sw.js`).
 *
 * Under Turbopack the `@serwist/next` webpack plugin does not run, so it neither
 * builds NOR auto-registers the SW. `scripts/build-sw.mjs` covers the BUILD; this
 * component covers the REGISTRATION — without it nothing ever calls
 * `navigator.serviceWorker.register`, so `navigator.serviceWorker.ready` never
 * resolves and `getSubscription()`/push subscribe fail with "service worker not
 * ready". (Prod-only, mirroring Serwist's default of disabling in dev, where
 * `public/sw.js` may be stale/absent and would fight HMR.)
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(err => { console.error('SW registration failed:', err) })
  }, [])
  return null
}
