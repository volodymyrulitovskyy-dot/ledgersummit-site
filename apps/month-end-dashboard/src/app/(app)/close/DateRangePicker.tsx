"use client"

import { useActionState, useState, useTransition } from 'react'
import { applyAndRefreshAction, setLastFullMonthAction } from './date-range-actions'
import { lastFullMonthRange } from '@/lib/dates/monthRanges'
import { runChecksAction } from './exceptions/actions'

interface DateRangePickerProps {
  rangeFromDate: string | null
  rangeToDate: string | null
  orgId: string
  snapshotId: string | null
}

export function DateRangePicker({
  rangeFromDate,
  rangeToDate,
  orgId,
  snapshotId,
}: DateRangePickerProps) {
  const suggestedRange = lastFullMonthRange()
  const [rangeFrom, setRangeFrom] = useState(rangeFromDate || suggestedRange.fromISO)
  const [rangeTo, setRangeTo] = useState(rangeToDate || suggestedRange.toISO)
  const [isSubmittingLastMonth, setIsSubmittingLastMonth] = useState(false)
  const [runPending, startTransition] = useTransition()

  const hasRange = rangeFromDate && rangeToDate
  const needsDefaults = !hasRange

  // Combined apply+refresh action
  const [state, formAction, isPending] = useActionState(applyAndRefreshAction, undefined)

  async function handleUseLastFullMonth(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmittingLastMonth(true)
    await setLastFullMonthAction()
  }

  const runChecks = () => {
    if (!snapshotId) return
    startTransition(async () => {
      await runChecksAction(orgId, snapshotId)
      window.location.reload()
    })
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 text-[1.05rem]">
        <div>
          <label className="text-sm font-semibold text-slate-700">From</label>
          <input
            type="date"
            name="rangeFrom"
            value={rangeFrom}
            onChange={(e) => setRangeFrom(e.target.value)}
            required
            className="mt-1 h-10 w-[180px] rounded-xl border border-slate-200 bg-white px-3 text-[1.05rem]"
            form="apply-refresh-form"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700">To</label>
          <input
            type="date"
            name="rangeTo"
            value={rangeTo}
            onChange={(e) => setRangeTo(e.target.value)}
            required
            className="mt-1 h-10 w-[180px] rounded-xl border border-slate-200 bg-white px-3 text-[1.05rem]"
            form="apply-refresh-form"
          />
        </div>
        <button
          form="apply-refresh-form"
          type="submit"
          disabled={isPending || !rangeFrom || !rangeTo}
          className="h-9 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {isPending ? 'Refreshing…' : 'Refresh (QBO)'}
        </button>
        <button
          type="button"
          disabled={runPending || !snapshotId}
          onClick={runChecks}
          className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {runPending ? 'Running…' : 'Run All Checks'}
        </button>
        {needsDefaults && (
          <button
            type="button"
            onClick={handleUseLastFullMonth}
            disabled={isSubmittingLastMonth}
            className="h-9 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            {isSubmittingLastMonth ? 'Applying…' : 'Use last full month'}
          </button>
        )}
      </div>

      {state?.error && (
        <div className="mt-3 rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-800">{state.error}</p>
        </div>
      )}

      <form id="apply-refresh-form" action={formAction} className="hidden">
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="rangeFrom" value={rangeFrom} />
        <input type="hidden" name="rangeTo" value={rangeTo} />
      </form>
    </div>
  )
}
