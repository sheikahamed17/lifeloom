'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { PageShell } from '@/components/page-shell'
import { InsightCard } from '@/components/insight-card'
import { Button } from '@/components/ui/button'
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
    <PageShell
      title="Insights"
      actions={
        // The page's one primary action, so it is the one thing that glows.
        <Button onClick={generate} disabled={generating || !userId} aria-busy={generating} className="glow-cta">
          {generating
            ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
            : <Sparkles className="size-4" aria-hidden />}
          {generating ? 'Generating…' : 'Generate this week'}
        </Button>
      }
    >
      {/* Always mounted so screen readers announce the result; takes no space while empty. */}
      <p role="status" className="text-sm text-muted-foreground empty:sr-only">{msg}</p>
      {insights.length === 0 ? (
        <p className="glass rounded-2xl p-4 text-sm text-muted-foreground">No insights yet — they arrive every Monday, or generate this week now.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {insights.map(i => (
            <li key={i.id}>
              <Link href={`/insights/${i.id}`} className="block rounded-2xl outline-none transition-shadow hover:ring-1 hover:ring-white/20 focus-visible:ring-2 focus-visible:ring-accent-2">
                <InsightCard insight={i} variant="card" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  )
}
