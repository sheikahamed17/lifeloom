'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { AuroraBackground } from '@/components/aurora-background'

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

export default function AutoImportPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endpoint = typeof window !== 'undefined' ? `${window.location.origin}/api/ingest/sms` : '/api/ingest/sms'

  async function generate() {
    setBusy(true); setError(null); setToken(null)
    try {
      const res = await fetch('/api/ingest/token', { method: 'POST' })
      const body = await res.json().catch(() => null) as { token?: string } | null
      if (!res.ok || !body?.token) { setError('Could not generate a token. Please try again.'); return }
      setToken(body.token)
    } catch {
      setError('Could not reach the server. Please try again.')
    } finally { setBusy(false) }
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {})
  }

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex w-full max-w-md md:max-w-3xl flex-col gap-6 p-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Auto-import transactions</h1>
          <Button size="sm" variant="ghost" onClick={() => router.push('/settings')}>← Settings</Button>
        </header>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4 text-sm">
          <p>Turn your bank&apos;s transaction alerts into money entries automatically. Email is fully hands-off; SMS needs a tap to share. Parsed transactions appear in your Money tab tagged <span className="whitespace-nowrap">📧 Email</span> or <span className="whitespace-nowrap">💳 SMS</span> — edit the category or delete any that are wrong.</p>
          <p className="text-xs text-muted-foreground">Your token is a secret — anyone with it can add entries to your account.</p>
        </section>

        <section className="glass flex flex-col gap-3 rounded-2xl p-4">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Step 1 · Your token</span>
          <Button onClick={generate} disabled={busy}>{busy ? 'Generating…' : token ? 'Regenerate token' : 'Generate token'}</Button>
          {error && <p role="alert" className="text-xs text-rose-500">{error}</p>}
          {token && (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-amber-400">Copy this now — it&apos;s shown only once. Regenerating replaces it.</p>
              <button type="button" onClick={() => copy(token)} className="glass-soft break-all rounded-lg p-2 text-left font-mono text-xs focus-visible:ring-2 focus-visible:ring-accent-2 outline-none">
                {token}
              </button>
              <span className="text-[10px] text-muted-foreground">Tap to copy.</span>
            </div>
          )}
        </section>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4 text-sm">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Step 2 · Endpoint</span>
          <button type="button" onClick={() => copy(endpoint)} className="glass-soft break-all rounded-lg p-2 text-left font-mono text-xs focus-visible:ring-2 focus-visible:ring-accent-2 outline-none">
            {endpoint}
          </button>
          <span className="text-[10px] text-muted-foreground">Tap to copy.</span>
        </section>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4 text-sm">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Method A · Email (recommended — fully hands-off)</span>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-xs">
            <li>Open <a className="underline" href="https://script.google.com" target="_blank" rel="noopener">script.google.com</a> → <strong>New project</strong> → paste the script below (replace the sample code).</li>
            <li><strong>Project Settings</strong> (gear) → <strong>Script properties</strong> → add three: <code>ENDPOINT</code> = the endpoint above, <code>TOKEN</code> = your token, and <code>SENDER</code> = your bank&apos;s alert address (e.g. <code>alerts@hdfcbank.bank.in</code>; comma-separate multiple banks).</li>
            <li>Select <code>ingestPulseEmails</code> → <strong>Run</strong> once → authorize (it&apos;s your own script reading your own Gmail; on the &quot;unverified app&quot; screen tap <em>Advanced → Go to (unsafe)</em>).</li>
            <li><strong>Triggers</strong> (clock) → <strong>Add trigger</strong> → function <code>ingestPulseEmails</code>, event source <em>Time-driven</em>, <em>Minutes timer → every 10 minutes</em>.</li>
            <li>Done — <strong>no Gmail label or filter needed</strong>. New bank emails become 📧 Email entries within ~10 minutes.</li>
          </ol>
          <button type="button" onClick={() => copy(APPS_SCRIPT)} className="glass-soft max-h-48 overflow-auto whitespace-pre rounded-lg p-2 text-left font-mono text-[10px] focus-visible:ring-2 focus-visible:ring-accent-2 outline-none">
            {APPS_SCRIPT}
          </button>
          <span className="text-[10px] text-muted-foreground">Tap the code to copy.</span>
        </section>

        <section className="glass flex flex-col gap-2 rounded-2xl p-4 text-sm">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Method B · SMS (iOS share-sheet Shortcut)</span>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-xs">
            <li>Open the <strong>Shortcuts</strong> app → <strong>+</strong> to create a Shortcut (not an Automation). Name it <strong>Add to Lifeloom</strong>.</li>
            <li>Add action <strong>Get Contents of URL</strong>: URL = the endpoint above; Method = <strong>POST</strong>; Headers = <code>Authorization: Bearer &lt;your token&gt;</code> and <code>Content-Type: application/json</code>; Request Body = <strong>JSON</strong> with <code>text</code> = the <strong>Shortcut Input</strong> variable.</li>
            <li>Open the shortcut&apos;s details (ⓘ) → turn on <strong>Show in Share Sheet</strong>, and accept <strong>Text</strong>.</li>
            <li>Use it: in Messages, select the bank SMS text → <strong>Share</strong> → <strong>Add to Lifeloom</strong>. A 💳 SMS entry appears.</li>
          </ol>
        </section>
      </main>
    </>
  )
}
