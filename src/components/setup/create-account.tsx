'use client'

import { useState } from 'react'
import { Mail, TriangleAlert } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { magicLinkSentMessage } from '@/lib/setup'

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
      <div className="flex flex-col gap-3 text-center">
        <Mail className="mx-auto size-8 text-accent-2" aria-hidden />
        <h2 className="text-xl font-semibold">Almost there</h2>
        <p className="text-sm text-muted-foreground">{magicLinkSentMessage(emailConfigured)}</p>
        <p className="text-xs text-muted-foreground">Open the link on this device to finish setting up — you&apos;ll come right back here.</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 text-center">
        <h2 className="text-xl font-semibold">Create your account</h2>
        <p className="text-sm text-muted-foreground">
          You&apos;re the owner of this instance. Sign in with your email and we&apos;ll send a one-time link. (You can add Face ID / a passkey later.)
        </p>
      </div>

      {!emailConfigured && (
        <Alert className="text-warning">
          <TriangleAlert aria-hidden />
          <AlertDescription className="text-warning">
            Email isn&apos;t configured on this instance yet — the sign-in link will be printed to your <b>deploy logs</b> instead of emailed.
          </AlertDescription>
        </Alert>
      )}

      <FieldGroup>
        <Field>
        <FieldLabel htmlFor="setup-email">Email</FieldLabel>
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

      <Button type="submit" disabled={state === 'sending'} className="w-full">
        {state === 'sending' && <Spinner aria-hidden />}
        {state === 'sending' ? 'Sending…' : 'Send sign-in link'}
      </Button>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  )
}
