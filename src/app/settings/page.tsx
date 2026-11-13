'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeftRight, ChevronRight, DatabaseBackup, FolderKanban, Landmark, LogOut, MailPlus, RefreshCw,
  Repeat, Settings2, ShieldCheck, Tags, Target, Users,
} from 'lucide-react'
import { PageShell } from '@/components/page-shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from '@/components/ui/item'
import { authClient } from '@/lib/auth-client'
import { useDemo } from '@/hooks/use-demo'

type NavItem = { href: string; title: string; description: string; icon: React.ComponentType<{ className?: string }>; hideInDemo?: boolean }

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Money',
    items: [
      { href: '/settings/categories', title: 'Categories', description: 'Add, rename and archive spend and income categories.', icon: Tags },
      { href: '/settings/accounts', title: 'Accounts', description: 'Bank accounts and credit cards, and which card is which.', icon: Landmark },
      { href: '/settings/people', title: 'People', description: 'Who owes you for shared expenses; mark repayments paid.', icon: Users },
      { href: '/settings/goals', title: 'Goals', description: 'Savings targets and your progress towards them.', icon: Target },
      { href: '/settings/transfers', title: 'Transfers', description: 'Move money between your accounts.', icon: ArrowLeftRight },
      { href: '/settings/recurring', title: 'Recurring rules', description: 'Rent, salary, subscriptions and other scheduled entries.', icon: Repeat },
      { href: '/settings/sms-import', title: 'Auto-import transactions', description: 'Turn bank emails and SMS into entries automatically.', icon: MailPlus, hideInDemo: true },
    ],
  },
  {
    title: 'Tasks',
    items: [
      { href: '/settings/projects', title: 'Projects', description: 'Group tasks; rename, colour and archive projects.', icon: FolderKanban },
    ],
  },
  {
    title: 'App',
    items: [
      { href: '/settings/preferences', title: 'Preferences', description: 'Primary currency, time zone and notifications.', icon: Settings2 },
      { href: '/settings/security', title: 'Security', description: 'Passkeys and the app PIN lock.', icon: ShieldCheck, hideInDemo: true },
      { href: '/settings/data', title: 'Data & backup', description: 'Export or import everything as JSON or CSV.', icon: DatabaseBackup, hideInDemo: true },
    ],
  },
]

const ROW = 'min-h-14 rounded-none px-4 py-3 hover:bg-white/5 focus-visible:bg-white/5 focus-visible:ring-inset focus-visible:ring-accent-2'

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`settings-${title}`} className="flex flex-col gap-2">
      <h2 id={`settings-${title}`} className="px-1 text-sm font-semibold text-muted-foreground">{title}</h2>
      <Card className="gap-0 py-0">{children}</Card>
    </section>
  )
}

function NavRow({ href, title, description, icon: Icon, muted }: { href: string; title: string; description: string; icon: React.ComponentType<{ className?: string }>; muted?: boolean }) {
  return (
    <Item className={ROW} render={<Link href={href} />}>
      <ItemMedia>
        <Icon className={muted ? 'size-5 text-muted-foreground' : 'size-5 text-accent-2'} aria-hidden />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription className="text-xs">{description}</ItemDescription>
      </ItemContent>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Item>
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
          <ItemGroup>
            {group.items.filter(i => !(demoMode && i.hideInDemo)).map((item, idx) => (
              <div key={item.href}>
                {idx > 0 && <ItemSeparator className="my-0" />}
                <NavRow href={item.href} title={item.title} description={item.description} icon={item.icon} />
              </div>
            ))}
          </ItemGroup>
        </SettingsGroup>
      ))}

      {!demoMode && (
        <SettingsGroup title="Account">
          <Item className="rounded-none px-4 py-3">
            <ItemContent className="min-w-0">
              <ItemDescription className="text-xs">Signed in as</ItemDescription>
              <ItemTitle className="break-all text-sm font-normal">{email ?? '…'}</ItemTitle>
            </ItemContent>
            <Button variant="outline" onClick={() => authClient.signOut().then(() => router.replace('/login'))}>
              <LogOut className="size-4" aria-hidden />
              Sign out
            </Button>
          </Item>
        </SettingsGroup>
      )}

      <SettingsGroup title="Maintenance">
        <NavRow
          href="/settings/rebuild"
          title="Rebuild server data"
          description="Re-sync your history into the server tables if budgets or insights look stale. Safe to run any time."
          icon={RefreshCw}
          muted
        />
      </SettingsGroup>
    </PageShell>
  )
}
