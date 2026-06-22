import { formatDateOnly } from '@/lib/dates/dateOnly'

interface Org {
  id: string
  name: string
}

interface DashboardShellProps {
  org: Org
  rangeFromDate: string | null
  rangeToDate: string | null
  exceptionsCount: number
  criticalOpenCount: number
  awaitingExplanationCount: number
}

export function DashboardShell({
  org,
  rangeFromDate,
  rangeToDate,
  exceptionsCount,
  criticalOpenCount,
  awaitingExplanationCount,
}: DashboardShellProps) {
  // Show dashboard if range is set
  if (!rangeFromDate || !rangeToDate) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-blue-400"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">No date range selected</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>Select a date range above to view close status and exceptions.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Date Range */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Close Dashboard — {formatDateOnly(rangeFromDate)} to {formatDateOnly(rangeToDate)}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Organization: <span className="font-medium">{org.name}</span>
            </p>
          </div>
          {rangeFromDate && rangeToDate && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
                Analytics Range: {formatDateOnly(rangeFromDate)} to {formatDateOnly(rangeToDate)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="text-sm font-medium text-gray-500">Exceptions</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">{exceptionsCount}</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="text-sm font-medium text-gray-500">Critical Open</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">{criticalOpenCount}</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="text-sm font-medium text-gray-500">Awaiting Explanation</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">{awaitingExplanationCount}</p>
        </div>
      </div>
    </div>
  )
}
