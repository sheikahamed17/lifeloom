'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown, X, Plus } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { AuroraBackground } from '@/components/aurora-background'
import { WidgetCard } from '@/components/dashboard/widget-card'
import { GettingStarted } from '@/components/dashboard/getting-started'
import { useWidgets } from '@/hooks/use-widgets'
import { seedDefaultWidgetsIfEmpty } from '@/lib/seed-widgets'
import { generateOp, applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { reorder, WIDGET_CATALOG, widgetId, type WidgetType } from '@/lib/widgets'

export default function DashboardPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [openAddMenu, setOpenAddMenu] = useState(false)
  const widgets = useWidgets(userId ?? undefined)

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  // Seed on first load and sync
  useEffect(() => {
    if (!userId) return
    seedDefaultWidgetsIfEmpty({ userId })
      .then(() => pushPullOnce({ userId }).catch(console.error))
      .catch(err => console.error('seed/sync error:', err))
  }, [userId])

  async function handleReorder(widgetId: string, dir: 'up' | 'down') {
    if (!userId) return

    const items = widgets.map(w => ({ id: w.id, sort_order: w.sort_order }))
    const changed = reorder(items, widgetId, dir)

    if (changed.length === 0) return

    try {
      for (const change of changed) {
        const op = await generateOp({
          entity_kind: 'widget',
          entity_id: change.id,
          op_type: 'update',
          payload: { sort_order: change.sort_order },
          user_id: userId,
        })
        await applyLocalOp(op)
      }
      await pushPullOnce({ userId })
    } catch (err) {
      console.error('reorder error:', err)
    }
  }

  async function handleRemove(widgetId: string) {
    if (!userId) return

    try {
      const op = await generateOp({
        entity_kind: 'widget',
        entity_id: widgetId,
        op_type: 'delete',
        payload: {},
        user_id: userId,
      })
      await applyLocalOp(op)
      await pushPullOnce({ userId })
    } catch (err) {
      console.error('remove error:', err)
    }
  }

  async function handleAddWidget(type: WidgetType) {
    if (!userId) return

    try {
      const maxSort = widgets.length > 0
        ? Math.max(...widgets.map(w => w.sort_order))
        : -1
      const nextSort = maxSort + 1

      const op = await generateOp({
        entity_kind: 'widget',
        entity_id: widgetId(userId, type),
        op_type: 'create',
        payload: {
          type,
          sort_order: nextSort,
          label: null,
        },
        user_id: userId,
      })
      await applyLocalOp(op)
      await pushPullOnce({ userId })
      setOpenAddMenu(false)
    } catch (err) {
      console.error('add widget error:', err)
    }
  }

  const currentTypes = new Set(widgets.map(w => w.type).filter(Boolean))
  const availableTypes = WIDGET_CATALOG.filter(c => !currentTypes.has(c.type))

  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex w-full max-w-md md:max-w-3xl flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
        </div>

        {userId && <GettingStarted userId={userId} />}

        {widgets.length === 0 ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">Add a widget to get started</p>

            {availableTypes.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenAddMenu(!openAddMenu)}
                  className="w-full glass rounded-lg px-3 py-2 min-h-[44px] text-sm font-medium hover:bg-white/15 transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none flex items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add widget
                </button>
                {openAddMenu && (
                  <ul className="absolute top-full left-0 right-0 mt-2 glass rounded-lg overflow-hidden z-10">
                    {availableTypes.map(cat => (
                      <li key={cat.type}>
                        <button
                          type="button"
                          onClick={() => handleAddWidget(cat.type)}
                          className="w-full text-left px-4 py-3 text-sm hover:bg-white/10 transition border-b border-white/10 last:border-b-0"
                        >
                          <div className="font-medium">{cat.label}</div>
                          <div className="text-xs text-muted-foreground">{cat.description}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {widgets.map((w, idx) => (
                <li key={w.id} className="flex flex-col gap-2">
                  <WidgetCard type={w.type as WidgetType | null} userId={userId!} />

                  <div className="flex items-center justify-between gap-2 px-1">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleReorder(w.id, 'up')}
                        disabled={idx === 0}
                        aria-label="Move widget up"
                        className="rounded p-2 text-muted-foreground hover:text-foreground hover:bg-white/10 transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReorder(w.id, 'down')}
                        disabled={idx === widgets.length - 1}
                        aria-label="Move widget down"
                        className="rounded p-2 text-muted-foreground hover:text-foreground hover:bg-white/10 transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(w.id)}
                      aria-label="Remove widget"
                      className="rounded p-2 text-muted-foreground hover:text-destructive hover:bg-white/10 transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {availableTypes.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenAddMenu(!openAddMenu)}
                  className="w-full glass rounded-lg px-3 py-2 min-h-[44px] text-sm font-medium hover:bg-white/15 transition focus-visible:ring-2 focus-visible:ring-accent-2 outline-none flex items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add widget
                </button>
                {openAddMenu && (
                  <ul className="absolute top-full left-0 right-0 mt-2 glass rounded-lg overflow-hidden z-10">
                    {availableTypes.map(cat => (
                      <li key={cat.type}>
                        <button
                          type="button"
                          onClick={() => handleAddWidget(cat.type)}
                          className="w-full text-left px-4 py-3 text-sm hover:bg-white/10 transition border-b border-white/10 last:border-b-0"
                        >
                          <div className="font-medium">{cat.label}</div>
                          <div className="text-xs text-muted-foreground">{cat.description}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        <Link href="/app" className="text-sm text-muted-foreground hover:underline focus-visible:ring-2 focus-visible:ring-accent-2 outline-none rounded">← Back to Lifeloom</Link>
      </main>
    </>
  )
}
