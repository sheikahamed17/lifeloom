'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { STEP_BUTTON, StepActions, StepHeading } from '@/components/setup/step-layout'

export function EmailIngest({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <StepHeading title="Auto-import bank alerts">
        <p>
          Optional: forward your bank&apos;s transaction emails and they land as categorized entries, hands-free. It&apos;s a few steps in Google Apps Script. Set it up whenever you like.
        </p>
      </StepHeading>

      <Button variant="link" render={<Link href="/settings/sms-import" />} nativeButton={false} className="h-auto min-h-11 w-fit justify-start whitespace-normal px-0 text-left">
        See the setup guide in Settings, Auto-import
      </Button>

      <StepActions className="pt-2">
        <Button onClick={onNext} size="lg" className={STEP_BUTTON}>Skip for now</Button>
      </StepActions>
    </div>
  )
}
