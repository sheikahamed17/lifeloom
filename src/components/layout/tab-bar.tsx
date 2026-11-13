'use client'

import { BookOpen, CheckSquare, NotebookPen, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Tab } from '@/hooks/use-tab-state'

type Props = {
  taskBadgeCount?: number      // overdue + open count; undefined = no badge
  /** `inline`: desktop underline tabs in the page flow. `dock`: the phone's fixed bottom bar. */
  variant: 'inline' | 'dock'
}

const TABS: { id: Tab; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { id: 'money', icon: Wallet, label: 'Money' },
  { id: 'tasks', icon: CheckSquare, label: 'Tasks' },
  { id: 'learning', icon: BookOpen, label: 'Learn' },
  { id: 'notes', icon: NotebookPen, label: 'Notes' },
]

/** Height the dock occupies above the safe area, so pages can pad their last item clear of it. */
export const DOCK_CLEARANCE = 'pb-[calc(6rem_+_env(safe-area-inset-bottom))]'

/**
 * The section switcher. It renders ONLY the tab list: the `<Tabs>` root and the
 * `<TabsContent>` panels live in the page (`app/app/page.tsx`), so the desktop list and
 * the phone dock are two views of one tab set and every tab is wired to its panel.
 */
export function TabBar({ taskBadgeCount, variant }: Props) {
  const badge = taskBadgeCount !== undefined && taskBadgeCount > 0 ? (taskBadgeCount > 9 ? '9+' : String(taskBadgeCount)) : null
  const dock = variant === 'dock'

  const list = (
    <TabsList
      aria-label="Sections"
      variant={dock ? 'default' : 'line'}
      className={cn(
        'group-data-horizontal/tabs:h-auto w-full',
        dock ? 'gap-1 bg-transparent p-0' : 'justify-start gap-1 border-b border-border p-0',
      )}
    >
      {TABS.map(t => {
        const Icon = t.icon
        const count = t.id === 'tasks' ? badge : null
        return (
          <TabsTrigger
            key={t.id}
            value={t.id}
            className={cn(
              'focus-visible:ring-2 focus-visible:ring-ring/50',
              dock
                ? 'h-auto min-h-14 flex-col gap-1 rounded-lg py-2 text-xs text-muted-foreground after:hidden data-active:bg-accent data-active:text-foreground data-active:shadow-none'
                : 'h-11 flex-none gap-2 rounded-none px-4 text-sm text-muted-foreground group-data-horizontal/tabs:after:bottom-[-1px] data-active:text-foreground',
            )}
          >
            {dock ? (
              <>
                <span className="relative">
                  <Icon className="size-5" aria-hidden />
                  {count && <span className="absolute -right-3 -top-2"><DueBadge value={count} /></span>}
                </span>
                {t.label}
              </>
            ) : (
              <>
                <Icon className="size-4" aria-hidden />
                {t.label}
                {count && <DueBadge value={count} />}
              </>
            )}
          </TabsTrigger>
        )
      })}
    </TabsList>
  )

  if (!dock) return list
  return (
    <div className="glass fixed bottom-[calc(0.75rem_+_env(safe-area-inset-bottom))] left-3 right-3 z-40 rounded-xl p-1.5">
      {list}
    </div>
  )
}

function DueBadge({ value }: { value: string }) {
  return (
    <Badge className="h-4 bg-warning px-1.5 font-semibold tabular-nums text-background">
      <span className="sr-only">, </span>{value}<span className="sr-only"> due</span>
    </Badge>
  )
}
