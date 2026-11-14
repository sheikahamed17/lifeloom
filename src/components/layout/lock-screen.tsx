'use client'

import { useState } from 'react'
import { verifyPin } from '@/lib/pin-lock'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
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
      <main className="flex min-h-[calc(100dvh_-_env(safe-area-inset-top))] items-center justify-center p-5">
        <div className="flex w-full max-w-xs flex-col gap-8">
          <div className="flex flex-col gap-10">
            <p className="text-xl font-bold tracking-[-0.02em]">Lifeloom</p>
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">Enter your PIN</h1>
          </div>
            <form onSubmit={submit} className="flex flex-col gap-4">
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={pin}
                onChange={e => setPin(e.target.value)}
                aria-label="PIN"
                className="h-14 text-center text-2xl tabular-nums tracking-[0.4em] md:text-2xl"
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
        </div>
      </main>
    </>
  )
}
