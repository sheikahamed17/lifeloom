'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { setupStage, type SetupStage } from '@/lib/setup'
import { Check } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { Welcome } from '@/components/setup/welcome'
import { CreateAccount } from '@/components/setup/create-account'
import { VerifyAi } from '@/components/setup/verify-ai'
import { EmailIngest } from '@/components/setup/email-ingest'
import { Done } from '@/components/setup/done'

type Status = { usersExist: boolean; emailConfigured: boolean }

const TOTAL_STEPS = 5

/** The wizard's steps in order, with the short note shown beside one that is still ahead. */
const STEPS = [
  { name: 'Welcome' },
  { name: 'Create your account' },
  { name: 'Check AI is working' },
  { name: 'Auto-import bank alerts', note: 'Optional' },
  { name: 'You are all set', note: 'Install and passkey tips' },
]

function Shell({ children, step }: { children: React.ReactNode; step?: number }) {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-7 px-5 pb-12 pt-6 lg:gap-14 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <p className="text-xl font-bold tracking-[-0.02em]">Lifeloom</p>
        <p className="text-sm text-muted-foreground">First-run setup, about a minute</p>
      </header>

      <div className="flex flex-col gap-9 lg:flex-row lg:items-start lg:gap-24">
        <main className="flex min-w-0 flex-col lg:flex-[999_1_560px]">
          <div className="flex w-full max-w-[560px] flex-col gap-7 lg:gap-8">
            {step !== undefined && (
              <Progress
                value={(step / TOTAL_STEPS) * 100}
                aria-label={`Setup progress, step ${step} of ${TOTAL_STEPS}`}
                className="gap-2 [&_[data-slot=progress-indicator]]:rounded-full [&_[data-slot=progress-indicator]]:bg-foreground [&_[data-slot=progress-track]]:h-2"
              >
                <span className="w-full text-[13px] font-semibold text-muted-foreground">Step {step} of {TOTAL_STEPS}</span>
              </Progress>
            )}
            {children}
          </div>
        </main>

        {step !== undefined && (
          <nav aria-label="Setup steps" className="flex min-w-0 flex-col lg:flex-[1_1_320px]">
            <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2.5 lg:pb-3">
              <h2 className="text-[19px] font-bold tracking-[-0.02em] lg:text-[22px]">All steps</h2>
              <p className="text-[13px] text-muted-foreground lg:text-sm">{step - 1} of {TOTAL_STEPS} done</p>
            </div>
            <ol role="list" className="flex flex-col">
              {STEPS.map((s, i) => {
                const n = i + 1
                const done = n < step
                const current = n === step
                return (
                  <li
                    key={s.name}
                    aria-current={current ? 'step' : undefined}
                    className="flex min-h-13 items-center gap-3 border-b border-border text-[15px] lg:min-h-14"
                  >
                    <span className={cn('w-5 shrink-0 text-[13px]', current ? 'font-bold' : 'font-semibold text-muted-foreground')}>{n}</span>
                    <span className={cn('min-w-0 flex-1', current ? 'font-bold' : 'font-medium', done && 'text-muted-foreground')}>{s.name}</span>
                    {done && (
                      <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                        <Check className="size-4" aria-hidden />
                        Done
                      </span>
                    )}
                    {!done && !current && s.note && <span className="text-[13px] text-muted-foreground">{s.note}</span>}
                  </li>
                )
              })}
            </ol>
          </nav>
        )}
      </div>
    </div>
  )
}

function SetupFlow() {
  const router = useRouter()
  const params = useSearchParams()
  const welcome = params.get('welcome') === '1'
  const { data: session, isPending } = authClient.useSession()
  const [status, setStatus] = useState<Status | null>(null)
  const [createStep, setCreateStep] = useState<'welcome' | 'account'>('welcome')
  const [continueStep, setContinueStep] = useState<'verify' | 'ingest' | 'done'>('verify')

  useEffect(() => {
    fetch('/api/setup/status')
      .then(r => r.json() as Promise<Status>)
      .then(setStatus)
      .catch(() => setStatus({ usersExist: false, emailConfigured: false }))
  }, [])

  const stage: SetupStage | null =
    status === null || isPending
      ? null
      : setupStage({ usersExist: status.usersExist, authed: Boolean(session?.user), welcome })

  // Once an owner exists (and this isn't the magic-link continuation), the
  // wizard never reappears — leave for the app.
  useEffect(() => {
    if (stage === 'app') router.replace('/app')
  }, [stage, router])

  if (status === null || isPending) {
    return <Shell><p role="status" className="flex items-center gap-2 text-[15px] text-muted-foreground"><Spinner aria-hidden />Loading…</p></Shell>
  }
  if (stage === 'app') {
    return <Shell><p role="status" className="flex items-center gap-2 text-[15px] text-muted-foreground"><Spinner aria-hidden />Taking you to Lifeloom…</p></Shell>
  }

  if (stage === 'create') {
    return (
      <Shell step={createStep === 'welcome' ? 1 : 2}>
        {createStep === 'welcome'
          ? <Welcome onNext={() => setCreateStep('account')} />
          : <CreateAccount emailConfigured={status.emailConfigured} />}
      </Shell>
    )
  }

  // stage === 'continue' — owner just created their account and returned.
  return (
    <Shell step={continueStep === 'verify' ? 3 : continueStep === 'ingest' ? 4 : 5}>
      {continueStep === 'verify' && <VerifyAi onNext={() => setContinueStep('ingest')} />}
      {continueStep === 'ingest' && <EmailIngest onNext={() => setContinueStep('done')} />}
      {continueStep === 'done' && <Done onFinish={() => router.replace('/app')} />}
    </Shell>
  )
}

export default function SetupPage() {
  return (
    <Suspense fallback={null}>
      <SetupFlow />
    </Suspense>
  )
}
