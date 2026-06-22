'use client'

import { useState } from 'react'
import { exportReportToCsv, formatCurrency } from './reportUtils'
import { formatDateOnly } from '@/lib/dates/dateOnly'

interface BalanceSheetReportProps {
  period: {
    fromDate: string
    toDate: string
  }
  balanceSheetData?: any // Old format (deprecated - using reportData instead)
  reportData?: {
    success: boolean
    asOfDate: string
    columns: string[]
    rows: Array<{
      key: string
      label: string
      level: number
      indent: number
      isGroup: boolean
      isSubtotal: boolean
      isTotal: boolean
      accountId?: string
      values: Record<string, number | null>
      data?: any
    }>
  } | null
}

export function BalanceSheetReport({ period, balanceSheetData, reportData }: BalanceSheetReportProps) {
  const [isExporting, setIsExporting] = useState(false)

  // Use ONLY new API reportData - no fallback to old snapshot format
  const hasReportData = reportData && reportData.success && reportData.rows && reportData.rows.length > 0

  // Parse new API format: extract assets, liabilities, equity from statement tree rows
  let assets: Array<{ account_name: string; ending: number }> = []
  let liabilities: Array<{ account_name: string; ending: number }> = []
  let equity: Array<{ account_name: string; ending: number }> = []
  let totalAssets = 0
  let totalLiabilities = 0
  let totalEquity = 0
  let totalLiabilitiesAndEquity = 0
  let variance = 0

  if (hasReportData && reportData) {
    // Log section structure for debugging
    const topLevelRows = reportData.rows.filter(r => r.level === 0 || r.level === 1 || r.isGroup)
    console.log("[BS ORDER] top-level rows:", topLevelRows.map(r => ({
      label: r.label,
      level: r.level,
      isGroup: r.isGroup,
      isSubtotal: r.isSubtotal,
      isTotal: r.isTotal,
      path: r.data?.account_path
    })))
    
    // Extract section from path - handle "LIABILITIES AND EQUITY" parent structure
    // Structure: ASSETS (top-level), LIABILITIES AND EQUITY (parent) -> Liabilities, Equity (children)
    const rows = reportData.rows.filter(r => !r.isGroup && !r.isSubtotal && !r.isTotal) // Only leaf accounts
    
    // Collect rows by section
    const assetsRows: Array<{ account_name: string; ending: number }> = []
    const liabilitiesRows: Array<{ account_name: string; ending: number }> = []
    const equityRows: Array<{ account_name: string; ending: number }> = []
    
    for (const row of rows) {
      const path = row.data?.account_path || ''
      // Parse path: "ASSETS / Current Assets / Checking" -> segments determine section
      const pathSegments = path.split(' / ').map(s => s.trim())
      const firstSegment = pathSegments[0]?.toUpperCase() || ''
      const secondSegment = pathSegments[1]?.toUpperCase() || ''
      
      const value = reportData.columns.length > 0 
        ? (row.values[reportData.columns[0]] || 0)
        : (Object.values(row.values)[0] as number || 0)
      
      if (typeof value !== 'number' || value === 0) continue
      
      // Determine section:
      // Structure: ASSETS (top-level), LIABILITIES AND EQUITY (parent) -> Liabilities, Equity (children)
      // Path examples:
      //   "ASSETS / Current Assets / Checking" -> Assets
      //   "LIABILITIES AND EQUITY / Liabilities / Accounts Payable" -> Liabilities
      //   "LIABILITIES AND EQUITY / Equity / Retained Earnings" -> Equity
      
      if (firstSegment.includes('ASSET') && !firstSegment.includes('LIABILIT') && !firstSegment.includes('EQUITY')) {
        // ASSETS section (top-level)
        assetsRows.push({ account_name: row.label, ending: value })
      } else if (firstSegment.includes('LIABILITIES') && firstSegment.includes('EQUITY')) {
        // This is under "LIABILITIES AND EQUITY" parent - check second segment for "Liabilities" or "Equity"
        if (secondSegment.includes('LIABILIT') || secondSegment === 'LIABILITIES') {
          // Under "LIABILITIES AND EQUITY / Liabilities"
          liabilitiesRows.push({ account_name: row.label, ending: value })
        } else if (secondSegment.includes('EQUITY') || secondSegment === 'EQUITY') {
          // Under "LIABILITIES AND EQUITY / Equity"
          equityRows.push({ account_name: row.label, ending: value })
        } else {
          // Fallback: if second segment is missing, try to infer from deeper segments
          const thirdSegment = pathSegments[2]?.toUpperCase() || ''
          if (thirdSegment.includes('LIABILIT')) {
            liabilitiesRows.push({ account_name: row.label, ending: value })
          } else if (thirdSegment.includes('EQUITY')) {
            equityRows.push({ account_name: row.label, ending: value })
          }
        }
      } else if (firstSegment.includes('LIABILIT') && !firstSegment.includes('EQUITY')) {
        // Direct LIABILITIES (not under LIABILITIES AND EQUITY) - fallback case
        liabilitiesRows.push({ account_name: row.label, ending: value })
      } else if (firstSegment.includes('EQUITY') && !firstSegment.includes('LIABILIT')) {
        // Direct EQUITY (not under LIABILITIES AND EQUITY) - fallback case
        equityRows.push({ account_name: row.label, ending: value })
      }
    }
    
    console.log("[BS ORDER] detected sections:", {
      assets: assetsRows.length,
      liabilities: liabilitiesRows.length,
      equity: equityRows.length
    })
    
    // Explicitly set sections in order: Assets, Liabilities, Equity
    assets = assetsRows
    liabilities = liabilitiesRows
    equity = equityRows
    
    // Calculate totals from statement tree totals (look for "Total Assets", "Total Liabilities", etc.)
    for (const row of reportData.rows) {
      const labelUpper = row.label.toUpperCase()
      if (row.isTotal || row.isSubtotal) {
        const value = row.values[reportData.columns[0]] || 0
        if (labelUpper.includes('TOTAL ASSET') && !labelUpper.includes('LIABILIT')) {
          totalAssets = typeof value === 'number' ? value : 0
        } else if (labelUpper.includes('TOTAL LIABILIT')) {
          totalLiabilities = typeof value === 'number' ? value : 0
        } else if (labelUpper.includes('TOTAL EQUITY')) {
          totalEquity = typeof value === 'number' ? value : 0
        } else if (labelUpper.includes('TOTAL LIABILIT') && labelUpper.includes('EQUITY')) {
          totalLiabilitiesAndEquity = typeof value === 'number' ? value : 0
        }
      }
    }
    
    // If totals not found in subtotals, calculate from leaf accounts
    if (totalAssets === 0) {
      totalAssets = assets.reduce((sum, a) => sum + a.ending, 0)
    }
    if (totalLiabilities === 0) {
      totalLiabilities = liabilities.reduce((sum, l) => sum + l.ending, 0)
    }
    if (totalEquity === 0) {
      totalEquity = equity.reduce((sum, e) => sum + e.ending, 0)
    }
    if (totalLiabilitiesAndEquity === 0) {
      totalLiabilitiesAndEquity = totalLiabilities + totalEquity
    }
    
    variance = totalAssets - totalLiabilitiesAndEquity
  }

  // Status: Assets must equal Liabilities + Equity (variance should be 0)
  const status = Math.abs(variance) < 0.01 ? 'clean' : 'out-of-balance'

  // BS Status Badge
  const getStatusBadge = () => {
    if (status === 'clean') {
      return (
        <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
          ✅ Balanced (Assets = Liabilities + Equity)
        </span>
      )
    } else {
      return (
        <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800">
          ❌ Out of Balance (Variance: {formatCurrency(Math.abs(variance))})
        </span>
      )
    }
  }

  async function handleExport() {
    setIsExporting(true)
    try {
      const headers = ['Account', 'Amount']
      const rows: (string | number)[][] = []
      
      rows.push(['ASSETS', ''])
      assets.forEach(line => {
        rows.push([line.account_name, line.ending])
      })
      rows.push(['Total Assets', totalAssets])
      rows.push(['', ''])
      
      rows.push(['LIABILITIES', ''])
      liabilities.forEach(line => {
        rows.push([line.account_name, line.ending])
      })
      rows.push(['Total Liabilities', totalLiabilities])
      rows.push(['', ''])
      
      rows.push(['EQUITY', ''])
      equity.forEach(line => {
        rows.push([line.account_name, line.ending])
      })
      rows.push(['Total Equity', totalEquity])
      rows.push(['', ''])
      rows.push(['Total Liabilities + Total Equity', totalLiabilitiesAndEquity])
      rows.push(['Variance', variance])

      await exportReportToCsv('balance_sheet', headers, rows)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  // If no report data, show loading state (auto-fetch is handled by parent)
  if (!hasReportData) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Balance Sheet</h2>
            <p className="mt-1 text-sm text-gray-600">As of {formatDateOnly(period.toDate)}</p>
          </div>
        </div>

        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
            <p className="mt-4 text-sm text-gray-600">Loading Balance Sheet...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-xs opacity-60">BS_RENDERER: BalanceSheetReport.tsx v2</div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Balance Sheet</h2>
            <p className="mt-1 text-sm text-gray-600">As of {formatDateOnly(period.toDate)}</p>
          </div>
          {getStatusBadge()}
        </div>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {isExporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {/* Debug: Show detected sections */}
      {process.env.NODE_ENV === 'development' && (
        <pre className="text-xs bg-slate-100 p-2 rounded overflow-auto max-h-40">
          {JSON.stringify({
            assetsCount: assets.length,
            liabilitiesCount: liabilities.length,
            equityCount: equity.length,
            sectionLabels: reportData?.rows
              .filter(r => r.isGroup || r.level === 0 || r.level === 1)
              .map(r => ({ label: r.label, level: r.level, path: r.data?.account_path }))
              .slice(0, 20)
          }, null, 2)}
        </pre>
      )}

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Assets */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">ASSETS</h3>
          <div className="space-y-0">
            {assets.map((line) => (
              <div
                key={line.account_name}
                className="flex justify-between border-b border-gray-200 py-1 hover:bg-gray-50"
              >
                <span className="text-sm text-gray-700">{line.account_name}</span>
                <span className="text-sm text-gray-900 text-right">{formatCurrency(line.ending)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t-2 border-gray-400 pt-1 mt-1">
              <span className="font-semibold text-gray-900">Total Assets</span>
              <span className="font-semibold text-gray-900 text-right">{formatCurrency(totalAssets)}</span>
            </div>
          </div>
        </div>

        {/* Liabilities & Equity */}
        <div>
          <div className="space-y-4">
            {/* Liabilities */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">LIABILITIES</h3>
              <div className="space-y-0">
                {liabilities.map((line) => (
                  <div
                    key={line.account_name}
                    className="flex justify-between border-b border-gray-200 py-1 hover:bg-gray-50"
                  >
                    <span className="text-sm text-gray-700">{line.account_name}</span>
                    <span className="text-sm text-gray-900 text-right">{formatCurrency(line.ending)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t-2 border-gray-400 pt-1 mt-1">
                  <span className="font-semibold text-gray-900">Total Liabilities</span>
                  <span className="font-semibold text-gray-900 text-right">{formatCurrency(totalLiabilities)}</span>
                </div>
              </div>
            </div>

            {/* Equity */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">EQUITY</h3>
              <div className="space-y-0">
                {equity.map((line) => (
                  <div
                    key={line.account_name}
                    className="flex justify-between border-b border-gray-200 py-1 hover:bg-gray-50"
                  >
                    <span className="text-sm text-gray-700">{line.account_name}</span>
                    <span className="text-sm text-gray-900 text-right">{formatCurrency(line.ending)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t-2 border-gray-400 pt-1 mt-1">
                  <span className="font-semibold text-gray-900">Total Equity</span>
                  <span className="font-semibold text-gray-900 text-right">{formatCurrency(totalEquity)}</span>
                </div>
              </div>
            </div>

            {/* Total Liabilities + Total Equity (computed as sum) */}
            <div className="flex justify-between border-t-2 border-gray-900 pt-2">
              <span className="font-bold text-gray-900">Total Liabilities + Total Equity</span>
              <span className="font-bold text-gray-900 text-right">{formatCurrency(totalLiabilitiesAndEquity)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Variance Check */}
      {Math.abs(variance) > 0.01 && (
        <div className="mt-6 rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-red-800">Balance Sheet Variance</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>
                  Assets ({formatCurrency(totalAssets)}) ≠ Liabilities + Equity ({formatCurrency(totalLiabilitiesAndEquity)})
                </p>
                <p className="mt-1 font-semibold">Variance: {formatCurrency(variance)}</p>
                <p className="mt-2 text-xs text-red-600">
                  Balance Sheet should balance. Check for P&L accounts incorrectly classified as BS accounts.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
