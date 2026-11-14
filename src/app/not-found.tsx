import Link from 'next/link'
import { Button } from '@/components/ui/button'

/** Any mistyped address (e.g. /settings/budgets) lands here instead of the framework's bare 404. */
export default function NotFound() {
  return (
    <>
      <main className="flex min-h-screen flex-col items-center justify-center p-5">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <p className="text-xl font-bold tracking-[-0.02em]">Lifeloom</p>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">This page doesn’t exist</h1>
            <p className="text-sm text-muted-foreground">
              The address may be mistyped, or the page has moved. Your data is safe on this device.
            </p>
          </div>
          <Button size="lg" nativeButton={false} render={<Link href="/app" />}>
            Back to Lifeloom
          </Button>
        </div>
      </main>
    </>
  )
}
