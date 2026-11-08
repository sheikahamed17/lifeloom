import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
})

// Push event handler — fetch pending notifications and show them
self.addEventListener('push', (event: PushEvent) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch('/api/push/pending', {
          method: 'GET',
          credentials: 'include',
        })
        if (!res.ok) throw new Error(`push/pending ${res.status}`)
        const data = await res.json() as { notifications: Array<{ id: string; title: string; body: string; url: string }> }
        const { notifications } = data

        if (notifications.length > 0) {
          // Show each notification
          await Promise.all(
            notifications.map(n =>
              self.registration.showNotification(n.title, {
                body: n.body,
                data: { url: n.url },
                icon: '/icons/icon-192.png',
              }),
            ),
          )
        } else {
          // iOS requirement: always show at least one notification
          await self.registration.showNotification('Lifeloom', {
            body: 'You have updates.',
            icon: '/icons/icon-192.png',
          })
        }
      } catch (err) {
        console.error('push handler error:', err)
        // Fallback: show a generic notification (iOS visible-notification rule)
        await self.registration.showNotification('Lifeloom', {
          body: 'You have updates.',
          icon: '/icons/icon-192.png',
        })
      }
    })(),
  )
})

// Notification click handler — close the notification and focus/open the app
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const url = event.notification.data?.url ?? '/app'
      // Try to find and focus an existing window
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus()
        }
      }
      // No existing window; open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
    })(),
  )
})

serwist.addEventListeners()
