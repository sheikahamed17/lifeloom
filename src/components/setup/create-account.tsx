'use client'

import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { magicLinkSentMessage } from '@/lib/setup'
import { STEP_BUTTON, STEP_NOTICE, StepActions, StepHeading } from '@/components/setup/step-layout'

// The FIRST user must be created with a magic link — Better Auth's passkey can
// only be *added* to an existing account, so a passkey is offered later
// (Settings → Security), not here. Clicking the emailed/logged link returns to
// /setup?welcome=1 to finish the wizard.
export function CreateAccount({ emailConfigured }: { emailConfigured: boolean }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('sending')
    setError('')
    try {
      const res = await authClient.signIn.magicLink({ email, callbackURL: '/setup?welcome=1' })
      if ((res as { error?: unknown })?.error) {
        setError('Could not send the sign-in link. Check the email and try again.')
        setState('error')
        return
      }
      setState('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setState('error')
    }
  }

  if (state === 'sent') {
    return (
      <div className="flex flex-col gap-6">
        <StepHeading title="Almost there" />
        <div role="status" className={STEP_NOTICE}>
          <p className="text-[15px] font-medium leading-normal">{magicLinkSentMessage(emailConfigured)}</p>
          <p className="text-[13px] leading-normal text-muted-foreground">Open the link on this device to finish setting up. You&apos;ll come right back here.</p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <StepHeading title="Create your account">
        <p>
          You&apos;re the owner of this instance. Sign in with your email and we&apos;ll send a one-time link. You can add Face ID or a passkey later.
        </p>
      </StepHeading>

      {!emailConfigured && (
        <Alert className={STEP_NOTICE}>
          <AlertTitle className="flex items-center gap-2 text-[15px] font-semibold text-warning">
            <TriangleAlert className="size-4.5 shrink-0" aria-hidden />
            Email isn&apos;t configured yet
          </AlertTitle>
          <AlertDescription className="text-foreground">
            The sign-in link will be printed to your <b className="font-semibold">deploy logs</b> instead of emailed.
          </AlertDescription>
        </Alert>
      )}

      <FieldGroup>
        <Field className="gap-2">
          <FieldLabel htmlFor="setup-email" className="text-[13px] font-semibold tracking-normal text-muted-foreground">Email</FieldLabel>
          <Input
            id="setup-email"
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
          />
        </Field>
      </FieldGroup>

      <StepActions>
        <Button type="submit" disabled={state === 'sending'} size="lg" className={STEP_BUTTON}>
          {state === 'sending' && <Spinner aria-hidden />}
          {state === 'sending' ? 'Sending…' : 'Send sign-in link'}
        </Button>
      </StepActions>

      {error && (
        <Alert variant="destructive" className={STEP_NOTICE}>
          <AlertDescription className="text-destructive">{error}</AlertDescription>
        </Alert>
      )}
    </form>
  )
}
