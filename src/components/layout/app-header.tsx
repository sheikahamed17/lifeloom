'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { RowMenu } from '@/components/shared/row-menu'
import { Button } from '@/components/ui/button'

const DESTINATIONS = [
  { href: '/insights', label: 'Insights' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/habits', label: 'Habits' },
  { href: '/journal', label: 'Journal' },
  { href: '/assistant', label: 'Assistant' },
  { href: '/settings', label: 'Settings' },
] as const

/**
 * Home header. Phone: the wordmark, then Search and a "More" menu holding every other
 * destination. Desktop: a bar with a bottom hairline holding the wordmark, the section
 * tabs (`tabs`, the page's inline TabBar) and, on the right, Search plus the destinations
 * as quiet text links (the "More" menu until there is room for them). Sign out and
 * "Signed in as" live in Settings: a single-owner app that never signs out doesn't need
 * them on its home screen.
 */
export function AppHeader({ onSearch, tabs }: { onSearch: () => void; tabs?: React.ReactNode }) {
  const router = useRouter()
  const [moreOpen, setMoreOpen] = useState(false)
  return (
    <header className="lg:border-b lg:border-border">
      <div className="mx-auto flex w-full max-w-[1200px] items-center gap-x-10 py-3 pl-5 pr-3 lg:px-8 lg:py-0">
        <h1 className="text-xl font-bold tracking-[-0.02em] lg:py-[18px]">Lifeloom</h1>
        {tabs && <div className="hidden self-stretch lg:flex">{tabs}</div>}
        <nav aria-label="Lifeloom" className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-lg" onClick={onSearch} aria-label="Search everything">
            <Search className="size-[22px] lg:size-5" aria-hidden />
          </Button>
          <ul className="hidden items-center xl:flex">
            {DESTINATIONS.map(d => (
              <li key={d.href}>
                <Button
                  variant="ghost"
                  nativeButton={false}
                  render={<Link href={d.href} />}
                  className="px-2.5 font-medium text-muted-foreground hover:text-foreground"
                >
                  {d.label}
                </Button>
              </li>
            ))}
          </ul>
          <div className="xl:hidden">
            <RowMenu
              label="More"
              open={moreOpen}
              onOpenChange={setMoreOpen}
              triggerClassName="text-foreground [&_svg]:size-[22px] lg:[&_svg]:size-5"
              items={DESTINATIONS.map(d => ({ label: d.label, onSelect: () => router.push(d.href) }))}
            />
          </div>
        </nav>
      </div>
    </header>
  )
}
