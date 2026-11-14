'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { PageShell } from '@/components/layout/page-shell'
import { InsightCard } from '@/components/insights/insight-card'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { formatDayRange } from '@/lib/format'
import { useInsights } from '@/hooks/use-insights'

export default function InsightDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const [userId, setUserId] = useState<string | null>(null)
  const insights = useInsights(userId ?? undefined)
  const insight = insights.find(i => i.id === params.id)

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  return (
    <PageShell
      title="Week in review"
      // The week's dates sit under the title, once.
      description={insight ? <span className="tabular-nums">{formatDayRange(insight.starts_at, insight.ends_at)}</span> : undefined}
      back={{ href: '/insights', label: 'Insights' }}
      width="wide"
    >
      {insight ? (
        <InsightCard insight={insight} variant="detail" />
      ) : !userId ? (
        <p role="status" className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Empty className="items-start px-0 py-6 text-left">
          <EmptyDescription>Insight not found.</EmptyDescription>
        </Empty>
      )}
    </PageShell>
  )
}
