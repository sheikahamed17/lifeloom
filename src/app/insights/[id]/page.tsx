'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { PageShell } from '@/components/layout/page-shell'
import { InsightCard } from '@/components/insights/insight-card'
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty'
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
        <Empty className="glass border p-4">
          <EmptyHeader>
            <EmptyDescription>Insight not found.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </PageShell>
  )
}
