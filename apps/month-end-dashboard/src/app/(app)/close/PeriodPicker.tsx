'use client'

import { useState } from 'react'
import { createPeriodAction } from './actions'
import { selectPeriodForTasksAction } from './select-period-action'

interface Period {
  id: string
  year: number
  month: number
  status: string
}

interface PeriodPickerProps {
  orgId: string
  periods: Period[]
  activePeriodFromId: string | null
  activePeriodToId: string | null
}

export function PeriodPicker({
  orgId,
  periods,
  activePeriodFromId,
  activePeriodToId,
}: PeriodPickerProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(periods.length === 0)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [error, setError] = useState<string | null>(null)
  const [selectingId, setSelectingId] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setIsCreating(true)
    setError(null)

    try {
      await createPeriodAction(orgId, year, month)
      setShowCreateForm(false)
      setYear(new Date().getFullYear())
      setMonth(new Date().getMonth() + 1)
      window.location.reload()
    } catch (err: any) {
      setError(err.message || 'Failed to create period')
    } finally {
      setIsCreating(false)
    }
  }

  async function handleSelect(periodId: string) {
    setSelectingId(periodId)
    setError(null)

    try {
      await selectPeriodForTasksAction(periodId)
    } catch (err: any) {
      setError(err.message || 'Failed to select period')
      setSelectingId(null)
    }
  }

  function getMonthName(monthNum: number) {
    return new Date(2000, monthNum - 1).toLocaleString('default', { month: 'short' })
  }

  function getStatusLabel(status: string) {
    const labels: Record<string, string> = {
      open: 'Open',
      closed: 'Closed',
      active: 'Active',
    }
    return labels[status] || status
  }

  function getStatusColor(status: string) {
    const colors: Record<string, string> = {
      open: 'bg-blue-100 text-blue-800',
      closed: 'bg-gray-100 text-gray-800',
      active: 'bg-green-100 text-green-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {periods.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-600">No periods found. Create one below.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {periods.map((period) => {
            const isActive = period.id === activePeriodToId
            return (
              <div
                key={period.id}
                className={`flex items-center justify-between rounded-lg border p-3 ${
                  isActive
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div>
                    <div className="font-medium text-gray-900">
                      {getMonthName(period.month)} {period.year}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(
                      period.status
                    )}`}
                  >
                    {getStatusLabel(period.status)}
                  </span>
                  {isActive && (
                    <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
                      Active
                    </span>
                  )}
                </div>
                {!isActive && (
                  <button
                    onClick={() => handleSelect(period.id)}
                    disabled={selectingId === period.id}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                  >
                    {selectingId === period.id ? 'Selecting...' : 'Select'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Create Period Section (Collapsible) */}
      <div className="border-t border-gray-200 pt-4">
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex w-full items-center justify-between text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <span>Add a new period (admin)</span>
          <span className="text-gray-400">{showCreateForm ? '−' : '+'}</span>
        </button>

        {showCreateForm && (
          <form onSubmit={handleCreate} className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
            {error && (
              <div className="mb-3 rounded-md bg-red-50 p-2">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}
            <div className="flex gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Year</label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value))}
                  min="2000"
                  max="2100"
                  required
                  className="mt-1 rounded-md border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Month</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(parseInt(e.target.value))}
                  required
                  className="mt-1 rounded-md border border-gray-300 px-3 py-2"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {new Date(2000, m - 1).toLocaleString('default', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button
                  type="submit"
                  disabled={isCreating}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isCreating ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false)
                    setError(null)
                  }}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
