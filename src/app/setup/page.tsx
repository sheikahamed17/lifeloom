'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { setupStage, type SetupStage } from '@/lib/setup'
import { AuroraBackground } from '@/components/aurora-background'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { PulseLogo } from '@/components/pulse-logo'
import { Welcome } from '@/components/setup/welcome'
import { CreateAccount } from '@/components/setup/create-account'
import { VerifyAi } from '@/components/setup/verify-ai'
import { EmailIngest } from '@/components/setup/email-ingest'
import { Done } from '@/components/setup/done'

type Status = { usersExist: boolean; emailConfigured: boolean }

const TOTAL_STEPS = 5

function Shell({ children, step }: { children: React.ReactNode; step?: number }) {
  return (
    <>
      <AuroraBackground />
      <main className="flex min-h-[calc(100dvh_-_env(safe-area-inset-top))] items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col gap-5 pt-6">
            <PulseLogo className="mx-auto size-10" />
            {step !== undefined && (
              <Progress value={(step / TOTAL_STEPS) * 100} aria-label={`Setup progress, step ${step} of ${TOTAL_STEPS}`}>
                <span className="text-xs text-muted-foreground">Step {step} of {TOTAL_STEPS}</span>
              </Progress>
            )}
            {children}
          </CardContent>
        </Card>
      </main>
    </>
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
    return <Shell><p role="status" className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden />Loading…</p></Shell>
  }
  if (stage === 'app') {
    return <Shell><p role="status" className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden />Taking you to Lifeloom…</p></Shell>
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
