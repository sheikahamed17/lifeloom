import { cn } from '@/lib/utils'

/** A wizard button: fills the row on a phone, sized to its label on desktop. */
export const STEP_BUTTON = 'min-w-0 flex-1 lg:h-12 lg:flex-none lg:px-8 lg:text-[15px]'

/** A white rounded surface for a status the owner should read (a check result, a warning). */
export const STEP_NOTICE = 'flex flex-col gap-1.5 rounded-2xl border-transparent bg-card px-4 py-3.5 lg:px-5 lg:py-4'

/** The current step's title and its one or two lines of explanation. */
export function StepHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em] lg:text-[34px]">{title}</h1>
      {children && <div className="flex flex-col gap-2 text-sm leading-normal text-muted-foreground">{children}</div>}
    </div>
  )
}

/** The row of buttons that ends a step: one primary, at most one outline beside it. */
export function StepActions({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('flex gap-2 lg:flex-wrap', className)}>{children}</div>
}
