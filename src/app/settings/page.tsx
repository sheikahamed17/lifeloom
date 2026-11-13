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
import { authClient } from '@/lib/auth-client'
import { useDemo } from '@/hooks/use-demo'

type Item = { href: string; title: string; description: string; icon: React.ComponentType<{ className?: string }>; hideInDemo?: boolean }

const GROUPS: { title: string; items: Item[] }[] = [
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

const ROW = 'flex min-h-14 items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-white/5 focus-visible:bg-white/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-2'

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`settings-${title}`} className="flex flex-col gap-2">
      <h2 id={`settings-${title}`} className="px-1 text-sm font-semibold text-muted-foreground">{title}</h2>
      <div className="glass overflow-hidden rounded-2xl">{children}</div>
    </section>
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
          <ul className="divide-y divide-white/10">
            {group.items.filter(i => !(demoMode && i.hideInDemo)).map(item => (
              <li key={item.href}>
                <Link href={item.href} className={ROW}>
                  <item.icon className="size-5 shrink-0 text-accent-2" aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium">{item.title}</span>
                    <span className="text-xs text-muted-foreground">{item.description}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </SettingsGroup>
      ))}

      {!demoMode && (
        <SettingsGroup title="Account">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="min-w-0 text-sm">
              <span className="block text-xs text-muted-foreground">Signed in as</span>
              <span className="break-all">{email ?? '…'}</span>
            </p>
            <Button variant="outline" onClick={() => authClient.signOut().then(() => router.replace('/login'))}>
              <LogOut className="size-4" aria-hidden />
              Sign out
            </Button>
          </div>
        </SettingsGroup>
      )}

      <SettingsGroup title="Maintenance">
        <Link href="/settings/rebuild" className={ROW}>
          <RefreshCw className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium">Rebuild server data</span>
            <span className="text-xs text-muted-foreground">Re-sync your history into the server tables if budgets or insights look stale. Safe to run any time.</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      </SettingsGroup>
    </PageShell>
  )
}
