'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { PageShell } from '@/components/layout/page-shell'
import { InsightCard } from '@/components/insights/insight-card'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
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
      else setMsg('Could not generate. Try again.')
    } catch { setMsg('Could not generate. Try again.') }
    finally { setGenerating(false) }
  }

  return (
    <PageShell
      title="Insights"
      description="A short review of each week. A new one arrives every Monday."
      width="wide"
    >
      <div className="flex flex-col gap-7 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-14">
        <section aria-labelledby="insights-this-week" className="flex flex-col gap-2 lg:order-2 lg:gap-2.5">
          <h2 id="insights-this-week" className="sr-only text-[17px] font-bold lg:not-sr-only">This week</h2>
          {/* The page's one primary action. */}
          <Button onClick={generate} disabled={generating || !userId} aria-busy={generating} className="h-12 w-full text-[15px]">
            {generating && <Spinner className="motion-reduce:animate-none" aria-hidden />}
            {generating ? 'Generating…' : 'Generate this week'}
          </Button>
          {/* Always mounted so screen readers announce the result; takes no space while empty. */}
          <p role="status" className="text-[13px] text-muted-foreground empty:sr-only lg:text-sm">{msg}</p>
        </section>
        <section aria-labelledby="insights-past" className="flex min-w-0 flex-col">
          <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2.5">
            <h2 id="insights-past" className="text-[19px] font-bold tracking-[-0.02em] lg:text-[22px]">Past weeks</h2>
            {insights.length > 0 && (
              <p className="text-[13px] tabular-nums text-muted-foreground">{insights.length} {insights.length === 1 ? 'review' : 'reviews'}</p>
            )}
          </div>
          {insights.length === 0 ? (
            <Empty className="items-start px-0 py-6 text-left">
              <EmptyDescription>No insights yet. They arrive every Monday, or generate this week now.</EmptyDescription>
            </Empty>
          ) : (
            <ul className="flex flex-col">
              {insights.map(i => (
                <li key={i.id} className="border-b border-border">
                  <Link href={`/insights/${i.id}`} className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <InsightCard insight={i} variant="row" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageShell>
  )
}
