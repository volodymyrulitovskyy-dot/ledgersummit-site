"use client"

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { runChecksAction } from './exceptions/actions'

export function ActionBar({
  orgId,
  snapshotId,
}: {
  orgId: string
  snapshotId: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const canRun = !!snapshotId

  const runChecks = () => {
    if (!snapshotId) return
    startTransition(async () => {
      await runChecksAction(orgId, snapshotId)
      router.refresh()
    })
  }

  const exportExceptions = () => {
    if (!snapshotId) return
    const url = `/api/exceptions/export?org_id=${orgId}&snapshot_id=${snapshotId}&format=xlsx`
    window.open(url, '_blank')
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={runChecks}
        disabled={isPending || !canRun}
        className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-all"
      >
        {isPending ? 'Running…' : 'Run All Checks'}
      </button>
      <button
        onClick={exportExceptions}
        disabled={!canRun}
        className="h-10 rounded-xl bg-white border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-all"
      >
        Export to Excel
      </button>
    </div>
  )
}
