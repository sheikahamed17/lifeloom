'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BookHeart, ChartColumn, Flame, Lightbulb, Search, Settings, Sparkles } from 'lucide-react'
import { PulseLogo } from '@/components/shared/pulse-logo'
import { RowMenu } from '@/components/shared/row-menu'
import { Button } from '@/components/ui/button'

const DESTINATIONS = [
  { href: '/insights', label: 'Insights', icon: Lightbulb },
  { href: '/analytics', label: 'Analytics', icon: ChartColumn },
  { href: '/habits', label: 'Habits', icon: Flame },
  { href: '/journal', label: 'Journal', icon: BookHeart },
  { href: '/assistant', label: 'Assistant', icon: Sparkles },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const

/**
 * Home header: the mark and a modest name (not the app name again, huge), then
 * labelled destinations on desktop and Search + a labelled "More" menu on the
 * phone. Sign out and "Signed in as" live in Settings: a single-owner app that
 * never signs out doesn't need them on its home screen.
 */
export function AppHeader({ onSearch }: { onSearch: () => void }) {
  const router = useRouter()
  const [moreOpen, setMoreOpen] = useState(false)
  return (
    <header className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <PulseLogo className="size-7" title="" />
        <h1 className="text-base font-semibold">Lifeloom</h1>
      </div>
      <nav aria-label="Lifeloom" className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={onSearch}
          aria-label="Search everything"
          className="text-muted-foreground hover:text-foreground lg:w-auto lg:gap-2 lg:px-3"
        >
          <Search className="size-5" aria-hidden />
          <span className="hidden lg:inline">Search</span>
        </Button>
        <ul className="hidden items-center gap-1 lg:flex">
          {DESTINATIONS.map(d => (
            <li key={d.href}>
              <Button
                variant="ghost"
                size="lg"
                nativeButton={false}
                render={<Link href={d.href} />}
                className="gap-2 px-3 text-muted-foreground hover:text-foreground"
              >
                <d.icon className="size-4" aria-hidden />
                {d.label}
              </Button>
            </li>
          ))}
        </ul>
        <div className="lg:hidden">
          <RowMenu
            label="More"
            open={moreOpen}
            onOpenChange={setMoreOpen}
            items={DESTINATIONS.map(d => ({ label: d.label, icon: d.icon, onSelect: () => router.push(d.href) }))}
          />
        </div>
      </nav>
    </header>
  )
}
