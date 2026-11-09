'use client'

import { MoneyCard } from '@/components/money-card'
import { BudgetSection } from '@/components/budget-section'
import { TodayTasksWidget } from '@/components/dashboard/today-tasks-widget'
import { SpendTrendWidget } from '@/components/dashboard/spend-trend-widget'
import { RecentActivityWidget } from '@/components/dashboard/recent-activity-widget'
import { AccountsWidget } from '@/components/dashboard/accounts-widget'
import { UpcomingWidget } from '@/components/dashboard/upcoming-widget'
import { GoalsWidget } from '@/components/dashboard/goals-widget'
import { HabitsWidget } from '@/components/dashboard/habits-widget'
import { OwedWidget } from '@/components/dashboard/owed-widget'
import type { WidgetType } from '@/lib/widgets'

type Props = {
  type: WidgetType | null | undefined
  userId: string
}

export function WidgetCard({ type, userId }: Props) {
  if (type === 'spent') {
    return (
      <section className="glass flex flex-col gap-4 rounded-2xl p-4">
        <MoneyCard userId={userId} />
      </section>
    )
  }

  if (type === 'budgets') {
    return (
      <section className="glass flex flex-col gap-4 rounded-2xl p-4">
        <BudgetSection userId={userId} />
      </section>
    )
  }

  if (type === 'today-tasks') {
    return (
      <section className="glass flex flex-col gap-4 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today&apos;s Tasks</h3>
        </div>
        <TodayTasksWidget userId={userId} />
      </section>
    )
  }

  if (type === 'spend-trend') {
    return (
      <section className="glass flex flex-col gap-4 rounded-2xl p-4">
        <SpendTrendWidget userId={userId} />
      </section>
    )
  }

  if (type === 'recent-activity') {
    return (
      <section className="glass flex flex-col gap-4 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Activity</h3>
        </div>
        <RecentActivityWidget userId={userId} />
      </section>
    )
  }

  if (type === 'accounts') {
    return (
      <section className="glass flex flex-col gap-4 rounded-2xl p-4">
        <AccountsWidget userId={userId} />
      </section>
    )
  }

  if (type === 'upcoming') {
    return (
      <section className="glass flex flex-col gap-4 rounded-2xl p-4">
        <UpcomingWidget userId={userId} />
      </section>
    )
  }

  if (type === 'goals') {
    return (
      <section className="glass flex flex-col gap-4 rounded-2xl p-4">
        <GoalsWidget userId={userId} />
      </section>
    )
  }

  if (type === 'habits') {
    return (
      <section className="glass flex flex-col gap-4 rounded-2xl p-4">
        <HabitsWidget userId={userId} />
      </section>
    )
  }

  if (type === 'owed') {
    return (
      <section className="glass flex flex-col gap-4 rounded-2xl p-4">
        <OwedWidget userId={userId} />
      </section>
    )
  }

  // Unknown or null type — show a fallback
  return (
    <section className="glass flex flex-col gap-4 rounded-2xl p-4">
      <div className="text-center text-sm text-muted-foreground">Unknown widget</div>
    </section>
  )
}
