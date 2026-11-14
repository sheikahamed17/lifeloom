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
const DESCRIPTION = 'Currency, time zone and notifications.'
const LABEL = 'text-[13px] font-semibold text-muted-foreground'
const HELP = 'text-[13px] leading-[1.45] text-muted-foreground'
/** One ruled 60px row. */
const ROW = 'flex min-h-15 items-center border-b border-border py-2'
/** Alerts sit on a white rounded surface, like the other things that need attention. */
const ALERT = 'rounded-2xl border-transparent px-4 py-3.5'

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
      setTestMsg(body ? pushTestMessage(body) : "Couldn't reach the server. Try again.")
    } catch {
      setTestMsg("Couldn't reach the server. Try again.")
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
      <PageShell title="Preferences" back={BACK} description={DESCRIPTION}>
        <Skeleton className="h-40 w-full rounded-2xl" role="status" aria-label="Loading" />
      </PageShell>
    )
  }

  const fxEntries = Object.entries(state.fxOverrides)

  return (
    <PageShell title="Preferences" back={BACK} description={DESCRIPTION}>
      <SettingsCard title="Currency" contentClassName="gap-2">
        <Label htmlFor="pref-currency" className={LABEL}>Primary currency</Label>
        <NativeSelect
          id="pref-currency"
          value={state.primaryCurrency}
          onChange={e => { const v = e.target.value; setState(s => ({ ...s, primaryCurrency: v })); setDirty(true); setSaveError(null) }}
          className={cn(SELECT_CLASS, 'lg:max-w-80')}
        >
          {SUPPORTED_CURRENCIES.map(c => (
            <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>
          ))}
        </NativeSelect>
        <p className={HELP}>
          Totals are shown in this currency. Entries in other currencies are converted at the daily exchange rate.
        </p>
      </SettingsCard>

      <SettingsCard title="Manual exchange rates" className="gap-0" contentClassName="gap-0">
        <p className={cn(HELP, 'border-b border-border py-3')}>Used only when the daily rates do not include a currency, for example AED.</p>
        <ul className="flex flex-col">
          {fxEntries.map(([cur, rate]) => (
            <li key={cur} className="flex min-h-13 items-center justify-between gap-3 border-b border-border">
              <span className="text-[15px] font-medium tabular-nums">1 EUR = {rate} {cur}</span>
              <Button
                type="button"
                variant="link"
                aria-label={`Remove ${cur} rate`}
                onClick={() => { setState(s => { const n = { ...s.fxOverrides }; delete n[cur]; return { ...s, fxOverrides: n } }); setDirty(true); setSaveError(null) }}
                className="px-0"
              >
                Remove
              </Button>
            </li>
          ))}
          {fxEntries.length === 0 && <li className="flex min-h-13 items-center border-b border-border text-[15px] text-muted-foreground">None set.</li>}
        </ul>
        <FxAddRow onAdd={(cur, rate) => { setState(s => ({ ...s, fxOverrides: { ...s.fxOverrides, [cur]: rate } })); setDirty(true); setSaveError(null) }} />
      </SettingsCard>

      <SettingsCard title="Time zone" className="gap-0" contentClassName="gap-0">
        <div className="flex flex-col gap-2 pb-2 pt-4">
          <Label htmlFor="pref-tz-search" className={LABEL}>Search time zones</Label>
          <Input
            id="pref-tz-search"
            value={tzQuery}
            onChange={e => setTzQuery(e.target.value)}
            placeholder="City or region"
          />
        </div>
        <div role="listbox" aria-label="Time zone" className="max-h-65 overflow-y-auto border-b border-border">
          {filteredTzs.map(z => (
            <Button
              key={z}
              type="button"
              variant="ghost"
              role="option"
              aria-selected={state.tz === z}
              onClick={() => { setState(s => ({ ...s, tz: z })); setTzQuery(''); setDirty(true); setSaveError(null) }}
              className={cn(
                'h-13 w-full justify-between rounded-none border-0 border-b border-border px-0 text-left text-[15px] font-medium last:border-b-0 hover:bg-transparent',
                state.tz === z && 'font-semibold',
              )}
            >
              <span className="min-w-0 truncate">{z}</span>
              {state.tz === z && <Check className="size-4" aria-hidden />}
            </Button>
          ))}
          {filteredTzs.length === 0 && (
            <p className="flex min-h-13 items-center text-[15px] text-muted-foreground">No matches.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 pt-2">
          <p className="text-sm">
            <span className="text-muted-foreground">Current: </span>
            <span className="font-medium tabular-nums">{state.tz}</span>
          </p>
          <Button type="button" variant="link" onClick={detectBrowserTz} className="px-0">Use this device&apos;s time zone</Button>
        </div>
      </SettingsCard>

      <SettingsCard title="Notifications" className="gap-0" contentClassName="gap-0">
        {pushStatus === 'unsupported' && (
          <p className={cn(ROW, 'text-[15px] text-muted-foreground')}>
            This device doesn&apos;t support notifications.
          </p>
        )}
        {pushStatus === 'denied' && (
          <div className="border-b border-border py-3">
            <Alert variant="destructive" className={ALERT}>
              <AlertDescription className="text-destructive">
                Notifications are blocked in your browser settings. Allow them for &quot;Lifeloom&quot; to turn them on.
              </AlertDescription>
            </Alert>
          </div>
        )}
        {pushStatus === 'subscribed' && (
          <div className={cn(ROW, 'flex-wrap justify-between gap-x-3 gap-y-1')}>
            <p className="flex items-center gap-2 text-[15px] font-semibold">
              <BellRing className="size-4.5" aria-hidden />
              Notifications are on
            </p>
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={sendTest} disabled={testing}>
                {testing ? 'Sending…' : 'Send a test'}
              </Button>
              <Button variant="link" onClick={pushUnsubscribe} className="px-0">Turn off</Button>
            </div>
            {testMsg && <p role="status" className={cn(HELP, 'basis-full pb-1')}>{testMsg}</p>}
          </div>
        )}
        {pushStatus === 'unsubscribed' && (
          <div className={cn(ROW, 'flex-wrap justify-between gap-x-3 gap-y-1')}>
            <p className="text-[15px] font-semibold">Notifications are off</p>
            <Button variant="outline" onClick={pushSubscribe} className="w-fit">
              Turn on notifications
            </Button>
            {pushError && (
              <Alert variant="destructive" className={cn(ALERT, 'my-1 basis-full')}>
                <AlertDescription className="break-words text-destructive">{pushError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}
        {pushStatus === 'pending' && (
          <p role="status" className={cn(ROW, 'gap-2 text-[15px] text-muted-foreground')}><Spinner className="size-4" aria-hidden /> Loading…</p>
        )}

        <Field orientation="horizontal" className={cn(ROW, 'items-center! gap-4 py-3')}>
          <FieldContent className="gap-0.5">
            <FieldLabel htmlFor="pref-salary-reminder" className="text-[15px] font-semibold tracking-normal text-foreground">Remind me to log my salary</FieldLabel>
            <FieldDescription className={HELP}>
              A push on the last working day of each month, for income that does not arrive by email.
              {pushStatus !== 'subscribed' && ' Needs notifications turned on.'}
            </FieldDescription>
          </FieldContent>
          <Switch
            id="pref-salary-reminder"
            checked={state.salaryReminder}
            onCheckedChange={v => { setState(s => ({ ...s, salaryReminder: v })); setDirty(true); setSaveError(null) }}
            aria-label="Remind me to log my salary on the last working day of the month"
          />
        </Field>

        <Field orientation="horizontal" className={cn(ROW, 'items-center! gap-4 py-3')}>
          <FieldContent className="gap-0.5">
            <FieldLabel htmlFor="pref-speak" className="text-[15px] font-semibold tracking-normal text-foreground">Read answers aloud</FieldLabel>
            <FieldDescription className={HELP}>When you ask a question by voice, the answer is spoken too.</FieldDescription>
          </FieldContent>
          <Switch
            id="pref-speak"
            checked={speakAnswers}
            onCheckedChange={next => { setSpeakAnswers(next); setVoiceAnswersEnabled(next) }}
          />
        </Field>
      </SettingsCard>

      <div className="flex flex-col gap-3">
        {saveError && (
          <Alert variant="destructive" className={ALERT}>
            <AlertDescription className="text-destructive">{saveError}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-5">
          <Button onClick={save} disabled={!dirty || busy} size="lg" className="lg:h-12 lg:px-8 lg:text-[15px]">
            {busy ? 'Saving…' : 'Save'}
          </Button>
          {dirty && (
            <Button variant="link" className="px-0" onClick={() => {
              setState({
                primaryCurrency: prefs.primary_currency,
                tz: prefs.tz,
                fxOverrides: prefs.fx_overrides,
                salaryReminder: prefs.salary_reminder,
              })
              setDirty(false)
              setSaveError(null)
            }}>Discard changes</Button>
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
    <div className="flex flex-wrap items-center gap-2 pt-4">
      <span className="shrink-0 text-sm text-muted-foreground">1 EUR =</span>
      <Input value={rate} onChange={e => setRate(e.target.value)} inputMode="decimal" placeholder="Rate" aria-label="Rate for 1 EUR" className="min-w-20 flex-1 lg:max-w-40" />
      <NativeSelect value={cur} onChange={e => setCur(e.target.value)} aria-label="Currency"
        className={cn(SELECT_CLASS, 'w-24 shrink-0')}>
        {SUPPORTED_CURRENCIES.map(c => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
      </NativeSelect>
      <Button type="button" variant="outline" className="h-12" onClick={() => { const r = parseFloat(rate); if (isFinite(r) && r > 0) { onAdd(cur, r); setRate('') } }}>Add</Button>
    </div>
  )
}
