'use client'

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import { TrialBalanceReport } from './TrialBalanceReport'
import { BalanceSheetReport } from './BalanceSheetReport'
import { ProfitLossReport } from './ProfitLossReport'
import { CashFlowReport } from './CashFlowReport'
import { ReconciliationPanel } from './ReconciliationPanel'
import type { FinancialStatements } from '@/lib/reports/financialStatements'

interface ReportsTabsProps {
  orgId: string
  rangeFromDate: string
  rangeToDate: string
  statements: FinancialStatements
  balanceSheetData?: {
    snapshot: { as_of_date: string; lines: Array<{ account_name: string; amount: number; section: string }> } | null
    lines: Array<{
      section: 'ASSET' | 'LIABILITY' | 'EQUITY'
      account_name: string
      ending: number
    }>
    totals: {
      assets: Array<{ section: 'ASSET'; account_name: string; ending: number }>
      liabilities: Array<{ section: 'LIABILITY'; account_name: string; ending: number }>
      equity: Array<{ section: 'EQUITY'; account_name: string; ending: number }>
      totalAssets: number
      totalLiabilities: number
      totalEquity: number
      totalLiabilitiesAndEquity: number
      variance: number
    }
  }
  trialBalanceRollForward?: {
    beginSnapshot: { as_of_date: string; lines: Array<{ account_name: string; account_number: string | null; balance: number; category: string }> } | null
    endSnapshot: { as_of_date: string; lines: Array<{ account_name: string; account_number: string | null; balance: number; category: string }> } | null
    rollForwardLines: Array<{
      account_name: string
      account_number: string | null
      beginning: number
      activity: number
      ending: number
      category: string
    }>
    totalBeginning: number
    totalActivity: number
    totalEnding: number
  }
}

type TabId = 'trial-balance' | 'balance-sheet' | 'profit-loss' | 'cash-flow'

// Memoized report components to avoid re-renders when props haven't changed
const MemoTrialBalance = memo(TrialBalanceReport)
const MemoBalanceSheet = memo(BalanceSheetReport)
const MemoProfitLoss = memo(ProfitLossReport)
const MemoCashFlow = memo(CashFlowReport)

