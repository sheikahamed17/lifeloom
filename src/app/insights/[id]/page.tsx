'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { PageShell } from '@/components/page-shell'
import { InsightCard } from '@/components/insight-card'
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
    <PageShell title="Week in review" back={{ href: '/insights', label: 'Insights' }}>
      {insight ? (
        <InsightCard insight={insight} variant="detail" />
      ) : !userId ? (
        <p role="status" className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <p className="glass rounded-2xl p-4 text-sm text-muted-foreground">Insight not found.</p>
      )}
    </PageShell>
  )
}
