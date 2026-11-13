'use client'

import { useState } from 'react'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageShell } from '@/components/page-shell'

const COPY_TARGET = 'glass-soft flex w-full items-start gap-2 break-all rounded-lg p-3 text-left font-mono text-xs outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-accent-2'

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

export default function AutoImportPage() {
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<{ key: CopyKey; ok: boolean } | null>(null)
  const endpoint = typeof window !== 'undefined' ? `${window.location.origin}/api/ingest/sms` : '/api/ingest/sms'

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
    return <p role="status" className={`text-xs empty:hidden ${copied?.ok === false ? 'text-destructive' : 'text-income'}`}>{msg}</p>
  }

  return (
    <PageShell title="Auto-import transactions" back={{ href: '/settings', label: 'Settings' }}>
      <section className="glass flex flex-col gap-2 rounded-2xl p-4 text-sm">
        <p>Turn your bank&apos;s transaction alerts into money entries automatically. Email is fully hands-off; SMS needs a tap to share. Imported transactions appear in your Money tab marked Email or SMS. Change the category or delete any that are wrong.</p>
        <p className="text-xs text-muted-foreground">Your token is a secret: anyone with it can add entries to your account.</p>
      </section>

      <section className="glass flex flex-col gap-3 rounded-2xl p-4">
        <h2 className="text-sm font-semibold">Step 1: your token</h2>
        <Button onClick={generate} disabled={busy}>{busy ? 'Generating…' : token ? 'Make a new token' : 'Make a token'}</Button>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        {token && (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-warning">Copy this now: it&apos;s shown only once. Making a new one replaces it.</p>
            <button type="button" onClick={() => copy(token, 'token')} className={COPY_TARGET}>
              <span className="min-w-0 flex-1"><span className="sr-only">Copy token: </span>{token}</span>
              <Copy className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
            {copyStatus('token')}
          </div>
        )}
      </section>

      <section className="glass flex flex-col gap-2 rounded-2xl p-4 text-sm">
        <h2 className="text-sm font-semibold">Step 2: your import address</h2>
        <button type="button" onClick={() => copy(endpoint, 'endpoint')} className={COPY_TARGET}>
          <span className="min-w-0 flex-1"><span className="sr-only">Copy import address: </span>{endpoint}</span>
          <Copy className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
        {copyStatus('endpoint')}
      </section>

      <section className="glass flex flex-col gap-2 rounded-2xl p-4 text-sm">
        <h2 className="text-sm font-semibold">Option A: email (recommended, fully hands-off)</h2>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-xs">
          <li>Open <a className="underline" href="https://script.google.com" target="_blank" rel="noopener">script.google.com</a>, choose <strong>New project</strong> and paste the script below over the sample code.</li>
          <li>Open <strong>Project Settings</strong> (the gear), then <strong>Script properties</strong>, and add three: <code>ENDPOINT</code> = your import address above, <code>TOKEN</code> = your token, and <code>SENDER</code> = your bank&apos;s alert address (e.g. <code>alerts@hdfcbank.bank.in</code>; separate several banks with commas).</li>
          <li>Select <code>ingestPulseEmails</code>, press <strong>Run</strong> once and allow access (it&apos;s your own script reading your own Gmail; on the &quot;unverified app&quot; screen choose <em>Advanced</em>, then <em>Go to (unsafe)</em>).</li>
          <li>Open <strong>Triggers</strong> (the clock), choose <strong>Add trigger</strong>: function <code>ingestPulseEmails</code>, event source <em>Time-driven</em>, <em>Minutes timer</em>, <em>every 10 minutes</em>.</li>
          <li>That&apos;s it: <strong>no Gmail label or filter needed</strong>. New bank emails become Email entries within about 10 minutes.</li>
        </ol>
        <button type="button" onClick={() => copy(APPS_SCRIPT, 'script')} aria-label="Copy script" className="glass-soft relative max-h-48 overflow-auto whitespace-pre rounded-lg p-3 pr-9 text-left font-mono text-xs outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-accent-2">
          <Copy className="absolute right-3 top-3 size-4 text-muted-foreground" aria-hidden />
          {APPS_SCRIPT}
        </button>
        {copyStatus('script')}
      </section>

      <section className="glass flex flex-col gap-2 rounded-2xl p-4 text-sm">
        <h2 className="text-sm font-semibold">Option B: SMS on iPhone (a Shortcut in the share sheet)</h2>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-xs">
          <li>Open the <strong>Shortcuts</strong> app and tap the <strong>+</strong> button to create a Shortcut (not an Automation). Name it <strong>Add to Lifeloom</strong>.</li>
          <li>Add the action <strong>Get Contents of URL</strong>: URL = your import address above; Method = <strong>POST</strong>; Headers = <code>Authorization: Bearer &lt;your token&gt;</code> and <code>Content-Type: application/json</code>; Request Body = <strong>JSON</strong> with <code>text</code> = the <strong>Shortcut Input</strong> variable.</li>
          <li>Open the shortcut&apos;s details (the info button), turn on <strong>Show in Share Sheet</strong>, and accept <strong>Text</strong>.</li>
          <li>To use it: in Messages, select the bank SMS text, tap <strong>Share</strong>, then <strong>Add to Lifeloom</strong>. An SMS entry appears.</li>
        </ol>
      </section>
    </PageShell>
  )
}