export function ReportsTabs({
  orgId,
  rangeFromDate,
  rangeToDate,
  statements,
  balanceSheetData,
  trialBalanceRollForward,
}: ReportsTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('trial-balance')
  const [loadingTab, setLoadingTab] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [reportDataMap, setReportDataMap] = useState<Record<string, any>>({})

  // Track which tabs have been visited (for keep-alive)
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(new Set(['trial-balance']))

  // Client-side data cache: Map<cacheKey, data>
  // Keyed by tabId|orgId|fromDate|toDate so cache invalidates on period/org change
  const dataCacheRef = useRef<Map<string, any>>(new Map())




  // Single consolidated effect: handles both tab switches and org/period changes
  // Uses a ref to track previous params and only clear cache when they actually change
  const prevParamsRef = useRef({ orgId, rangeFromDate, rangeToDate })

  useEffect(() => {
    const paramsChanged =
      prevParamsRef.current.orgId !== orgId ||
      prevParamsRef.current.rangeFromDate !== rangeFromDate ||
      prevParamsRef.current.rangeToDate !== rangeToDate

    if (paramsChanged) {
      // Params changed → invalidate cache
      dataCacheRef.current.clear()
      setReportDataMap({})
      prevParamsRef.current = { orgId, rangeFromDate, rangeToDate }
    }

    // Mark tab visited
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev
      return new Set([...prev, activeTab])
    })

    // Build cache key inline (avoid dependency on makeCacheKey)
    const cacheKey = `${activeTab}|${orgId}|${rangeFromDate}|${rangeToDate}`

    // Cache hit → skip fetch
    if (dataCacheRef.current.has(cacheKey)) {
      const cached = dataCacheRef.current.get(cacheKey)
      setReportDataMap((prev) => ({ ...prev, [activeTab]: cached }))
      if (process.env.NODE_ENV === 'development') {
        console.log(`[PERF] tab-switch "${activeTab}" → cache HIT (0ms)`)
      }
      return
    }

    // Cache miss → fetch
    let cancelled = false
    const t0 = performance.now()
    setLoadingTab(activeTab)
    setAuthError(null)

    const tabId = activeTab
    let endpoint = ''
    let body: any = {}

    if (tabId === 'balance-sheet') {
      endpoint = '/api/qbo/reports/balance-sheet'
      body = { orgId, asOfDate: rangeToDate }
    } else {
      endpoint = `/api/qbo/reports/${tabId}`
      body = { orgId, fromDate: rangeFromDate, toDate: rangeToDate }
    }

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
      .then(async (response) => {
        if (cancelled) return
        if (!response.ok) {
          if (response.status === 401) {
            setAuthError('Session expired — please refresh')
          } else {
            const error = await response.json()
            console.error(`Failed to fetch ${tabId} data:`, error)
          }
          setLoadingTab(null)
          return
        }

        const data = await response.json()
        if (cancelled) return

        dataCacheRef.current.set(cacheKey, data)
        setReportDataMap((prev) => ({ ...prev, [tabId]: data }))

        const elapsed = (performance.now() - t0).toFixed(0)
        if (process.env.NODE_ENV === 'development') {
          console.log(`[PERF] tab-switch "${tabId}" → cache MISS (${elapsed}ms fetch)`)
        }
        setLoadingTab(null)
      })
      .catch((err) => {
        if (cancelled) return
        console.error(`Error fetching ${tabId} data:`, err)
        setLoadingTab(null)
      })

    return () => { cancelled = true }
  }, [activeTab, orgId, rangeFromDate, rangeToDate])

  // Memoize BS reconciliation computation
  const bsReconciliation = useMemo(() => {
    const data = reportDataMap['balance-sheet']
    if (!data?.success || !data?.rows) return null

    const rows = data.rows || []
    const columnKey = data.columns?.[0] || 'Total'

    let totalAssets = 0
    let totalLiabilities = 0
    let totalEquity = 0

    for (const row of rows) {
      const labelUpper = row.label.toUpperCase()
      const value = row.values?.[columnKey]
      if (typeof value !== 'number') continue

      if (row.isTotal || row.isSubtotal) {
        if (labelUpper.includes('TOTAL ASSET') && !labelUpper.includes('LIABILIT')) {
          totalAssets = value
        } else if (labelUpper.includes('TOTAL LIABILIT') && !labelUpper.includes('EQUITY')) {
          totalLiabilities = value
        } else if (labelUpper.includes('TOTAL EQUITY')) {
          totalEquity = value
        }
      }
    }

    if (totalAssets === 0 || totalLiabilities === 0 || totalEquity === 0) {
      for (const row of rows) {
        if (row.isGroup || row.isSubtotal || row.isTotal) continue
        const path = row.data?.account_path || ''
        const pathUpper = path.toUpperCase()
        const value = row.values?.[columnKey] || 0
        if (typeof value !== 'number' || value === 0) continue

        if (pathUpper.includes('ASSET') && !pathUpper.includes('LIABILIT') && !pathUpper.includes('EQUITY')) {
          totalAssets += Math.abs(value)
        } else if (pathUpper.includes('LIABILIT')) {
          totalLiabilities += Math.abs(value)
        } else if (pathUpper.includes('EQUITY')) {
          totalEquity += Math.abs(value)
        }
      }
    }

    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity
    const variance = totalAssets - totalLiabilitiesAndEquity
    const allPassed = Math.abs(variance) < 0.01

    return { totalAssets, totalLiabilities, totalEquity, variance, allPassed }
  }, [reportDataMap])

  const tabs = [
    { id: 'trial-balance' as TabId, label: 'Trial Balance (Roll-Forward)' },
    { id: 'balance-sheet' as TabId, label: 'Balance Sheet' },
    { id: 'profit-loss' as TabId, label: 'Profit & Loss' },
    { id: 'cash-flow' as TabId, label: 'Cash Flow' },
  ]

  return (
    <div className="space-y-6">
      {/* Reconciliation Panel */}
      {(() => {
        if (activeTab === 'balance-sheet' && bsReconciliation && !bsReconciliation.allPassed) {
          return (
            <ReconciliationPanel
              reconciliation={{
                checks: [
                  {
                    check: 'Balance Sheet',
                    passed: bsReconciliation.allPassed,
                    variance: bsReconciliation.variance,
                    message: bsReconciliation.allPassed
                      ? 'Balance Sheet balances (Assets = Liabilities + Equity)'
                      : `Balance Sheet does not balance: Assets (${bsReconciliation.totalAssets.toFixed(2)}) ≠ Liabilities + Equity (${(bsReconciliation.totalLiabilities + bsReconciliation.totalEquity).toFixed(2)})`,
                  },
                ],
                allPassed: bsReconciliation.allPassed,
              }}
            />
          )
        }
        if (statements && !statements.reconciliation.allPassed) {
          const filteredChecks = statements.reconciliation.checks.filter(
            (check) => check.check !== 'Balance Sheet'
          )
          if (filteredChecks.some((c) => !c.passed)) {
            return (
              <ReconciliationPanel
                reconciliation={{
                  checks: filteredChecks,
                  allPassed: filteredChecks.every((c) => c.passed),
                }}
              />
            )
          }
        }
        return null
      })()}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium
                ${activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Auth Error */}
      {authError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-800">{authError}</p>
            <button
              onClick={() => {
                setAuthError(null)
                window.location.reload()
              }}
              className="text-sm font-medium text-red-600 hover:text-red-800"
            >
              Refresh Page
            </button>
          </div>
        </div>
      )}

      {/* Tab Content — Keep-Alive: visited tabs stay mounted, hidden with CSS */}
      <div className="rounded-lg bg-white p-6 shadow">
        {/* Trial Balance — always visited (default tab), no fetch needed */}
        <div style={{ display: activeTab === 'trial-balance' ? 'block' : 'none' }}>
          {statements && (
            <MemoTrialBalance
              trialBalance={statements.trialBalance}
              period={{ fromDate: rangeFromDate, toDate: rangeToDate }}
              rollForward={trialBalanceRollForward}
            />
          )}
        </div>

        {/* Balance Sheet — mount after first visit */}
        {visitedTabs.has('balance-sheet') && (
          <div style={{ display: activeTab === 'balance-sheet' ? 'block' : 'none' }}>
            {loadingTab === 'balance-sheet' ? (
              <TabLoading label="Loading Balance Sheet..." />
            ) : (
              <MemoBalanceSheet
                period={{ fromDate: rangeFromDate, toDate: rangeToDate }}
                balanceSheetData={balanceSheetData}
                reportData={reportDataMap['balance-sheet'] ?? null}
              />
            )}
          </div>
        )}

        {/* Profit & Loss — mount after first visit */}
        {visitedTabs.has('profit-loss') && (
          <div style={{ display: activeTab === 'profit-loss' ? 'block' : 'none' }}>
            {loadingTab === 'profit-loss' ? (
              <TabLoading label="Loading Profit & Loss..." />
            ) : statements ? (
              <MemoProfitLoss
                profitAndLoss={statements.profitAndLoss}
                period={{ fromDate: rangeFromDate, toDate: rangeToDate }}
                trialBalanceLines={statements.trialBalance.lines}
              />
            ) : null}
          </div>
        )}

        {/* Cash Flow — mount after first visit */}
        {visitedTabs.has('cash-flow') && (
          <div style={{ display: activeTab === 'cash-flow' ? 'block' : 'none' }}>
            {loadingTab === 'cash-flow' ? (
              <TabLoading label="Loading Cash Flow..." />
            ) : statements ? (
              <MemoCashFlow
                cashFlow={statements.cashFlow}
                rangeFromDate={rangeFromDate}
                rangeToDate={rangeToDate}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

function TabLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent" />
        <p className="mt-4 text-sm text-gray-600">{label}</p>
      </div>
    </div>
  )
}

