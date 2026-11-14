'use client'

import { useEffect, useState, useCallback } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { setPin as savePin, clearPin, isPinSet, verifyPin } from '@/lib/pin-lock'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { SettingsCard } from '../_ui'
import { PageShell } from '@/components/layout/page-shell'
import { cn } from '@/lib/utils'

const LABEL = 'text-[13px] font-semibold text-muted-foreground'
const HELP = 'text-[13px] leading-[1.45] text-muted-foreground'
const COUNT = 'text-[13px] font-normal text-muted-foreground lg:text-sm'
/** Alerts sit on a white rounded surface, like the other things that need attention. */
const ALERT = 'rounded-2xl border-transparent px-4 py-3.5'

interface PasskeyRow { id: string; name?: string | null; createdAt?: string | number | null }

export default function SecurityPage() {
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hasPin, setHasPin] = useState(() => typeof window !== 'undefined' ? isPinSet() : false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [pinMsg, setPinMsg] = useState('')
  const [removing, setRemoving] = useState<PasskeyRow | null>(null)

  useEffect(() => {
    async function loadPasskeys() {
      const res = await authClient.passkey.listUserPasskeys()
      if (!res.error && res.data) setPasskeys(res.data as unknown as PasskeyRow[])
    }
    loadPasskeys()
  }, [])

  const refresh = useCallback(async () => {
    const res = await authClient.passkey.listUserPasskeys()
    if (!res.error && res.data) setPasskeys(res.data as unknown as PasskeyRow[])
  }, [])

  async function addPasskey() {
    setBusy(true); setError('')
    try {
      const res = await authClient.passkey.addPasskey({ name: 'This device' })
      if (res?.error) setError(res.error.message ?? 'Could not add passkey.')
      await refresh()
    } catch {
      setError('Passkey registration was cancelled or is unsupported on this device.')
    } finally { setBusy(false) }
  }

  async function remove(id: string) {
    setBusy(true); setError('')
    try {
      await authClient.passkey.deletePasskey({ id })
      await refresh()
    } finally { setBusy(false) }
  }

  async function saveNewPin() {
    setPinMsg('')
    if (hasPin && !(await verifyPin(current))) { setPinMsg('Current PIN is incorrect.'); return }
    if (next.length < 4) { setPinMsg('Use at least 4 digits.'); return }
    await savePin(next)
    setHasPin(true); setCurrent(''); setNext(''); setPinMsg('PIN saved.')
  }

  async function removePin() {
    setPinMsg('')
    if (hasPin && !(await verifyPin(current))) { setPinMsg('Current PIN is incorrect.'); return }
    clearPin(); setHasPin(false); setCurrent(''); setNext(''); setPinMsg('PIN removed.')
  }

  return (
    <PageShell title="Security" back={{ href: '/settings', label: 'Settings' }} description="Passkeys for sign-in and a PIN for this device.">
      <SettingsCard
        title="Passkeys"
        action={passkeys.length > 0 ? <p className={COUNT}>{passkeys.length} saved</p> : undefined}
        className="gap-0"
        contentClassName="gap-0"
      >
        <p className={cn(HELP, 'border-b border-border py-3')}>
          Add this device&apos;s Face ID or fingerprint for one-tap sign-in.
        </p>
        {passkeys.length === 0 ? (
          <Empty className="items-start border-b border-border p-0 py-4 text-left">
            <EmptyDescription>No passkeys yet.</EmptyDescription>
          </Empty>
        ) : (
          <ul className="flex flex-col">
            {passkeys.map(pk => (
              <li key={pk.id} className="flex min-h-14 items-center gap-3 border-b border-border">
                <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{pk.name || 'Passkey'}</p>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  onClick={() => setRemoving(pk)}
                  disabled={busy}
                  aria-label={`Remove passkey ${pk.name || ''}`.trim()}
                  className="-mr-3 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button variant="outline" onClick={addPasskey} disabled={busy} className="mt-4 h-12 gap-2 text-[15px] lg:w-fit lg:px-6">
          {busy ? <Spinner className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />} {busy ? 'Working…' : 'Add passkey'}
        </Button>
        {error && (
          <Alert variant="destructive" className={cn(ALERT, 'mt-3')}>
            <AlertDescription className="text-destructive">{error}</AlertDescription>
          </Alert>
        )}
      </SettingsCard>

      <SettingsCard
        title="App PIN"
        action={<p className={COUNT}>{hasPin ? 'On' : 'Off'}</p>}
        className="gap-0"
        contentClassName="gap-0"
      >
        <p className={cn(HELP, 'pt-3')}>
          {hasPin ? 'A PIN unlocks the app each time you open it.' : 'Set a PIN to lock the app each time you open it.'}
        </p>
        <div className="grid gap-4 pt-4 lg:grid-cols-2">
          {hasPin && (
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="pin-current" className={LABEL}>Current PIN</Label>
              <Input id="pin-current" type="password" inputMode="numeric" value={current}
                onChange={e => setCurrent(e.target.value)} aria-label="Current PIN" className="tabular-nums" />
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="pin-new" className={LABEL}>New PIN, at least 4 digits</Label>
            <Input id="pin-new" type="password" inputMode="numeric" value={next}
              onChange={e => setNext(e.target.value)} aria-label="New PIN" className="tabular-nums" />
          </div>
        </div>
        {pinMsg && (
          <Alert className={cn(ALERT, 'mt-4')}>
            <AlertDescription className="text-foreground">{pinMsg}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-2 pt-5 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-5">
          <Button onClick={saveNewPin} disabled={busy} size="lg" className="lg:h-12 lg:px-8 lg:text-[15px]">{hasPin ? 'Change PIN' : 'Set PIN'}</Button>
          {hasPin && <Button variant="link" onClick={removePin} disabled={busy} className="px-0">Turn off the PIN</Button>}
        </div>
      </SettingsCard>

      <AlertDialog open={removing !== null} onOpenChange={open => { if (!open) setRemoving(null) }}>
        <AlertDialogContent className="gap-5 rounded-3xl p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[19px] font-bold tracking-[-0.02em]">Remove this passkey?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.name || 'This passkey'} will no longer sign you in. You can add it again from this page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mx-0 mb-0 rounded-none border-0 bg-transparent p-0">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => { const id = removing?.id; setRemoving(null); if (id) remove(id) }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}
