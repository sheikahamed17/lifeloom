'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { db } from '@/lib/dexie'
import { applyLocalOp, pushPullOnce } from '@/lib/sync-client'
import { buildBackup, parseBackup, moneyEntriesToCsv } from '@/lib/data-export'
import { Button } from '@/components/ui/button'
import { PageShell } from '@/components/page-shell'
import type { Op } from '@/types/ops'

const BACK = { href: '/settings', label: 'Settings' }

export default function DataPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [opCount, setOpCount] = useState(0)
  const [moneyCount, setMoneyCount] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')

  useEffect(() => {
    authClient.getSession().then(res => {
      if (!res.data?.user) router.replace('/login')
      else setUserId(res.data.user.id)
    })
  }, [router])

  // Update counts whenever the page comes into focus
  useEffect(() => {
    const updateCounts = async () => {
      if (!userId) return
      const ops = await db.op_log.toArray()
      setOpCount(ops.filter(o => o.user_id === userId).length)
      const money = await db.money_entries.toArray()
      setMoneyCount(money.filter(r => r.user_id === userId && !r.deleted_at).length)
    }
    updateCounts()
  }, [userId])

  function todayStr() {
    return new Date().toISOString().slice(0, 10)
  }

  function downloadFile(name: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function handleExportBackup() {
    if (!userId) return
    setIsExporting(true)
    try {
      const ops = (await db.op_log.toArray()).filter(o => o.user_id === userId)
      const backup = buildBackup(ops as Op[], new Date().toISOString())
      downloadFile(
        `pulse-backup-${todayStr()}.json`,
        JSON.stringify(backup, null, 2),
        'application/json'
      )
    } catch (err) {
      console.error('Export backup failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  async function handleExportMoney() {
    if (!userId) return
    setIsExporting(true)
    try {
      const rows = (await db.money_entries.toArray()).filter(
        r => r.user_id === userId && !r.deleted_at
      )
      const csv = moneyEntriesToCsv(rows)
      downloadFile(`pulse-money-${todayStr()}.csv`, csv, 'text/csv')
    } catch (err) {
      console.error('Export money failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImportError('')
    setImportSuccess('')

    // Check file size
    if (file.size > 10 * 1024 * 1024) {
      setImportError('File too large (max 10 MB)')
      e.target.value = ''
      return
    }

    setIsImporting(true)
    try {
      const text = await file.text()
      const res = parseBackup(text)

      if (!res.ok) {
        setImportError(res.error)
        e.target.value = ''
        return
      }

      // All-or-nothing account guard: every op is stamped with its exporter's
      // user_id. Importing another account's backup would pollute this device's
      // op_log with foreign ops and then wedge sync (the server 403s on a
      // user_id mismatch). Reject the whole file rather than replay any.
      if (res.ops.some(op => op.user_id !== userId)) {
        setImportError('This backup is from a different account.')
        e.target.value = ''
        return
      }

      if (!window.confirm(`Import ${res.ops.length} saved changes? They're added to your current data and can't remove anything.`)) {
        e.target.value = ''
        return
      }

      // Apply each op
      for (const op of res.ops) {
        await applyLocalOp(op)
      }

      // Sync to server
      await pushPullOnce({ userId: userId! })

      setImportSuccess(`Imported ${res.ops.length} saved changes.`)
      e.target.value = ''

      // Refresh counts
      const ops = await db.op_log.toArray()
      setOpCount(ops.filter(o => o.user_id === userId).length)
      const money = await db.money_entries.toArray()
      setMoneyCount(money.filter(r => r.user_id === userId && !r.deleted_at).length)
    } catch (err) {
      setImportError(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      e.target.value = ''
    } finally {
      setIsImporting(false)
    }
  }

  if (!userId) {
    return (
      <PageShell title="Data & backup" back={BACK}>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </PageShell>
    )
  }

  return (
    <PageShell title="Data & backup" back={BACK}>
      {/* Export backup (JSON) */}
      <section className="glass flex flex-col gap-2 rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Back up everything</h2>
        <p className="text-xs text-muted-foreground">Download a complete backup of your data as one JSON file ({opCount} saved changes).</p>
        <Button
          onClick={handleExportBackup}
          disabled={isExporting}
          className="w-full"
        >
          {isExporting ? 'Exporting…' : 'Download backup'}
        </Button>
      </section>

      {/* Export money (CSV) */}
      <section className="glass flex flex-col gap-2 rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Export money</h2>
        <p className="text-xs text-muted-foreground">Download your money entries as a CSV spreadsheet ({moneyCount} entries).</p>
        <Button
          variant="outline"
          onClick={handleExportMoney}
          disabled={isExporting}
          className="w-full"
        >
          {isExporting ? 'Exporting…' : 'Download money CSV'}
        </Button>
      </section>

      {/* Import backup */}
      <section className="glass flex flex-col gap-3 rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Restore from a backup</h2>
        <div>
          <label htmlFor="import-file" className="mb-2 block text-xs text-muted-foreground">
            Choose a .json backup file to import
          </label>
          <input
            id="import-file"
            type="file"
            accept=".json,application/json"
            onChange={handleImportFile}
            disabled={isImporting}
            className="w-full text-sm text-muted-foreground file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-white/10 file:px-4 file:text-sm file:font-medium file:text-foreground hover:file:bg-white/15 disabled:opacity-50"
          />
        </div>

        {importError && (
          <p role="alert" className="text-xs text-destructive">{importError}</p>
        )}

        {importSuccess && (
          <p role="status" className="text-xs text-income">{importSuccess}</p>
        )}

        <p className="text-xs text-muted-foreground">
          Importing is safe: it adds to what you already have and never deletes anything.
        </p>
      </section>
    </PageShell>
  )
}
