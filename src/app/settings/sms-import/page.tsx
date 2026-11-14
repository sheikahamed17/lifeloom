'use client'

import { useState, useSyncExternalStore } from 'react'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageShell } from '@/components/layout/page-shell'
import { cn } from '@/lib/utils'

/** A value you tap to copy: a white rounded row with the copy icon on the right. */
const COPY_TARGET = 'h-auto min-h-14 w-full items-center justify-start gap-3 whitespace-normal break-all rounded-2xl bg-card px-4 py-3.5 text-left text-sm font-medium hover:bg-card lg:text-[15px]'
const HELP = 'text-[13px] leading-[1.45] text-muted-foreground'
const CODE = 'text-[13px]'

const APPS_SCRIPT = `/**
 * Lifeloom — email transaction auto-ingest.
 * Setup: Project Settings > Script properties > add ENDPOINT, TOKEN and SENDER.
 *   SENDER = your bank's alert address(es), comma-separated (e.g. alerts@hdfcbank.bank.in).
 * Then Triggers > add a time-driven trigger on ingestPulseEmails() every 10 minutes.
 * No Gmail label or filter to create: the script finds emails by sender itself and
 * marks each done with an auto-created "PulseDone" label so none is sent twice.
 */
const DONE_LABEL = 'PulseDone'
const LOOKBACK = 'newer_than:2d'
const MAX_THREADS = 25
const MAX_BODY_CHARS = 4000

function ingestPulseEmails() {
  const props = PropertiesService.getScriptProperties()
  const endpoint = props.getProperty('ENDPOINT')
  const token = props.getProperty('TOKEN')
  const sender = props.getProperty('SENDER')
  if (!endpoint || !token) throw new Error('Set ENDPOINT and TOKEN in Project Settings > Script properties.')
  if (!sender) throw new Error('Set SENDER in Script properties (your bank alert address, e.g. alerts@hdfcbank.bank.in; comma-separate multiple).')

  const done = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL)
  const fromQuery = sender.split(',').map(function (s) { return 'from:' + s.trim() }).join(' OR ')
  const threads = GmailApp.search('(' + fromQuery + ') ' + LOOKBACK + ' -label:' + DONE_LABEL, 0, MAX_THREADS)
  for (const thread of threads) {
    let ok = true
    for (const msg of thread.getMessages()) {
      const text = (msg.getPlainBody() || '').slice(0, MAX_BODY_CHARS)
      if (!text) continue
      try {
        const res = UrlFetchApp.fetch(endpoint, {
          method: 'post',
          contentType: 'application/json',
          headers: { Authorization: 'Bearer ' + token },
          payload: JSON.stringify({ text: text, source: 'email' }),
          muteHttpExceptions: true,
        })
        const code = res.getResponseCode()
        if (code < 200 || code >= 300) { ok = false; console.error('POST failed', code, res.getContentText()) }
      } catch (e) { ok = false; console.error('POST error', e) }
    }
    if (ok) thread.addLabel(done)
  }
}`

type CopyKey = 'token' | 'endpoint' | 'script'

const noSubscribe = () => () => {}

