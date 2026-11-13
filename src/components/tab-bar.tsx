'use client'

import { BookOpen, CheckSquare, NotebookPen, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
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
const activeTab = 'bg-white/10 text-foreground [&_svg]:text-accent-2'
const idleTab = 'text-muted-foreground hover:text-foreground hover:bg-white/5'

export function TabBar({ active, onChange, taskBadgeCount, variant }: Props) {
  const badge = taskBadgeCount !== undefined && taskBadgeCount > 0 ? (taskBadgeCount > 9 ? '9+' : String(taskBadgeCount)) : null

  if (variant === 'inline') {
    return (
      <nav className="glass flex gap-1 rounded-2xl p-1" aria-label="Sections">
        {TABS.map(t => {
          const Icon = t.icon
          const isActive = active === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-2',
                isActive ? activeTab : idleTab,
              )}
            >
              <Icon className="size-5" aria-hidden />
              {t.label}
              {t.id === 'tasks' && badge && <Badge value={badge} />}
            </button>
          )
        })}
      </nav>
    )
  }

  return (
    <nav
      className="glass fixed bottom-[calc(0.75rem_+_env(safe-area-inset-bottom))] left-3 right-3 z-40 flex gap-1 rounded-2xl p-1.5"
      aria-label="Sections"
    >
      {TABS.map(t => {
        const Icon = t.icon
        const isActive = active === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-2',
              isActive ? activeTab : idleTab,
            )}
          >
            <span className="relative">
              <Icon className="size-5" aria-hidden />
              {t.id === 'tasks' && badge && <span className="absolute -right-3 -top-2"><Badge value={badge} /></span>}
            </span>
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}

function Badge({ value }: { value: string }) {
  return (
    <span className="rounded-full bg-warning px-1.5 text-xs font-semibold leading-4 tabular-nums text-background">
      <span className="sr-only">, </span>{value}<span className="sr-only"> due</span>
    </span>
  )
}
