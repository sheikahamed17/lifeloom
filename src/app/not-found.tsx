import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AuroraBackground } from '@/components/aurora-background'
import { PulseLogo } from '@/components/pulse-logo'

/** Any mistyped address (e.g. /settings/budgets) lands here instead of the framework's bare 404. */
export default function NotFound() {
  return (
    <>
      <AuroraBackground />
      <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <div className="glass w-full max-w-sm rounded-2xl p-6">
          <PulseLogo className="mx-auto size-8" />
          <h1 className="mt-4 text-lg font-semibold">This page doesn’t exist</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The address may be mistyped, or the page has moved. Your data is safe on this device.
          </p>
          <Link
            href="/app"
            className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[linear-gradient(150deg,var(--primary),var(--accent-2))] px-4 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to Lifeloom
          </Link>
        </div>
      </main>
    </>
  )
}
