import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  title: string
  /** Where the back link goes; every inner page has exactly one, top-left. */
  back?: { href: string; label: string }
  /** One muted line under the title saying what the page is for. */
  description?: React.ReactNode
  actions?: React.ReactNode
  width?: 'narrow' | 'wide'
  children: React.ReactNode
}

/**
 * One page shell for every screen outside Money home: one back link
 * in one place, one title style (critique: four back-link variants, no shared shell).
 */
export function PageShell({ title, back = { href: '/app', label: 'Money' }, description, actions, width = 'narrow', children }: Props) {
  return (
    <>
      <main className={cn('mx-auto flex w-full flex-col gap-8 px-5 pb-16 pt-3 sm:px-6 lg:gap-10 lg:p-8', width === 'narrow' ? 'max-w-[720px]' : 'max-w-[1200px]')}>
        <header className="flex flex-col gap-2">
          <Button
            variant="ghost"
            size="lg"
            nativeButton={false}
            render={<Link href={back.href} />}
            className="-ml-3 h-11 w-fit gap-1 px-3 text-[15px] font-medium"
          >
            <ChevronLeft className="size-5" aria-hidden />
            {back.label}
          </Button>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em] lg:text-[34px]">{title}</h1>
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
            {actions}
          </div>
        </header>
        {children}
      </main>
    </>
  )
}
