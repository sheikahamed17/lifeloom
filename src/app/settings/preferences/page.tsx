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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { SELECT_CLASS, SettingsCard } from '../_ui'
import { PageShell } from '@/components/layout/page-shell'

const BACK = { href: '/settings', label: 'Settings' }

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
        <Skeleton className="h-40 w-full rounded-xl" role="status" aria-label="Loading" />
      </PageShell>
    )
  }

  return (
    <PageShell title="Preferences" back={BACK}>
      <SettingsCard contentClassName="gap-2">
        <Label htmlFor="pref-currency" className="font-semibold">Primary currency</Label>
        <NativeSelect
          id="pref-currency"
          value={state.primaryCurrency}
          onChange={e => { const v = e.target.value; setState(s => ({ ...s, primaryCurrency: v })); setDirty(true); setSaveError(null) }}
          className={SELECT_CLASS}
        >
          {SUPPORTED_CURRENCIES.map(c => (
            <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>
          ))}
        </NativeSelect>
        <p className="text-xs text-muted-foreground">
          Totals are shown in this currency; entries in other currencies are converted at the daily exchange rate.
        </p>
      </SettingsCard>

      <SettingsCard>
        <Field orientation="horizontal" className="min-h-11 justify-between gap-3">
          <FieldContent>
            <FieldLabel htmlFor="pref-salary-reminder" className="text-sm font-medium text-foreground">Remind me to log my salary</FieldLabel>
            <FieldDescription className="text-xs">A push on the last working day of each month, for income that doesn&apos;t arrive by email. Needs notifications turned on.</FieldDescription>
          </FieldContent>
          <Switch
            id="pref-salary-reminder"
            checked={state.salaryReminder}
            onCheckedChange={v => { setState(s => ({ ...s, salaryReminder: v })); setDirty(true); setSaveError(null) }}
            aria-label="Remind me to log my salary on the last working day of the month"
          />
        </Field>
      </SettingsCard>

      <SettingsCard title="Manual exchange rates" contentClassName="gap-2">
        <p className="text-xs text-muted-foreground">Used only when the daily rates don&apos;t include a currency (for example AED).</p>
        <ul className="flex flex-col">
          {Object.entries(state.fxOverrides).map(([cur, rate]) => (
            <li key={cur} className="flex items-center justify-between text-sm">
              <span className="tabular-nums">1 EUR = {rate} {cur}</span>
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
      </SettingsCard>

      <SettingsCard contentClassName="gap-2">
        <Label htmlFor="pref-tz-search" className="font-semibold">Time zone</Label>
        <Input
          id="pref-tz-search"
          value={tzQuery}
          onChange={e => setTzQuery(e.target.value)}
          placeholder="Search time zones…"
        />
        <div role="listbox" aria-label="Time zone" className="glass-soft max-h-56 overflow-y-auto rounded-lg">
          {filteredTzs.map(z => (
            <Button
              key={z}
              type="button"
              variant="ghost"
              role="option"
              aria-selected={state.tz === z}
              onClick={() => { setState(s => ({ ...s, tz: z })); setTzQuery(''); setDirty(true); setSaveError(null) }}
              className={cn(
                'h-10 w-full justify-between rounded-none px-3 text-left font-normal',
                state.tz === z && 'bg-accent font-medium',
              )}
            >
              <span>{z}</span>
              {state.tz === z && <Check className="size-4 text-accent-2" aria-hidden />}
            </Button>
          ))}
          {filteredTzs.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No matches.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            <span className="text-muted-foreground">Current: </span>
            <span className="tabular-nums">{state.tz}</span>
          </p>
          <Button type="button" variant="outline" onClick={detectBrowserTz}>Use this device&apos;s time zone</Button>
        </div>
      </SettingsCard>

      <SettingsCard title="Notifications" contentClassName="gap-2">
        {pushStatus === 'unsupported' && (
          <p className="text-sm text-muted-foreground">
            This device doesn&apos;t support notifications.
          </p>
        )}
        {pushStatus === 'denied' && (
          <Alert variant="destructive">
            <AlertDescription className="text-destructive">
              Notifications are blocked in your browser settings. Allow them for &quot;Lifeloom&quot; to turn them on.
            </AlertDescription>
          </Alert>
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
              <Alert variant="destructive">
                <AlertDescription className="break-words text-destructive">{pushError}</AlertDescription>
              </Alert>
            )}
          </>
        )}
        {pushStatus === 'pending' && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner className="size-4" aria-hidden /> Loading…</p>
        )}
      </SettingsCard>

      <SettingsCard>
        <Field orientation="horizontal" className="min-h-11 justify-between gap-3">
          <FieldContent>
            <FieldLabel htmlFor="pref-speak" className="text-sm font-medium text-foreground">Read answers aloud</FieldLabel>
            <FieldDescription className="text-xs">When you ask a question by voice, the answer is spoken too.</FieldDescription>
          </FieldContent>
          <Switch
            id="pref-speak"
            checked={speakAnswers}
            onCheckedChange={next => { setSpeakAnswers(next); setVoiceAnswersEnabled(next) }}
          />
        </Field>
      </SettingsCard>

      <div className="flex flex-col gap-2">
        {saveError && (
          <Alert variant="destructive">
            <AlertDescription className="text-destructive">{saveError}</AlertDescription>
          </Alert>
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
      <NativeSelect value={cur} onChange={e => setCur(e.target.value)} aria-label="Currency"
        className={cn(SELECT_CLASS, 'w-auto')}>
        {SUPPORTED_CURRENCIES.map(c => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
      </NativeSelect>
      <Button type="button" size="lg" onClick={() => { const r = parseFloat(rate); if (isFinite(r) && r > 0) { onAdd(cur, r); setRate('') } }}>Add</Button>
    </div>
  )
}
