'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BellRing, Check } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { useUserPrefs } from '@/hooks/use-user-prefs'
import { usePushSubscription } from '@/hooks/use-push-subscription'
import { pushTestMessage, type PushTestResult } from '@/lib/push-test-message'
import { isVoiceAnswersEnabled, setVoiceAnswersEnabled } from '@/lib/speak'
import { SUPPORTED_CURRENCIES } from '@/lib/op-schemas/money'
import { IANA_TIMEZONES } from '@/lib/iana-timezones'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageShell } from '@/components/page-shell'
import { FIELD_SELECT } from '@/components/sort-control'

const BACK = { href: '/settings', label: 'Settings' }
const SECTION_TITLE = 'text-sm font-semibold text-muted-foreground'

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

  if (!userId) {
    return (
      <PageShell title="Preferences" back={BACK}>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </PageShell>
    )
  }

  return (
    <PageShell title="Preferences" back={BACK}>
      <section className="glass flex flex-col gap-2 rounded-2xl p-4">
        <Label htmlFor="pref-currency" className="font-semibold">Primary currency</Label>
        <select
          id="pref-currency"
          value={state.primaryCurrency}
          onChange={e => { const v = e.target.value; setState(s => ({ ...s, primaryCurrency: v })); setDirty(true); setSaveError(null) }}
          className={FIELD_SELECT}
        >
          {SUPPORTED_CURRENCIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Totals are shown in this currency; entries in other currencies are converted at the daily exchange rate.
        </p>
      </section>

      <section className="glass flex flex-col gap-2 rounded-2xl p-4">
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-sm font-medium">Remind me to log my salary</span>
            <span className="text-xs text-muted-foreground">A push on the last working day of each month, for income that doesn&apos;t arrive by email. Needs notifications turned on.</span>
          </span>
          <input
            type="checkbox"
            checked={state.salaryReminder}
            onChange={e => { const v = e.currentTarget.checked; setState(s => ({ ...s, salaryReminder: v })); setDirty(true); setSaveError(null) }}
            className="size-5 shrink-0 accent-accent-2"
            aria-label="Remind me to log my salary on the last working day of the month"
          />
        </label>
      </section>

      <section className="glass flex flex-col gap-2 rounded-2xl p-4">
        <h2 className={SECTION_TITLE}>Manual exchange rates</h2>
        <p className="text-xs text-muted-foreground">Used only when the daily rates don&apos;t include a currency (for example AED).</p>
        <ul className="flex flex-col">
          {Object.entries(state.fxOverrides).map(([cur, rate]) => (
            <li key={cur} className="flex items-center justify-between text-sm">
              <span className="font-mono tabular-nums">1 EUR = {rate} {cur}</span>
              <Button
                type="button"
                variant="ghost"
                aria-label={`Remove ${cur} rate`}
                onClick={() => { setState(s => { const n = { ...s.fxOverrides }; delete n[cur]; return { ...s, fxOverrides: n } }); setDirty(true); setSaveError(null) }}
                className="text-muted-foreground"
              >
                Remove
              </Button>
            </li>
          ))}
          {Object.keys(state.fxOverrides).length === 0 && <li className="text-xs text-muted-foreground">None set.</li>}
        </ul>
        <FxAddRow onAdd={(cur, rate) => { setState(s => ({ ...s, fxOverrides: { ...s.fxOverrides, [cur]: rate } })); setDirty(true); setSaveError(null) }} />
      </section>

      <section className="glass flex flex-col gap-2 rounded-2xl p-4">
        <Label htmlFor="pref-tz-search" className="font-semibold">Time zone</Label>
        <Input
          id="pref-tz-search"
          value={tzQuery}
          onChange={e => setTzQuery(e.target.value)}
          placeholder="Search time zones…"
        />
        <div role="listbox" aria-label="Time zone" className="glass-soft max-h-56 overflow-y-auto rounded-lg">
          {filteredTzs.map(z => (
            <button
              key={z}
              type="button"
              role="option"
              aria-selected={state.tz === z}
              onClick={() => { setState(s => ({ ...s, tz: z })); setTzQuery(''); setDirty(true); setSaveError(null) }}
              className={cn(
                'flex min-h-10 w-full items-center justify-between px-3 text-left text-sm outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-2',
                state.tz === z && 'bg-white/10 font-medium',
              )}
            >
              <span>{z}</span>
              {state.tz === z && <Check className="size-4 text-accent-2" aria-hidden />}
            </button>
          ))}
          {filteredTzs.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No matches.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            <span className="text-muted-foreground">Current: </span>
            <span className="font-mono">{state.tz}</span>
          </p>
          <Button type="button" variant="outline" onClick={detectBrowserTz}>Use this device&apos;s time zone</Button>
        </div>
      </section>

      <section className="glass flex flex-col gap-2 rounded-2xl p-4">
        <h2 className={SECTION_TITLE}>Notifications</h2>
        {pushStatus === 'unsupported' && (
          <p className="text-sm text-muted-foreground">
            This device doesn&apos;t support notifications.
          </p>
        )}
        {pushStatus === 'denied' && (
          <p className="text-sm text-destructive">
            Notifications are blocked in your browser settings. Allow them for &quot;Lifeloom&quot; to turn them on.
          </p>
        )}
        {pushStatus === 'subscribed' && (
          <>
            <p className="flex items-center gap-2 text-sm text-income">
              <BellRing className="size-4" aria-hidden />
              Notifications are on.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={sendTest} disabled={testing}>
                {testing ? 'Sending…' : 'Send a test'}
              </Button>
              <Button variant="ghost" onClick={pushUnsubscribe}>Turn off</Button>
            </div>
            {testMsg && <p role="status" className="text-xs text-muted-foreground">{testMsg}</p>}
          </>
        )}
        {pushStatus === 'unsubscribed' && (
          <>
            <Button onClick={pushSubscribe} className="w-fit">
              Turn on notifications
            </Button>
            {pushError && (
              <p role="alert" className="text-xs text-destructive break-words">{pushError}</p>
            )}
          </>
        )}
        {pushStatus === 'pending' && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </section>

      <section className="glass flex flex-col gap-2 rounded-2xl p-4">
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-sm font-medium">Read answers aloud</span>
            <span className="text-xs text-muted-foreground">When you ask a question by voice, the answer is spoken too.</span>
          </span>
          <input
            type="checkbox"
            checked={speakAnswers}
            onChange={e => { const next = e.currentTarget.checked; setSpeakAnswers(next); setVoiceAnswersEnabled(next) }}
            className="size-5 shrink-0 accent-accent-2"
          />
        </label>
      </section>

      <div className="flex flex-col gap-2">
        {saveError && (
          <p role="alert" className="text-sm text-destructive">{saveError}</p>
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
    </PageShell>
  )
}

function FxAddRow({ onAdd }: { onAdd: (cur: string, rate: number) => void }) {
  const [cur, setCur] = useState<string>(SUPPORTED_CURRENCIES[0])
  const [rate, setRate] = useState('')
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="shrink-0 text-sm text-muted-foreground">1 EUR =</span>
      <Input value={rate} onChange={e => setRate(e.target.value)} inputMode="decimal" placeholder="Rate" aria-label="Rate for 1 EUR" className="h-11 w-24" />
      <select value={cur} onChange={e => setCur(e.target.value)} aria-label="Currency"
        className={cn(FIELD_SELECT, 'w-auto')}>
        {SUPPORTED_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <Button type="button" size="lg" onClick={() => { const r = parseFloat(rate); if (isFinite(r) && r > 0) { onAdd(cur, r); setRate('') } }}>Add</Button>
    </div>
  )
}
