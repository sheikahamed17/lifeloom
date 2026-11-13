import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { ServiceWorkerRegistrar } from '@/components/service-worker-registrar'
import { DemoBanner } from '@/components/demo-banner'
import { BackgroundSync } from '@/components/background-sync'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lifeloom',
  description: 'Your money, tasks, notes and learning in one private, local-first app',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Lifeloom', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  themeColor: '#0a0b16',
  // Allow pinch-zoom: never disable user scaling (WCAG 1.4.4) — it also lets the
  // user shrink the view if the app feels too large on their device. Mobile inputs
  // are 16px (text-base), so re-enabling zoom does NOT reintroduce iOS's
  // focus-zoom-on-input. No maximumScale / userScalable:false.
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen overflow-x-clip bg-background text-foreground antialiased">
        <ServiceWorkerRegistrar />
        <BackgroundSync />
        <DemoBanner />
        {children}
      </body>
    </html>
  )
}
