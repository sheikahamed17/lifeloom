'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { verifyPin } from '@/lib/pin-lock'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const ok = await verifyPin(pin)
    setBusy(false)
    if (ok) { onUnlock(); return }
    setError('Incorrect PIN.')
    setPin('')
  }

  return (
    <>
      <main className="flex min-h-[calc(100dvh_-_env(safe-area-inset-top))] items-center justify-center p-4">
        <Card className="w-full max-w-xs p-2">
          <CardHeader className="items-center justify-items-center text-center">
            <Lock className="mb-2 size-8 text-accent-2" aria-hidden />
            <CardTitle><h1 className="text-lg font-semibold">Enter your PIN</h1></CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="flex flex-col gap-4">
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={pin}
                onChange={e => setPin(e.target.value)}
                aria-label="PIN"
                className="h-12 text-center tabular-nums text-2xl tracking-[0.4em] md:text-2xl"
              />
              <Button type="submit" size="lg" disabled={busy || pin.length === 0}>
                {busy ? 'Checking…' : 'Unlock'}
              </Button>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription className="text-destructive">{error}</AlertDescription>
                </Alert>
              )}
            </form>
          </CardContent>
        </Card>
      </main>
    </>
  )
}
