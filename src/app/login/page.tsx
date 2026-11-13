'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Fingerprint } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { authClient } from '@/lib/auth-client'
import { useDemo } from '@/hooks/use-demo'
import { PulseLogo } from '@/components/shared/pulse-logo'

export default function LoginPage() {
  const router = useRouter()
  const { demoMode } = useDemo()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [showEmail, setShowEmail] = useState(false)

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
      <main className="flex min-h-[calc(100dvh_-_env(safe-area-inset-top))] items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center gap-2">
            <PulseLogo className="size-12" />
            <CardTitle>Sign in to Lifeloom</CardTitle>
          </CardHeader>
          <CardContent>
            {state === 'sent' ? (
              <p className="text-sm text-muted-foreground">Magic link sent. Check your inbox.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <Button onClick={handlePasskey} disabled={state === 'sending'} className="w-full">
                  {state === 'sending' ? <Spinner aria-hidden /> : <Fingerprint className="size-4" aria-hidden />}
                  {state === 'sending' ? 'Signing in…' : 'Sign in with Face ID'}
                </Button>

                {!showEmail ? (
                  <Button type="button" variant="link" onClick={() => setShowEmail(true)} className="text-muted-foreground">
                    Email me a link instead
                  </Button>
                ) : (
                  <form onSubmit={handleEmail} className="flex flex-col gap-3">
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="email">Email</FieldLabel>
                        <Input id="email" type="email" required value={email}
                          onChange={e => setEmail(e.target.value)} autoComplete="email" />
                      </Field>
                    </FieldGroup>
                    <Button type="submit" variant="secondary" disabled={state === 'sending'}>
                      {state === 'sending' && <Spinner aria-hidden />}
                      {state === 'sending' ? 'Sending…' : 'Send magic link'}
                    </Button>
                  </form>
                )}

                {errorMsg && (
                  <Alert variant="destructive">
                    <AlertDescription>{errorMsg}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  )
}
