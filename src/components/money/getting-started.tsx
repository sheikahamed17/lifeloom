'use client'

import { useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HEAD_NOTE, SectionHeading } from '@/components/money/section-heading'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useAccounts } from '@/hooks/use-accounts'
import { useBudgets } from '@/hooks/use-budgets'
import { useRecurringRules } from '@/hooks/use-recurring-rules'
import { useHabits } from '@/hooks/use-habits'
import { usePushSubscription } from '@/hooks/use-push-subscription'
import { onboardingSteps, allStepsDone } from '@/lib/onboarding'

type Props = { userId: string }

export function GettingStarted({ userId }: Props) {
  const headingId = useId()
  const entries = useMoneyEntries(userId)
  const accounts = useAccounts(userId)
  const budgets = useBudgets(userId)
  const recurring = useRecurringRules(userId)
  const habits = useHabits(userId)
  const { status: pushStatus } = usePushSubscription()

  const [dismissed, setDismissed] = useState(() => {
    // Lazy initializer: safe for SSR, reads localStorage on mount
    if (typeof window === 'undefined') return false
    try { return localStorage.getItem('pulse.onboardingDismissed') === '1' } catch { return false }
  })

  const pushSubscribed = pushStatus === 'subscribed'

  const steps = useMemo(
    () =>
      onboardingSteps({
        entries: entries.length,
        accounts: accounts.length,
        budgets: budgets.length,
        recurring: recurring.length,
        habits: habits.length,
        pushSubscribed,
      }),
    [entries.length, accounts.length, budgets.length, recurring.length, habits.length, pushSubscribed],
  )

  if (allStepsDone(steps) || dismissed) {
    return null
  }

  const doneCount = steps.filter(s => s.done).length
  const remaining = steps.filter(s => !s.done)

  const handleDismiss = () => {
    setDismissed(true)
    try { localStorage.setItem('pulse.onboardingDismissed', '1') } catch { /* storage unavailable: hidden for this visit */ }
  }

  // Only what's left to do: finished steps collapse into the count, so a nearly
  // complete checklist doesn't push the real work down the screen.
  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      <SectionHeading
        id={headingId}
        className="items-center pb-0"
        aside={
          <div className="flex items-center gap-1">
            <p className={HEAD_NOTE}>{doneCount} of {steps.length} done</p>
            <Button
              variant="ghost"
              size="icon-lg"
              onClick={handleDismiss}
              className="-mr-3 text-muted-foreground hover:text-foreground"
              aria-label="Hide the getting started guide"
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        }
      >
        Get started
      </SectionHeading>
      <ul className="flex flex-col">
        {remaining.map(step => (
          <li key={step.id} className="border-b border-border">
            <Link
              href={step.href}
              className="-mx-2 flex min-h-14 items-center gap-3 rounded-lg px-2 py-2.5 outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-medium">{step.label}</span>
                <span className="text-[13px] text-muted-foreground">{step.why}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
