'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, X } from 'lucide-react'
import { useMoneyEntries } from '@/hooks/use-money-entries'
import { useAccounts } from '@/hooks/use-accounts'
import { useBudgets } from '@/hooks/use-budgets'
import { useRecurringRules } from '@/hooks/use-recurring-rules'
import { useHabits } from '@/hooks/use-habits'
import { usePushSubscription } from '@/hooks/use-push-subscription'
import { onboardingSteps, allStepsDone } from '@/lib/onboarding'

type Props = { userId: string }

export function GettingStarted({ userId }: Props) {
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
    <section aria-labelledby="get-started-heading" className="glass flex flex-col gap-1 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="get-started-heading" className="text-sm font-semibold">
          Get started <span className="font-normal text-muted-foreground">· {doneCount} of {steps.length} done</span>
        </h2>
        <button
          type="button"
          onClick={handleDismiss}
          className="-mr-2 -mt-2 flex size-11 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-white/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2"
          aria-label="Hide the getting started guide"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <ul className="flex flex-col">
        {remaining.map(step => (
          <li key={step.id}>
            <Link
              href={step.href}
              className="-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-accent-2"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm">{step.label}</span>
                <span className="text-xs text-muted-foreground">{step.why}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
