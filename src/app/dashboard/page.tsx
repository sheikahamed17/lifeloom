import { redirect } from 'next/navigation'

// Dashboard merged into Money home (owner decision, 13 Nov 2026): its money
// cards live in the Overview, and old bookmarks land there.
export default function DashboardPage() {
  redirect('/app?tab=money')
}
