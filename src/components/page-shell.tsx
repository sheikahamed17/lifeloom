import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  title: string
  /** Where the back link goes; every inner page has exactly one, top-left. */
  back?: { href: string; label: string }
  actions?: React.ReactNode
  width?: 'narrow' | 'wide'
  children: React.ReactNode
}

/**
 * One page shell for every screen outside Money home: the aurora, one back link
 * in one place, one title style (critique: four back-link variants, no shared shell).
 */
export function PageShell({ title, back = { href: '/app', label: 'Lifeloom' }, actions, width = 'narrow', children }: Props) {
  return (
    <>
      <main className={cn('mx-auto flex w-full flex-col gap-4 p-4 pb-12 sm:p-6', width === 'narrow' ? 'max-w-2xl' : 'max-w-5xl')}>
        <header className="flex flex-col gap-1">
          <Button
            variant="ghost"
            size="lg"
            nativeButton={false}
            render={<Link href={back.href} />}
            className="-ml-3 w-fit gap-1.5 px-3 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {back.label}
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-semibold">{title}</h1>
            {actions}
          </div>
        </header>
        {children}
      </main>
    </>
  )
}
