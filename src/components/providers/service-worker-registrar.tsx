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
 * ready". (Registers in production only; in dev it instead removes any leftover worker.)
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') {
      // Dev: a worker left over from a production build/preview on this same origin
      // (localhost:3000) would keep serving stale files and fight HMR. Remove it and
      // its caches once, then reload so the page loads fresh. No worker -> no reload.
      const clearCaches = async () => {
        if ('caches' in window) await Promise.all((await caches.keys()).map(k => caches.delete(k)))
      }
      navigator.serviceWorker
        .getRegistrations()
        .then(async regs => {
          await Promise.all(regs.map(r => r.unregister()))
          await clearCaches()
          if (regs.length > 0) window.location.reload()
        })
        .catch(() => {})
      return
    }
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(err => { console.error('SW registration failed:', err) })
  }, [])
  return null
}
