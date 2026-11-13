import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PulseLogo } from '@/components/shared/pulse-logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/** Any mistyped address (e.g. /settings/budgets) lands here instead of the framework's bare 404. */
export default function NotFound() {
  return (
    <>
      <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <Card className="w-full max-w-sm p-2">
          <CardHeader className="items-center justify-items-center text-center">
            <PulseLogo className="mx-auto mb-2 size-8" />
            <CardTitle><h1 className="text-lg font-semibold">This page doesn’t exist</h1></CardTitle>
            <CardDescription>
              The address may be mistyped, or the page has moved. Your data is safe on this device.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button size="lg" nativeButton={false} render={<Link href="/app" />} className="gap-2">
              <ArrowLeft className="size-4" aria-hidden />
              Back to Lifeloom
            </Button>
          </CardContent>
        </Card>
      </main>
    </>
  )
}
