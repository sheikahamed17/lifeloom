'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Fingerprint } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { Separator } from '@/components/ui/separator'
import { authClient } from '@/lib/auth-client'
import { useDemo } from '@/hooks/use-demo'

export default function LoginPage() {
  const router = useRouter()
  const { demoMode } = useDemo()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // The demo has no login — every visitor is already the demo user.
  useEffect(() => {
    if (demoMode) router.replace('/app')
  }, [demoMode, router])

  async function handlePasskey() {
    setState('sending'); setErrorMsg('')
    try {
      const res = await authClient.signIn.passkey()
      if (res?.error) {
        setErrorMsg('No passkey found on this device. Use email to sign in, then add a passkey in Settings → Security.')
        setState('error')
        return
      }
      window.location.href = '/app'
    } catch {
      setErrorMsg('Passkey sign-in was cancelled or is unsupported here. Try email instead.')
      setState('error')
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault()
    setState('sending'); setErrorMsg('')
    try {
      await authClient.signIn.magicLink({ email, callbackURL: '/app' })
      setState('sent')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setState('error')
    }
  }

  return (
    <>
      <main className="mx-auto flex w-full max-w-[420px] flex-col px-5 pb-8 pt-24 lg:px-8 lg:pt-32">
        <p className="text-xl font-bold tracking-[-0.02em]">Lifeloom</p>
        <h1 className="mt-10 text-[28px] font-bold leading-tight tracking-[-0.03em] lg:text-[34px]">Sign in to Lifeloom</h1>

        {state === 'sent' ? (
          <p role="status" className="mt-8 rounded-2xl bg-card px-4 py-3.5 text-[15px] font-medium">Magic link sent. Check your inbox.</p>
        ) : (
          <>
            <p className="mt-1.5 text-sm text-muted-foreground">Use the passkey on this device, or get a link by email.</p>

            <Button onClick={handlePasskey} disabled={state === 'sending'} size="lg" className="mt-8 w-full gap-2.5">
              {state === 'sending' ? <Spinner aria-hidden /> : <Fingerprint className="size-5" aria-hidden />}
              {state === 'sending' ? 'Signing in…' : 'Sign in with Face ID'}
            </Button>

            <div className="flex items-center gap-3 pb-5 pt-7">
              <Separator className="flex-1" />
              <p className="text-[13px] text-muted-foreground">or email me a link instead</p>
              <Separator className="flex-1" />
            </div>

            <form onSubmit={handleEmail} className="flex flex-col gap-2">
              <FieldGroup>
                <Field className="gap-2">
                  <FieldLabel htmlFor="email" className="text-[13px] font-semibold tracking-normal text-muted-foreground">Email</FieldLabel>
                  <Input id="email" type="email" required value={email} placeholder="you@example.com"
                    onChange={e => setEmail(e.target.value)} autoComplete="email" />
                </Field>
              </FieldGroup>
              <Button type="submit" variant="outline" disabled={state === 'sending'} className="mt-2 h-12 text-[15px]">
                {state === 'sending' && <Spinner aria-hidden />}
                {state === 'sending' ? 'Sending…' : 'Send magic link'}
              </Button>
            </form>

            {errorMsg && (
              <Alert variant="destructive" className="mt-4 rounded-2xl border-transparent px-4 py-3.5">
                <AlertDescription className="text-destructive">{errorMsg}</AlertDescription>
              </Alert>
            )}

            <p className="mt-5 text-[13px] leading-normal text-muted-foreground">No passkey on this device yet? Sign in by email, then add one in Settings, Security.</p>
          </>
        )}
      </main>
    </>
  )
}
