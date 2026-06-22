'use client'

import { useState } from 'react'
import { exportTbToCsvAction } from './qbo/actions'

interface QboConnectionProps {
  orgId: string
  isConnected: boolean
  realmId: string | null
  hasSnapshot: boolean
  rangeFromDate: string | null
  rangeToDate: string | null
}

type DiscoveryProbe = {
  ok?: boolean
  error?: string
  sample?: Array<Record<string, unknown>>
}

type DiscoveryResponse = {
  probes?: {
    customers?: DiscoveryProbe
    pnlByCustomers?: DiscoveryProbe
    pnlByClasses?: DiscoveryProbe
    pnlByLocations?: DiscoveryProbe
    invoices?: DiscoveryProbe
    bills?: DiscoveryProbe
  }
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unexpected error'
}

export function QboConnection({
  orgId,
  isConnected,
  realmId,
  hasSnapshot,
  rangeFromDate,
  rangeToDate,
}: QboConnectionProps) {
  const [tab, setTab] = useState<'sync' | 'projects'>('sync')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [discovery, setDiscovery] = useState<DiscoveryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleConnect() {
    window.location.href = '/api/qbo/connect'
  }

  async function handleRefresh() {
    if (!rangeFromDate || !rangeToDate) {
      setError('Please select a date range first')
      return
    }

    setIsRefreshing(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/qbo/trial-balance/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orgId,
          fromDate: rangeFromDate,
          toDate: rangeToDate,
        }),
      })

      const result = await response.json()

      if (!response.ok || result.error) {
        setError(result.error || 'Failed to refresh trial balance')
      } else {
        if (result.projectDiscovery?.probes) {
          setDiscovery(result.projectDiscovery)
          setTab('projects')
        }
        const projectLikeCount =
          Number(
            (result.projectDiscovery?.probes?.customers?.sample?.[0] as Record<string, unknown> | undefined)
              ?.projectLikeCount ?? 0
          ) || 0
        setSuccess(
          `Imported ${result.lineCount} TB rows and refreshed project data (${projectLikeCount} project-like customers found)`
        )
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Failed to refresh trial balance')
    } finally {
      setIsRefreshing(false)
    }
  }

  async function handleExport() {
    setIsExporting(true)
    setError(null)

    try {
      const result = await exportTbToCsvAction()

      if (result.error) {
        setError(result.error)
      } else if (result.csv && result.filename) {
        // Download CSV
        const blob = new Blob([result.csv], { type: 'text/csv' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = result.filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
        setSuccess('CSV exported successfully')
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Failed to export CSV')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">QuickBooks Online</h2>

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

      {!isConnected ? (
        <div>
          <p className="text-sm text-gray-600 mb-4">
            Connect your QuickBooks Online account to automatically sync trial balance data.
          </p>
          <button
            onClick={handleConnect}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Connect QuickBooks
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-md bg-green-50 p-3">
            <p className="text-sm text-green-800">
              ✓ Connected to QuickBooks Online
              {realmId && <span className="ml-2">(Realm: {realmId})</span>}
            </p>
          </div>

          <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setTab('sync')}
              className={[
                'px-3 py-1.5 text-sm rounded-full transition-colors',
                tab === 'sync' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
              ].join(' ')}
            >
              Sync
            </button>
            <button
              type="button"
              onClick={() => setTab('projects')}
              className={[
                'px-3 py-1.5 text-sm rounded-full transition-colors',
                tab === 'projects' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
              ].join(' ')}
            >
              Projects
            </button>
          </div>

          {tab === 'sync' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                One click pulls Trial Balance and refreshes project-related QBO coverage.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing || !rangeFromDate || !rangeToDate}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isRefreshing ? 'Refreshing...' : 'Refresh QBO Data'}
                </button>

                {hasSnapshot && (
                  <button
                    onClick={handleExport}
                    disabled={isExporting}
                    className="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                  >
                    {isExporting ? 'Exporting...' : 'Export TB (CSV)'}
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === 'projects' && discovery?.probes && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-2">
              <p className="font-semibold text-slate-900">Project Coverage</p>
              <p>
                Customers probe:{' '}
                {discovery.probes.customers?.ok
                  ? `OK (${discovery.probes.customers?.sample?.[0]?.count ?? 0} total, ${discovery.probes.customers?.sample?.[0]?.projectLikeCount ?? 0} project-like)`
                  : `Failed (${discovery.probes.customers?.error || 'unknown error'})`}
              </p>
              <p>
                P&L by Customers:{' '}
                {discovery.probes.pnlByCustomers?.ok
                  ? `OK (${(discovery.probes.pnlByCustomers?.sample?.[0]?.columns || []).join(', ') || 'no columns'})`
                  : `Failed (${discovery.probes.pnlByCustomers?.error || 'unknown error'})`}
              </p>
              <p>
                P&L by Classes:{' '}
                {discovery.probes.pnlByClasses?.ok ? 'OK' : `Failed (${discovery.probes.pnlByClasses?.error || 'unknown error'})`}
              </p>
              <p>
                P&L by Locations:{' '}
                {discovery.probes.pnlByLocations?.ok ? 'OK' : `Failed (${discovery.probes.pnlByLocations?.error || 'unknown error'})`}
              </p>
              <p>
                Invoices probe:{' '}
                {discovery.probes.invoices?.ok
                  ? `OK (${discovery.probes.invoices?.sample?.[0]?.count ?? 0} rows)`
                  : `Failed (${discovery.probes.invoices?.error || 'unknown error'})`}
              </p>
              <p>
                Bills probe:{' '}
                {discovery.probes.bills?.ok
                  ? `OK (${discovery.probes.bills?.sample?.[0]?.count ?? 0} rows)`
                  : `Failed (${discovery.probes.bills?.error || 'unknown error'})`}
              </p>
            </div>
          )}

          {tab === 'projects' && !discovery?.probes && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              Project data will appear here after running <span className="font-semibold">Refresh QBO Data</span>.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
