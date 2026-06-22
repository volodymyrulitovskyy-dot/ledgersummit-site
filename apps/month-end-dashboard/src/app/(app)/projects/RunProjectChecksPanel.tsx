'use client'

import { useState, useTransition } from 'react'
import { runProjectChecksOnlyAction } from '@/app/(app)/close/exceptions/actions'

export function RunProjectChecksPanel({ orgId, snapshotId }: { orgId: string; snapshotId: string | null }) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  const run = () => {
    if (!snapshotId) return
    startTransition(async () => {
      const result = await runProjectChecksOnlyAction(orgId, snapshotId)
      if ((result as { error?: string }).error) {
        setMessage((result as { error?: string }).error || 'Run failed')
        return
      }
      const stats = result as {
        rulesEvaluated: number
        customersCurrent: number
        priorSnapshotFound: boolean
        customersWithBaseline: number
        skippedNoBaseline: number
        exceptionsCreated: number
        exceptionsUpdated: number
      }
      setMessage(
        `Run complete: rulesEvaluated=${stats.rulesEvaluated}, customersCurrent=${stats.customersCurrent}, priorSnapshotFound=${stats.priorSnapshotFound}, customersWithBaseline=${stats.customersWithBaseline}, skippedNoBaseline=${stats.skippedNoBaseline}, exceptionsCreated=${stats.exceptionsCreated}, exceptionsUpdated=${stats.exceptionsUpdated}`
      )
      setTimeout(() => {
        window.location.reload()
      }, 1200)
    })
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={isPending || !snapshotId}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {isPending ? 'Running…' : 'Run Project Checks'}
        </button>
      </div>
      {message && <p className="text-xs text-slate-600">{message}</p>}
    </div>
  )
}
