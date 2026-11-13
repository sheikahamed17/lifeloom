'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BookHeart, ChartColumn, Flame, Lightbulb, Search, Settings, Sparkles } from 'lucide-react'
import { PulseLogo } from '@/components/pulse-logo'
import { RowMenu } from '@/components/row-menu'

const DESTINATIONS = [
  { href: '/insights', label: 'Insights', icon: Lightbulb },
  { href: '/analytics', label: 'Analytics', icon: ChartColumn },
  { href: '/habits', label: 'Habits', icon: Flame },
  { href: '/journal', label: 'Journal', icon: BookHeart },
  { href: '/assistant', label: 'Assistant', icon: Sparkles },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const

const ICON_BUTTON = 'flex size-11 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-white/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-2'

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
        <button type="button" onClick={onSearch} className={`${ICON_BUTTON} lg:w-auto lg:gap-2 lg:px-3 lg:text-sm`} aria-label="Search everything">
          <Search className="size-5" aria-hidden />
          <span className="hidden lg:inline">Search</span>
        </button>
        <ul className="hidden items-center gap-1 lg:flex">
          {DESTINATIONS.map(d => (
            <li key={d.href}>
              <Link href={d.href} className={`${ICON_BUTTON} w-auto gap-2 px-3 text-sm`}>
                <d.icon className="size-4" aria-hidden />
                {d.label}
              </Link>
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
