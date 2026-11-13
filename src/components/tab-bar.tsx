'use client'

import { BookOpen, CheckSquare, NotebookPen, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Tab } from '@/hooks/use-tab-state'

type Props = {
  active: Tab
  onChange: (t: Tab) => void
  taskBadgeCount?: number      // overdue + open count; undefined = no badge
  /** `inline`: desktop segmented control in the page flow. `dock`: the phone's fixed bottom dock. */
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

// One active-tab language on every screen size: a quiet pill, cyan icon, full-strength label. No glow.
const LIST = 'group-data-horizontal/tabs:h-auto w-full gap-1 bg-transparent p-0'
const TRIGGER =
  'rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-accent-2 ' +
  'data-active:bg-white/10 data-active:text-foreground data-active:shadow-none data-active:[&_svg]:text-accent-2'

export function TabBar({ active, onChange, taskBadgeCount, variant }: Props) {
  const badge = taskBadgeCount !== undefined && taskBadgeCount > 0 ? (taskBadgeCount > 9 ? '9+' : String(taskBadgeCount)) : null
  const dock = variant === 'dock'

  return (
    <Tabs
      value={active}
      onValueChange={v => onChange(v as Tab)}
      className={cn(
        'glass rounded-2xl',
        dock ? 'fixed bottom-[calc(0.75rem_+_env(safe-area-inset-bottom))] left-3 right-3 z-40 p-1.5' : 'p-1',
      )}
    >
      <TabsList aria-label="Sections" className={LIST}>
        {TABS.map(t => {
          const Icon = t.icon
          const count = t.id === 'tasks' ? badge : null
          return (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className={cn(
                TRIGGER,
                dock ? 'h-auto min-h-12 flex-col gap-0.5 py-1.5 text-xs' : 'h-auto min-h-11 gap-2 px-4',
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
                  <Icon className="size-5" aria-hidden />
                  {t.label}
                  {count && <DueBadge value={count} />}
                </>
              )}
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}

function DueBadge({ value }: { value: string }) {
  return (
    <Badge className="h-4 bg-warning px-1.5 font-semibold tabular-nums text-background">
      <span className="sr-only">, </span>{value}<span className="sr-only"> due</span>
    </Badge>
  )
}
