'use client'

import { PartyPopper, Fingerprint, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Done({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="flex flex-col gap-4 text-center">
      <PartyPopper className="mx-auto size-8 text-accent-2" aria-hidden />
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">You&apos;re all set</h2>
        <p className="text-sm text-muted-foreground">Your Lifeloom is ready. Two tips to make it feel native:</p>
      </div>

      <ul className="flex flex-col gap-2 text-left text-sm">
        <li className="flex items-start gap-2">
          <Smartphone className="mt-0.5 size-4 flex-shrink-0 text-accent-2" aria-hidden />
          <span><b>Install it:</b> open Lifeloom on your phone and <b>Add to Home Screen</b> for a full-screen app.</span>
        </li>
        <li className="flex items-start gap-2">
          <Fingerprint className="mt-0.5 size-4 flex-shrink-0 text-accent-2" aria-hidden />
          <span><b>Add a passkey:</b> in <b>Settings → Security</b>, add Face ID / a passkey so you never need the email link again.</span>
        </li>
      </ul>

      <Button onClick={onFinish} className="w-full">Open Lifeloom</Button>
    </div>
  )
}
