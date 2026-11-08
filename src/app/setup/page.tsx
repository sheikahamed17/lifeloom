'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { setupStage, type SetupStage } from '@/lib/setup'
import { AuroraBackground } from '@/components/aurora-background'
import { Card, CardContent } from '@/components/ui/card'
import { PulseLogo } from '@/components/pulse-logo'
import { Welcome } from '@/components/setup/welcome'
import { CreateAccount } from '@/components/setup/create-account'
import { VerifyAi } from '@/components/setup/verify-ai'
import { EmailIngest } from '@/components/setup/email-ingest'
import { Done } from '@/components/setup/done'

type Status = { usersExist: boolean; emailConfigured: boolean }

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuroraBackground />
      <main className="flex min-h-[calc(100dvh_-_env(safe-area-inset-top))] items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col gap-5 pt-6">
            <PulseLogo className="mx-auto size-10" />
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
    return <Shell><p className="text-center text-sm text-muted-foreground">Loading…</p></Shell>
  }
  if (stage === 'app') {
    return <Shell><p className="text-center text-sm text-muted-foreground">Taking you to Lifeloom…</p></Shell>
  }

  if (stage === 'create') {
    return (
      <Shell>
        {createStep === 'welcome'
          ? <Welcome onNext={() => setCreateStep('account')} />
          : <CreateAccount emailConfigured={status.emailConfigured} />}
      </Shell>
    )
  }

  // stage === 'continue' — owner just created their account and returned.
  return (
    <Shell>
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
