'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { usePushSubscription } from '@/hooks/use-push-subscription'
import { pushTestMessage, type PushTestResult } from '@/lib/push-test-message'
import { isVoiceAnswersEnabled, setVoiceAnswersEnabled } from '@/lib/speak'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { IANA_TIMEZONES } from '@/lib/iana-timezones'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuroraBackground } from '@/components/aurora-background'
import { Label } from '@/components/ui/label'

export default function PreferencesPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const { prefs, savePrefs } = useUserPrefs()
  const { status: pushStatus, error: pushError, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushSubscription()
  const [state, setState] = useState({
    primaryCurrency: prefs.primary_currency,
    tz: prefs.tz,
    fxOverrides: prefs.fx_overrides,
    salaryReminder: prefs.salary_reminder,
  })
  const [tzQuery, setTzQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [speakAnswers, setSpeakAnswers] = useState(true)
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const previousPrefsRef = useRef(prefs)

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  // Sync local state with prefs when they change (but not while dirty)
  useEffect(() => {
    if (!dirty && (previousPrefsRef.current.primary_currency !== prefs.primary_currency || previousPrefsRef.current.tz !== prefs.tz || previousPrefsRef.current.salary_reminder !== prefs.salary_reminder)) {
      setState({
        primaryCurrency: prefs.primary_currency,
        tz: prefs.tz,
        fxOverrides: prefs.fx_overrides,
        salaryReminder: prefs.salary_reminder,
      })
    }
    previousPrefsRef.current = prefs
  }, [dirty, prefs])

  // Initialize speakAnswers from localStorage (avoid SSR mismatch)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSpeakAnswers(isVoiceAnswersEnabled())
  }, [])

  const filteredTzs = tzQuery
    ? IANA_TIMEZONES.filter(z => z.toLowerCase().includes(tzQuery.toLowerCase()))
    : IANA_TIMEZONES.slice(0, 20)

  async function save() {
    setBusy(true)
    setSaveError(null)
    try {
      await savePrefs({ primary_currency: state.primaryCurrency, tz: state.tz, fx_overrides: state.fxOverrides, salary_reminder: state.salaryReminder })
      setDirty(false)
    } catch (err) {
      console.error('save prefs', err)
      setSaveError((err as Error).message || 'Could not save preferences. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    setTesting(true); setTestMsg(null)
    try {
      const res = await fetch('/api/push/test', { method: 'POST' })
      const body = await res.json().catch(() => null) as PushTestResult | null
      setTestMsg(body ? pushTestMessage(body) : "Couldn't reach the server — try again.")
    } catch {
      setTestMsg("Couldn't reach the server — try again.")
    } finally {
      setTesting(false)
    }
  }

  function detectBrowserTz() {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
      setState(s => ({ ...s, tz: detected }))
      setDirty(true)
      setSaveError(null)
    } catch {
      /* ignore */
    }
  }

  if (!userId) return <p className="p-8">Loading…</p>

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex w-full max-w-md md:max-w-3xl flex-col gap-6 p-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Preferences</h1>
          <Button size="sm" variant="ghost" onClick={() => router.push('/settings')}>← Settings</Button>
        </header>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <Label className="uppercase text-xs">Primary currency</Label>
          <select
            value={state.primaryCurrency}
            onChange={e => { const v = e.target.value; setState(s => ({ ...s, primaryCurrency: v })); setDirty(true); setSaveError(null) }}
            className="glass-soft rounded-lg border border-input px-3 py-2 text-sm transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-accent-2"
          >
            {SUPPORTED_CURRENCIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Dashboard sums convert non-primary entries via ECB rates (Phase 2.4).
          </p>
        </section>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <label className="flex items-center justify-between gap-3 min-h-[44px]">
            <span className="flex flex-col">
              <span className="text-sm font-medium">Remind me to log my salary</span>
              <span className="text-xs text-muted-foreground">A push on the last working day of each month — for income that doesn&apos;t arrive by email. Needs notifications enabled.</span>
            </span>
            <input
              type="checkbox"
              checked={state.salaryReminder}
              onChange={e => { const v = e.currentTarget.checked; setState(s => ({ ...s, salaryReminder: v })); setDirty(true); setSaveError(null) }}
              className="h-5 w-5 flex-shrink-0 accent-accent-2"
              aria-label="Remind me to log my salary on the last working day of the month"
            />
          </label>
        </section>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <Label className="uppercase text-xs">Manual exchange rates</Label>
          <p className="text-xs text-muted-foreground">Used only when the daily ECB feed has no rate for a currency (e.g. AED).</p>
          <ul className="flex flex-col gap-1">
            {Object.entries(state.fxOverrides).map(([cur, rate]) => (
              <li key={cur} className="flex items-center justify-between text-sm">
                <span className="font-mono tabular-nums">1 EUR = {rate} {cur}</span>
                <button
                  type="button"
                  aria-label={`Remove ${cur} rate`}
                  onClick={() => { setState(s => { const n = { ...s.fxOverrides }; delete n[cur]; return { ...s, fxOverrides: n } }); setDirty(true); setSaveError(null) }}
                  className="text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded px-2 py-1"
                >
                  Remove
                </button>
              </li>
            ))}
            {Object.keys(state.fxOverrides).length === 0 && <li className="text-xs text-muted-foreground">None set.</li>}
          </ul>
          <FxAddRow onAdd={(cur, rate) => { setState(s => ({ ...s, fxOverrides: { ...s.fxOverrides, [cur]: rate } })); setDirty(true); setSaveError(null) }} />
        </section>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <Label className="uppercase text-xs">Time zone</Label>
          <Input
            value={tzQuery}
            onChange={e => setTzQuery(e.target.value)}
            placeholder="Search timezones…"
          />
          <div role="listbox" aria-label="Time zone" className="glass-soft max-h-48 overflow-y-auto rounded-lg border border-input">
            {filteredTzs.map(z => (
              <button
                key={z}
                type="button"
                role="option"
                aria-selected={state.tz === z}
                onClick={() => { setState(s => ({ ...s, tz: z })); setTzQuery(''); setDirty(true); setSaveError(null) }}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-accent-2 outline-none ${
                  state.tz === z ? 'bg-white/15 font-medium' : ''
                }`}
              >
                <span>{z}</span>
                {state.tz === z && <span aria-hidden>✓</span>}
              </button>
            ))}
            {filteredTzs.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No matches.</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Current: <code className="font-mono">{state.tz}</code>.
            {' '}
            <button type="button" className="underline focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded" onClick={detectBrowserTz}>
              Detect from browser
            </button>
          </p>
        </section>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <Label className="uppercase text-xs">Notifications</Label>
          {pushStatus === 'unsupported' && (
            <p className="text-xs text-muted-foreground">
              Web Push is not supported on this device.
            </p>
          )}
          {pushStatus === 'denied' && (
            <p className="text-xs text-rose-500">
              Notifications are blocked in your browser settings. Unblock &quot;Lifeloom&quot; in notification permissions to enable.
            </p>
          )}
          {pushStatus === 'subscribed' && (
            <>
              <button
                type="button"
                onClick={pushUnsubscribe}
                className="glass rounded-lg px-3 py-2 text-sm font-medium text-emerald-400 hover:bg-white/15 transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
              >
                ✓ Notifications enabled — tap to disable
              </button>
              <button
                type="button"
                onClick={sendTest}
                disabled={testing}
                className="glass rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/15 transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none disabled:opacity-50"
              >
                {testing ? 'Sending…' : 'Send test notification'}
              </button>
              {testMsg && <p className="text-xs text-muted-foreground">{testMsg}</p>}
            </>
          )}
          {pushStatus === 'unsubscribed' && (
            <>
              <Button onClick={pushSubscribe}>
                Enable notifications
              </Button>
              {pushError && (
                <p role="alert" className="mt-2 text-xs text-rose-500 break-words">{pushError}</p>
              )}
            </>
          )}
          {pushStatus === 'pending' && (
            <p className="text-xs text-muted-foreground">Loading…</p>
          )}
        </section>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4">
          <h2 className="text-sm font-medium">Voice answers</h2>
          <p className="text-xs text-muted-foreground">Read spoken query answers aloud after a voice question.</p>
          <button
            type="button"
            aria-pressed={speakAnswers}
            onClick={() => { const next = !speakAnswers; setSpeakAnswers(next); setVoiceAnswersEnabled(next) }}
            className="glass rounded-lg px-3 py-2 min-h-[44px] text-sm font-medium hover:bg-white/15 transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none w-fit"
          >
            {speakAnswers ? '🔊 Speaking enabled — tap to mute' : '🔇 Muted — tap to enable'}
          </button>
        </section>

        <div className="flex flex-col gap-2">
          {saveError && (
            <p role="alert" className="text-sm text-rose-600">{saveError}</p>
          )}
          <div className="flex gap-2">
            <Button onClick={save} disabled={!dirty || busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
            {dirty && (
              <Button variant="ghost" onClick={() => {
                setState({
                  primaryCurrency: prefs.primary_currency,
                  tz: prefs.tz,
                  fxOverrides: prefs.fx_overrides,
                  salaryReminder: prefs.salary_reminder,
                })
                setDirty(false)
                setSaveError(null)
              }}>Discard</Button>
            )}
          </div>
        </div>
      </main>
    </>
  )
}

function FxAddRow({ onAdd }: { onAdd: (cur: string, rate: number) => void }) {
  const [cur, setCur] = useState<string>(SUPPORTED_CURRENCIES[0])
  const [rate, setRate] = useState('')
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">1 EUR =</span>
      <Input value={rate} onChange={e => setRate(e.target.value)} inputMode="decimal" placeholder="rate" aria-label="Rate" className="h-8 w-24 text-sm" />
      <select value={cur} onChange={e => setCur(e.target.value)} aria-label="Currency"
        className="glass-soft rounded-lg border border-input px-2 py-1 text-sm">
        {SUPPORTED_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <Button type="button" size="sm" onClick={() => { const r = parseFloat(rate); if (isFinite(r) && r > 0) { onAdd(cur, r); setRate('') } }}>Add</Button>
    </div>
  )
}
