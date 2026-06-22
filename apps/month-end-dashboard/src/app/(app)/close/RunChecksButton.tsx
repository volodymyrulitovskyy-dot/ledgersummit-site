'use client'

import { useState } from 'react'
import { runChecksAction } from './exceptions/actions'

interface RunChecksButtonProps {
  orgId: string
  snapshotId: string
}

export function RunChecksButton({ orgId, snapshotId }: RunChecksButtonProps) {
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleRunChecks() {
    setIsRunning(true)
    setError(null)
    setSuccess(null)

    try {
      const result = await runChecksAction(orgId, snapshotId)

      if (result.error) {
        setError(result.error)
      } else {
        setSuccess(`Successfully created ${result.created || 0} exception(s)`)
        // Reload after a short delay to show success message
        setTimeout(() => {
          window.location.reload()
        }, 1500)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to run checks')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Run Validation Checks</h2>
      <p className="text-sm text-gray-600 mb-4">
        Evaluate all enabled rules against the trial balance snapshot to generate exceptions.
      </p>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-md bg-green-50 p-3">
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}

      <button
        onClick={handleRunChecks}
        disabled={isRunning}
        className="rounded-md bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isRunning ? 'Running Checks...' : 'Run All Checks'}
      </button>
    </div>
  )
}
