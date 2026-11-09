'use client'

import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { AuroraBackground } from '@/components/aurora-background'
import { useDemo } from '@/hooks/use-demo'

export default function SettingsPage() {
  const { demoMode } = useDemo()
  return (
    <>
      <AuroraBackground />
      <main className="mx-auto flex w-full max-w-md md:max-w-3xl flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <Link href="/settings/categories">
          <Card className="hover:bg-white/10 transition">
            <CardHeader>
              <CardTitle>Categories</CardTitle>
              <CardDescription>Add, rename, archive your spend + income categories.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/settings/accounts">
          <Card className="hover:bg-white/10 transition">
            <CardHeader>
              <CardTitle>Accounts</CardTitle>
              <CardDescription>Add, rename, archive bank accounts and credit cards.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/settings/people">
          <Card className="hover:bg-white/10 transition">
            <CardHeader>
              <CardTitle>People</CardTitle>
              <CardDescription>Who owes you for shared expenses; mark repayments paid.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/settings/goals">
          <Card className="hover:bg-white/10 transition">
            <CardHeader>
              <CardTitle>Goals</CardTitle>
              <CardDescription>Set savings targets and track progress toward your goals.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/settings/transfers">
          <Card className="hover:bg-white/10 transition">
            <CardHeader>
              <CardTitle>Transfers</CardTitle>
              <CardDescription>Move money between your accounts.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/settings/projects">
          <Card className="hover:bg-white/10 transition">
            <CardHeader>
              <CardTitle>Projects</CardTitle>
              <CardDescription>Group your tasks; rename, color, and archive projects.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/settings/recurring">
          <Card className="hover:bg-white/10 transition">
            <CardHeader>
              <CardTitle>Recurring rules</CardTitle>
              <CardDescription>Manage scheduled spend + income (rent, salary, subscriptions).</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        {!demoMode && (
          <Link href="/settings/security">
            <Card className="hover:bg-white/10 transition">
              <CardHeader>
                <CardTitle>Security</CardTitle>
                <CardDescription>Passkeys (Face ID sign-in) and app PIN lock.</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        )}
        <Link href="/settings/preferences">
          <Card className="hover:bg-white/10 transition">
            <CardHeader>
              <CardTitle>Preferences</CardTitle>
              <CardDescription>Primary currency, time zone, and other settings.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        {!demoMode && (
          <Link href="/settings/sms-import">
            <Card className="hover:bg-white/10 transition">
              <CardHeader>
                <CardTitle>Auto-import transactions</CardTitle>
                <CardDescription>Turn bank transaction emails + SMS into money entries automatically.</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        )}
        {!demoMode && (
          <Link href="/settings/data">
            <Card className="hover:bg-white/10 transition">
              <CardHeader>
                <CardTitle>Data & backup</CardTitle>
                <CardDescription>Export and import your complete data as JSON or CSV.</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        )}
        <Link href="/insights">
          <Card className="hover:bg-white/10 transition">
            <CardHeader>
              <CardTitle>Insights</CardTitle>
              <CardDescription>Browse your weekly digests + generate this week on demand.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/settings/rebuild">
          <Card className="hover:bg-white/10 transition">
            <CardHeader>
              <CardTitle>Rebuild server data</CardTitle>
              <CardDescription>Re-sync your history into the server tables (fixes stale budgets/insights). Safe to run anytime.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/app" className="text-sm text-muted-foreground hover:underline">← Back to Lifeloom</Link>
      </main>
    </>
  )
}
