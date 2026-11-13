'use client'

import { useEffect, useState, useCallback } from 'react'
import { Fingerprint, Trash2, Plus, Lock } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { setPin as savePin, clearPin, isPinSet, verifyPin } from '@/lib/pin-lock'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageShell } from '@/components/page-shell'

interface PasskeyRow { id: string; name?: string | null; createdAt?: string | number | null }

export default function SecurityPage() {
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hasPin, setHasPin] = useState(() => typeof window !== 'undefined' ? isPinSet() : false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [pinMsg, setPinMsg] = useState('')

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
      <section className="glass flex flex-col gap-3 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <Fingerprint className="size-5 text-accent-2" aria-hidden />
          <h2 className="text-sm font-semibold text-muted-foreground">Passkeys</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Add this device&apos;s Face ID or fingerprint for one-tap sign-in.
        </p>
        <ul className="flex flex-col gap-2">
          {passkeys.length === 0 && (
            <li className="text-sm text-muted-foreground">No passkeys yet.</li>
          )}
          {passkeys.map(pk => (
            <li key={pk.id} className="glass-soft flex items-center justify-between gap-2 rounded-lg py-1 pl-3 pr-1">
              <span className="min-w-0 truncate text-sm">{pk.name || 'Passkey'}</span>
              <Button
                variant="ghost"
                size="icon-lg"
                onClick={() => remove(pk.id)}
                disabled={busy}
                aria-label={`Remove passkey ${pk.name || ''}`.trim()}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        <Button onClick={addPasskey} disabled={busy} className="w-full">
          <Plus className="size-4" aria-hidden /> {busy ? 'Working…' : 'Add passkey'}
        </Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </section>

      <section className="glass flex flex-col gap-3 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <Lock className="size-5 text-accent-2" aria-hidden />
          <h2 className="text-sm font-semibold text-muted-foreground">App PIN</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {hasPin ? 'A PIN unlocks the app each time you open it.' : 'Set a PIN to lock the app each time you open it.'}
        </p>
        <div className="flex flex-col gap-2">
          {hasPin && (
            <Input type="password" inputMode="numeric" placeholder="Current PIN" value={current}
              onChange={e => setCurrent(e.target.value)} aria-label="Current PIN" className="font-mono" />
          )}
          <Input type="password" inputMode="numeric" placeholder={hasPin ? 'New PIN' : 'New PIN (4+ digits)'} value={next}
            onChange={e => setNext(e.target.value)} aria-label="New PIN" className="font-mono" />
          <div className="flex gap-2">
            <Button onClick={saveNewPin} disabled={busy} className="flex-1">{hasPin ? 'Change PIN' : 'Set PIN'}</Button>
            {hasPin && <Button variant="secondary" onClick={removePin} disabled={busy}>Turn off</Button>}
          </div>
          {pinMsg && <p role="alert" className="text-sm text-muted-foreground">{pinMsg}</p>}
        </div>
      </section>
    </PageShell>
  )
}
