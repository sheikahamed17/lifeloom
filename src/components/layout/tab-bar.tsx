'use client'

import { cn } from '@/lib/utils'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Tab } from '@/hooks/use-tab-state'

type Props = {
  taskBadgeCount?: number      // overdue + open count; undefined = no badge
  /** `inline`: desktop text tabs in the header bar. `dock`: the phone's floating bottom dock. */
  variant: 'inline' | 'dock'
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'money', label: 'Money' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'learning', label: 'Learn' },
  { id: 'notes', label: 'Notes' },
]

/**
 * The dock block is 5.5rem tall above the safe area (10px gap + 66px dock + 12px). The phone
 * capture field is fixed directly above it: use this as its `bottom`.
 */
export const ABOVE_DOCK = 'max-lg:bottom-[calc(5.5rem_+_env(safe-area-inset-bottom))]'

/**
 * Bottom padding that keeps a page's last item clear of the phone dock AND the capture
 * field fixed above it (5.5rem dock + 3.75rem field + breathing room).
 */
export const DOCK_CLEARANCE = 'pb-[calc(11rem_+_env(safe-area-inset-bottom))]'

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
        'group-data-horizontal/tabs:h-auto',
        dock
          ? 'grid w-full grid-cols-4 gap-1 rounded-[22px] bg-panel p-[5px]'
          : 'items-stretch justify-start gap-1 p-0',
      )}
    >
      {TABS.map(t => {
        const count = t.id === 'tasks' ? badge : null
        return (
          <TabsTrigger
            key={t.id}
            value={t.id}
            className={cn(
              'group/trigger gap-1.5 border-0 focus-visible:ring-2 focus-visible:ring-ring/50 data-active:font-bold',
              dock
                ? 'h-14 rounded-[17px] text-sm text-panel-foreground/80 after:hidden hover:text-panel-foreground focus-visible:ring-panel-highlight data-active:bg-background data-active:text-foreground! group-data-[variant=default]/tabs-list:data-active:shadow-none'
                : 'h-auto min-h-11 flex-none self-stretch rounded-none px-3.5 text-[15px] text-muted-foreground group-data-horizontal/tabs:after:bottom-[-1px] group-data-horizontal/tabs:after:h-[3px] data-active:text-foreground',
            )}
          >
            {t.label}
            {count && (
              <span
                className={cn(
                  'text-xs font-bold tabular-nums',
                  dock ? 'text-panel-highlight group-data-active/trigger:text-warning' : 'text-warning',
                )}
              >
                <span className="sr-only">, </span>{count}<span className="sr-only"> due</span>
              </span>
            )}
          </TabsTrigger>
        )
      })}
    </TabsList>
  )

  if (!dock) return list
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-background px-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] pt-2.5">
      <div className="mx-auto w-full max-w-xl">{list}</div>
    </div>
  )
}
