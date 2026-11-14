'use client'

import { Button } from '@/components/ui/button'
import { STEP_BUTTON, StepActions, StepHeading } from '@/components/setup/step-layout'

export function Done({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <StepHeading title="You are all set">
        <p>Your Lifeloom is ready. Two tips to make it feel native:</p>
      </StepHeading>

      <ul className="flex flex-col border-t border-border">
        <li className="flex flex-col gap-0.5 border-b border-border py-3.5">
          <p className="text-[15px] font-semibold">Install it</p>
          <p className="text-[13px] leading-normal text-muted-foreground">Open Lifeloom on your phone and choose <b className="font-semibold text-foreground">Add to Home Screen</b> for a full-screen app.</p>
        </li>
        <li className="flex flex-col gap-0.5 border-b border-border py-3.5">
          <p className="text-[15px] font-semibold">Add a passkey</p>
          <p className="text-[13px] leading-normal text-muted-foreground">In <b className="font-semibold text-foreground">Settings, Security</b>, add Face ID or a passkey so you never need the email link again.</p>
        </li>
      </ul>

      <StepActions>
        <Button onClick={onFinish} size="lg" className={STEP_BUTTON}>Open Lifeloom</Button>
      </StepActions>
    </div>
  )
}
