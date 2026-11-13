'use client'

import Link from 'next/link'
import { Mailbox } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function EmailIngest({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <Mailbox className="size-8 text-accent-2" aria-hidden />
        <h2 className="text-xl font-semibold">Auto-import bank alerts</h2>
        <p className="text-sm text-muted-foreground">
          Optional: forward your bank&apos;s transaction emails and they land as categorized entries, hands-free. It&apos;s a few steps in Google Apps Script — set it up whenever you like.
        </p>
      </div>

      <Button variant="link" render={<Link href="/settings/sms-import" />} nativeButton={false} className="h-auto min-h-10 whitespace-normal text-center">
        See the setup guide in Settings → Auto-import
      </Button>

      <Button onClick={onNext} className="w-full">Skip for now</Button>
    </div>
  )
}
