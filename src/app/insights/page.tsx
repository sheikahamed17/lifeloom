'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { AuroraBackground } from '@/components/aurora-background'
import { InsightCard } from '@/components/insight-card'
import { useInsights } from '@/hooks/use-insights'
import { pushPullOnce } from '@/lib/sync-client'

export default function InsightsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const insights = useInsights(userId ?? undefined)

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  async function generate() {
    if (!userId || generating) return
    setGenerating(true); setMsg(null)
    try {
      const res = await fetch('/api/insights/generate', { method: 'POST' })
      const data = await res.json() as { ok: boolean; reason?: string }
      if (data.ok) { await pushPullOnce({ userId }); setMsg('Updated this week\'s insight.') }
      else if (data.reason === 'empty_week') setMsg('Nothing logged this week yet.')
      else setMsg('Could not generate — try again.')
    } catch { setMsg('Could not generate — try again.') }
    finally { setGenerating(false) }
  }

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex w-full max-w-md md:max-w-3xl flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Insights</h1>
          <button
            type="button"
            onClick={generate}
            disabled={generating || !userId}
            aria-busy={generating}
            className="glass rounded-lg px-3 py-2 min-h-[44px] text-sm font-medium hover:bg-white/15 transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Generate / refresh this week'}
          </button>
        </div>
        {msg && <p className="text-xs text-muted-foreground" role="status">{msg}</p>}
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">No insights yet — they arrive every Monday, or generate this week now.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {insights.map(i => (
              <li key={i.id}>
                <Link href={`/insights/${i.id}`} className="block focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded-lg">
                  <InsightCard insight={i} variant="card" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/app" className="text-sm text-muted-foreground hover:underline focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded">← Back to Lifeloom</Link>
      </main>
    </>
  )
}
