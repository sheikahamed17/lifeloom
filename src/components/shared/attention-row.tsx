import { cn } from '@/lib/utils'

type Props = {
  title: React.ReactNode
  /** One short line under the title. Pass `urgent` to colour it as attention (due soon, overdue). */
  detail?: React.ReactNode
  urgent?: boolean
  /** Right-aligned figure, e.g. an amount. */
  value?: React.ReactNode
  /** The one action for this item (a Button or a link styled as one). */
  action?: React.ReactNode
  className?: string
}

/**
 * A white rounded row for something that is waiting on the user (confirm an entry, pay a
 * bill). These are the ONLY raised surfaces on a page; ordinary lists stay ruled rows on
 * the ground. Stack several inside a `flex flex-col gap-2`.
 */
export function AttentionRow({ title, detail, urgent, value, action, className }: Props) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-card px-4 py-3.5', className)}>
      <div className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5">
        <p className="text-[15px] font-semibold">{title}</p>
        {detail && <p className={cn('text-[13px]', urgent ? 'font-medium text-warning' : 'text-muted-foreground')}>{detail}</p>}
      </div>
      {value && <p className="text-base font-semibold tabular-nums">{value}</p>}
      {action}
    </div>
  )
}