export default function AutoImportPage() {
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<{ key: CopyKey; ok: boolean } | null>(null)
  // The origin is only known in the browser; read it after hydration so server and client HTML match.
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => '')
  const endpoint = `${origin}/api/ingest/sms`

  async function generate() {
    setBusy(true); setError(null); setToken(null); setCopied(null)
    try {
      const res = await fetch('/api/ingest/token', { method: 'POST' })
      const body = await res.json().catch(() => null) as { token?: string } | null
      if (!res.ok || !body?.token) { setError('Could not generate a token. Please try again.'); return }
      setToken(body.token)
    } catch {
      setError('Could not reach the server. Please try again.')
    } finally { setBusy(false) }
  }

  function copy(text: string, key: CopyKey) {
    const done = (ok: boolean) => setCopied({ key, ok })
    if (!navigator.clipboard) { done(false); return }
    navigator.clipboard.writeText(text).then(() => done(true), () => done(false))
  }

  /** Every copy tap reports back: "Copied" or how to do it by hand. */
  function copyStatus(k: CopyKey) {
    const msg = copied?.key === k ? (copied.ok ? 'Copied.' : 'Couldn’t copy. Select the text and copy it by hand.') : ''
    return <p role="status" className={`pt-2.5 text-[13px] font-medium empty:hidden ${copied?.ok === false ? 'text-destructive' : 'text-income'}`}>{msg}</p>
  }

  return (
    <PageShell
      title="Auto-import transactions"
      back={{ href: '/settings', label: 'Settings' }}
      description={
        <>
          <span className="block leading-normal">Turn your bank&apos;s transaction alerts into money entries. Email is fully hands-off. SMS needs a tap to share.</span>
          <span className="mt-2 block leading-normal">Imported transactions appear in Money marked Email or SMS. Change the category or delete any that are wrong.</span>
        </>
      }
    >
      <Section title="Step 1: your token">
        {token && (
          <>
            <p className="pb-1 pt-3 text-[13px] font-medium leading-[1.45] text-warning">Copy this now. It is shown only once. Making a new one replaces it.</p>
            <Button type="button" variant="ghost" onClick={() => copy(token, 'token')} className={cn(COPY_TARGET, 'mt-2')}>
              <span className="min-w-0 flex-1"><span className="sr-only">Copy token: </span>{token}</span>
              <Copy className="size-4.5 shrink-0" aria-hidden />
            </Button>
            {copyStatus('token')}
          </>
        )}
        <div className="flex flex-col gap-4 pt-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-x-6 lg:pt-4">
          <p className={cn(HELP, 'lg:min-w-0 lg:flex-1 lg:basis-70')}>Your token is a secret. Anyone with it can add entries to your account.</p>
          <Button variant={token ? 'outline' : 'default'} onClick={generate} disabled={busy} className="h-12 px-6 text-[15px]">
            {busy ? 'Generating…' : token ? 'Make a new token' : 'Make a token'}
          </Button>
        </div>
        {error && (
          <Alert variant="destructive" className="mt-3 rounded-2xl border-transparent px-4 py-3.5">
            <AlertDescription className="text-destructive">{error}</AlertDescription>
          </Alert>
        )}
      </Section>

      <Section title="Step 2: your import address">
        <Button type="button" variant="ghost" onClick={() => copy(endpoint, 'endpoint')} className={cn(COPY_TARGET, 'mt-4')}>
          <span className="min-w-0 flex-1"><span className="sr-only">Copy import address: </span>{endpoint}</span>
          <Copy className="size-4.5 shrink-0" aria-hidden />
        </Button>
        {copyStatus('endpoint')}
      </Section>

      <Section title="Option A: email" note="Recommended, fully hands-off">
        <Steps>
          <Step n={1}>Open <a className="underline underline-offset-2" href="https://script.google.com" target="_blank" rel="noopener">script.google.com</a>, choose <strong>New project</strong> and paste the script below over the sample code.</Step>
          <Step n={2}>Open <strong>Project Settings</strong> (the gear), then <strong>Script properties</strong>, and add three: <code className={CODE}>ENDPOINT</code> = your import address above, <code className={CODE}>TOKEN</code> = your token, and <code className={CODE}>SENDER</code> = your bank&apos;s alert address (e.g. <code className={CODE}>alerts@hdfcbank.bank.in</code>; separate several banks with commas).</Step>
          <Step n={3}>Select <code className={CODE}>ingestPulseEmails</code>, press <strong>Run</strong> once and allow access (it&apos;s your own script reading your own Gmail; on the &quot;unverified app&quot; screen choose <strong>Advanced</strong>, then <strong>Go to (unsafe)</strong>).</Step>
          <Step n={4}>Open <strong>Triggers</strong> (the clock), choose <strong>Add trigger</strong>: function <code className={CODE}>ingestPulseEmails</code>, event source Time-driven, Minutes timer, every 10 minutes.</Step>
          <Step n={5}>That&apos;s it: <strong>no Gmail label or filter needed</strong>. New bank emails become Email entries within about 10 minutes.</Step>
        </Steps>
        <div className="flex items-center justify-between gap-3 pt-3">
          <p id="script-label" className="text-[13px] font-semibold text-muted-foreground">The script</p>
          <Button type="button" variant="outline" onClick={() => copy(APPS_SCRIPT, 'script')} className="gap-2 px-3.5">
            <Copy className="size-4" aria-hidden />
            Copy script
          </Button>
        </div>
        {/* Focusable so the keyboard can scroll it. */}
        <div role="region" aria-labelledby="script-label" tabIndex={0} className="mt-2 h-44 overflow-auto rounded-[14px] bg-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:h-48">
          <pre className="px-4 py-3.5 text-xs leading-[1.6] lg:text-[13px]">{APPS_SCRIPT}</pre>
        </div>
        {copyStatus('script')}
      </Section>

      <Section title="Option B: SMS on iPhone" note="A Shortcut in the share sheet">
        <Steps>
          <Step n={1}>Open the <strong>Shortcuts</strong> app and tap the <strong>+</strong> button to create a Shortcut (not an Automation). Name it <strong>Add to Lifeloom</strong>.</Step>
          <Step n={2}>Add the action <strong>Get Contents of URL</strong>: URL = your import address above; Method = <strong>POST</strong>; Headers = <code className={CODE}>Authorization: Bearer &lt;your token&gt;</code> and <code className={CODE}>Content-Type: application/json</code>; Request Body = <strong>JSON</strong> with <code className={CODE}>text</code> = the <strong>Shortcut Input</strong> variable.</Step>
          <Step n={3}>Open the shortcut&apos;s details (the info button), turn on <strong>Show in Share Sheet</strong>, and accept <strong>Text</strong>.</Step>
          <Step n={4}>To use it: in Messages, select the bank SMS text, tap <strong>Share</strong>, then <strong>Add to Lifeloom</strong>. An SMS entry appears.</Step>
        </Steps>
      </Section>
    </PageShell>
  )
}

/** A flat section: ruled heading (with an optional muted note) and its content below. */
function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col">
      <div className="flex flex-col gap-1 border-b border-border pb-2.5 lg:flex-row lg:flex-wrap lg:items-baseline lg:justify-between lg:gap-x-4 lg:pb-3">
        <h2 className="text-[19px] font-bold tracking-[-0.02em] lg:text-[22px]">{title}</h2>
        {note && <p className="text-[13px] text-muted-foreground lg:text-sm">{note}</p>}
      </div>
      {children}
    </section>
  )
}

/** Long instructions as a numbered ruled list. */
function Steps({ children }: { children: React.ReactNode }) {
  return <ol role="list" className="flex flex-col">{children}</ol>
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 border-b border-border py-3 text-sm leading-normal lg:py-[13px] lg:text-[15px]">
      <span aria-hidden className="w-5 shrink-0 font-bold">{n}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  )
}
