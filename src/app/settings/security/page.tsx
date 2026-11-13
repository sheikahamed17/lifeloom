'use client'

import { useEffect, useState, useCallback } from 'react'
import { Fingerprint, Trash2, Plus, Lock } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { setPin as savePin, clearPin, isPinSet, verifyPin } from '@/lib/pin-lock'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Spinner } from '@/components/ui/spinner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { SettingsCard } from '../_ui'
import { PageShell } from '@/components/layout/page-shell'

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
    <PageShell title="Security" back={{ href: '/settings', label: 'Settings' }}>
      <SettingsCard title="Passkeys" icon={<Fingerprint className="size-5 text-accent-2" aria-hidden />}>
        <p className="text-sm text-muted-foreground">
          Add this device&apos;s Face ID or fingerprint for one-tap sign-in.
        </p>
        {passkeys.length === 0 ? (
          <Empty className="glass-soft p-3">
            <EmptyDescription>No passkeys yet.</EmptyDescription>
          </Empty>
        ) : (
          <ItemGroup className="gap-2">
            {passkeys.map(pk => (
              <Item key={pk.id} variant="muted" className="glass-soft py-1 pl-3 pr-1">
                <ItemContent className="min-w-0">
                  <ItemTitle className="min-w-0 truncate">{pk.name || 'Passkey'}</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    onClick={() => setRemoving(pk)}
                    disabled={busy}
                    aria-label={`Remove passkey ${pk.name || ''}`.trim()}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
        <Button onClick={addPasskey} disabled={busy} className="w-full">
          {busy ? <Spinner className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />} {busy ? 'Working…' : 'Add passkey'}
        </Button>
        {error && (
          <Alert variant="destructive">
            <AlertDescription className="text-destructive">{error}</AlertDescription>
          </Alert>
        )}
      </SettingsCard>

      <SettingsCard title="App PIN" icon={<Lock className="size-5 text-accent-2" aria-hidden />}>
        <p className="text-sm text-muted-foreground">
          {hasPin ? 'A PIN unlocks the app each time you open it.' : 'Set a PIN to lock the app each time you open it.'}
        </p>
        <div className="flex flex-col gap-2">
          {hasPin && (
            <Input type="password" inputMode="numeric" placeholder="Current PIN" value={current}
              onChange={e => setCurrent(e.target.value)} aria-label="Current PIN" className="tabular-nums" />
          )}
          <Input type="password" inputMode="numeric" placeholder={hasPin ? 'New PIN' : 'New PIN (4+ digits)'} value={next}
            onChange={e => setNext(e.target.value)} aria-label="New PIN" className="tabular-nums" />
          <div className="flex gap-2">
            <Button onClick={saveNewPin} disabled={busy} className="flex-1">{hasPin ? 'Change PIN' : 'Set PIN'}</Button>
            {hasPin && <Button variant="secondary" onClick={removePin} disabled={busy}>Turn off</Button>}
          </div>
          {pinMsg && (
            <Alert>
              <AlertDescription>{pinMsg}</AlertDescription>
            </Alert>
          )}
        </div>
      </SettingsCard>

      <AlertDialog open={removing !== null} onOpenChange={open => { if (!open) setRemoving(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this passkey?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.name || 'This passkey'} will no longer sign you in. You can add it again from this page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
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
