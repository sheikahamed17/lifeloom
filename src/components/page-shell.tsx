import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AuroraBackground } from '@/components/aurora-background'
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
      <AuroraBackground />
      <main className={cn('mx-auto flex w-full flex-col gap-4 p-4 pb-12 sm:p-6', width === 'narrow' ? 'max-w-2xl' : 'max-w-5xl')}>
        <header className="flex flex-col gap-1">
          <Link
            href={back.href}
            className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {back.label}
          </Link>
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
