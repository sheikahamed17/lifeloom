'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { PageShell } from '@/components/layout/page-shell'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { useDemo } from '@/hooks/use-demo'

type NavItem = { href: string; title: string; description: string; hideInDemo?: boolean }

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Money',
    items: [
      { href: '/settings/categories', title: 'Categories', description: 'Add, rename and archive spend and income categories.' },
      { href: '/settings/accounts', title: 'Accounts', description: 'Bank accounts and credit cards, and which card is which.' },
      { href: '/settings/people', title: 'People', description: 'Who owes you for shared expenses; mark repayments paid.' },
      { href: '/settings/goals', title: 'Goals', description: 'Savings targets and your progress towards them.' },
      { href: '/settings/transfers', title: 'Transfers', description: 'Move money between your accounts.' },
      { href: '/settings/recurring', title: 'Recurring rules', description: 'Rent, salary, subscriptions and other scheduled entries.' },
      { href: '/settings/sms-import', title: 'Auto-import transactions', description: 'Turn bank emails and SMS into entries automatically.', hideInDemo: true },
    ],
  },
  {
    title: 'Tasks',
    items: [
      { href: '/settings/projects', title: 'Projects', description: 'Group tasks; rename, colour and archive projects.' },
    ],
  },
  {
    title: 'App',
    items: [
      { href: '/settings/preferences', title: 'Preferences', description: 'Primary currency, time zone and notifications.' },
      { href: '/settings/security', title: 'Security', description: 'Passkeys and the app PIN lock.', hideInDemo: true },
      { href: '/settings/data', title: 'Data and backup', description: 'Export or import everything as JSON or CSV.', hideInDemo: true },
    ],
  },
]

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`settings-${title}`} className="flex flex-col">
      <div className="border-b border-border pb-2.5 lg:pb-3">
        <h2 id={`settings-${title}`} className="text-[19px] font-bold tracking-[-0.02em] lg:text-[22px]">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function NavRow({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-[60px] items-center gap-3 border-b border-border py-2.5 outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 lg:gap-4"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="text-[13px] text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  )
}

export default function SettingsPage() {
  const { demoMode } = useDemo()
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    authClient.getSession().then(res => setEmail(res.data?.user?.email ?? null)).catch(() => setEmail(null))
  }, [])

  return (
    <PageShell title="Settings">
      {GROUPS.map(group => (
        <SettingsGroup key={group.title} title={group.title}>
          {group.items.filter(i => !(demoMode && i.hideInDemo)).map(item => (
            <NavRow key={item.href} href={item.href} title={item.title} description={item.description} />
          ))}
        </SettingsGroup>
      ))}

      {!demoMode && (
        <SettingsGroup title="Account">
          <div className="flex min-h-[68px] items-center gap-3 border-b border-border py-2.5">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[13px] text-muted-foreground">Signed in as</span>
              <span className="break-all text-[15px] font-medium">{email ?? '…'}</span>
            </div>
            <Button variant="outline" className="shrink-0" onClick={() => authClient.signOut().then(() => router.replace('/login'))}>
              Sign out
            </Button>
          </div>
        </SettingsGroup>
      )}

      <SettingsGroup title="Maintenance">
        <NavRow
          href="/settings/rebuild"
          title="Rebuild server data"
          description="Re-sync your history into the server tables if budgets or insights look stale. Safe to run any time."
        />
      </SettingsGroup>
    </PageShell>
  )
}
