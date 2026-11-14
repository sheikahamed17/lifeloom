'use client'

import { Button } from '@/components/ui/button'
import { STEP_BUTTON, StepActions, StepHeading } from '@/components/setup/step-layout'

export function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <StepHeading title="Welcome to your Lifeloom">
        <p>
          This is your own private instance. Your data and your keys, fully isolated and yours alone. Let&apos;s get it set up. It takes about a minute.
        </p>
      </StepHeading>
      <StepActions>
        <Button onClick={onNext} size="lg" className={STEP_BUTTON}>Get started</Button>
      </StepActions>
    </div>
  )
}
