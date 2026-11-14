'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

type Props = {
  title: string
  count: number
  onDismiss: () => void
  children: React.ReactNode
}

const AUTO_DISMISS_MS = 30_000

export function QueryListAnswer({ title, count, onDismiss, children }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3 border-b border-border">
        <h2 className="pb-2.5 text-[19px] font-bold tracking-[-0.02em] lg:text-[22px]">
          {title}{' '}
          <span className="text-sm font-semibold tabular-nums text-muted-foreground">{count}</span>
        </h2>
        <Button
          variant="ghost"
          onClick={onDismiss}
          className="-mr-2 h-11 shrink-0 px-2 font-medium underline underline-offset-4 hover:bg-transparent"
          aria-label="Dismiss results"
        >
          Dismiss
        </Button>
      </div>

      <div className="-mt-3 max-h-[60vh] overflow-y-auto">
        {count === 0 ? (
          <p className="pt-3 text-[13px] text-muted-foreground">Nothing matches</p>
        ) : (
          children
        )}
      </div>
    </section>
  )
}
