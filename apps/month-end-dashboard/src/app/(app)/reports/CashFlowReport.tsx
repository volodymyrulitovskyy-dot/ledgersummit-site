'use client'

import { useState } from 'react'
import { formatCurrency, exportReportToCsv } from './reportUtils'
import type { FinancialStatements } from '@/lib/reports/financialStatements'

interface CashFlowReportProps {
  cashFlow: FinancialStatements['cashFlow']
  rangeFromDate: string
  rangeToDate: string
}

export function CashFlowReport({
  cashFlow,
  rangeFromDate,
  rangeToDate,
}: CashFlowReportProps) {
  const [isExporting, setIsExporting] = useState(false)

  const {
    netIncome,
    depreciation,
    workingCapitalChanges,
    cashFromOperations,
    cashFromInvesting,
    cashFromFinancing,
    netCashChange,
    beginningCash,
    endingCash,
    hasPriorSnapshot,
  } = cashFlow

  async function handleExport() {
    setIsExporting(true)
    try {
      const headers = ['Item', 'Amount']
      const rows: (string | number)[][] = []
      
      rows.push(['CASH FLOW FROM OPERATING ACTIVITIES', ''])
      rows.push(['Net Income', netIncome])
      if (depreciation > 0) {
        rows.push(['Depreciation', depreciation])
      }
      if (hasPriorSnapshot) {
        rows.push(['Changes in Working Capital', ''])
        if (workingCapitalChanges.arDelta !== 0) {
          rows.push(['Accounts Receivable', -workingCapitalChanges.arDelta])
        }
        if (workingCapitalChanges.apDelta !== 0) {
          rows.push(['Accounts Payable', workingCapitalChanges.apDelta])
        }
        if (workingCapitalChanges.inventoryDelta !== 0) {
          rows.push(['Inventory', -workingCapitalChanges.inventoryDelta])
        }
        rows.push(['Total Working Capital Changes', workingCapitalChanges.total])
      } else {
        rows.push(['Changes in Working Capital', 'N/A (no prior period)'])
      }
      rows.push(['Cash from Operations', cashFromOperations])
      rows.push(['', ''])
      
      rows.push(['CASH FLOW FROM INVESTING ACTIVITIES', ''])
      rows.push(['(Not available from TB data)', 'N/A'])
      rows.push(['Cash from Investing', cashFromInvesting])
      rows.push(['', ''])
      
      rows.push(['CASH FLOW FROM FINANCING ACTIVITIES', ''])
      rows.push(['(Not available from TB data)', 'N/A'])
      rows.push(['Cash from Financing', cashFromFinancing])
      rows.push(['', ''])
      
      rows.push(['Net Change in Cash', netCashChange])
      rows.push(['Beginning Cash', beginningCash])
      rows.push(['Ending Cash', endingCash])

      await exportReportToCsv('cash_flow', headers, rows)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Statement of Cash Flows</h2>
          <p className="mt-1 text-sm text-gray-600">
            Cash Flow (Indirect – Simplified)
            {!hasPriorSnapshot && ' • No prior period for comparison'}
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {isExporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      <div className="space-y-4">
        {/* Operating Activities */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            CASH FLOW FROM OPERATING ACTIVITIES
          </h3>
          <div className="space-y-0">
            <div className="flex justify-between border-b border-gray-200 py-1">
              <span className="text-sm text-gray-700">Net Income</span>
              <span className="text-sm text-gray-900 text-right">{formatCurrency(netIncome)}</span>
            </div>

            {depreciation > 0 && (
              <div className="flex justify-between border-b border-gray-200 py-1">
                <span className="text-sm text-gray-700">Depreciation</span>
                <span className="text-sm text-gray-900 text-right">{formatCurrency(depreciation)}</span>
              </div>
            )}

            {hasPriorSnapshot ? (
              <>
                <div className="mt-2">
                  <div className="text-sm font-medium text-gray-700 mb-1">Changes in Working Capital:</div>
                  {workingCapitalChanges.arDelta !== 0 && (
                    <div className="flex justify-between border-b border-gray-200 py-1 ml-4">
                      <span className="text-sm text-gray-600">Accounts Receivable</span>
                      <span className="text-sm text-gray-900 text-right">{formatCurrency(-workingCapitalChanges.arDelta)}</span>
                    </div>
                  )}
                  {workingCapitalChanges.apDelta !== 0 && (
                    <div className="flex justify-between border-b border-gray-200 py-1 ml-4">
                      <span className="text-sm text-gray-600">Accounts Payable</span>
                      <span className="text-sm text-gray-900 text-right">{formatCurrency(workingCapitalChanges.apDelta)}</span>
                    </div>
                  )}
                  {workingCapitalChanges.inventoryDelta !== 0 && (
                    <div className="flex justify-between border-b border-gray-200 py-1 ml-4">
                      <span className="text-sm text-gray-600">Inventory</span>
                      <span className="text-sm text-gray-900 text-right">{formatCurrency(-workingCapitalChanges.inventoryDelta)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t-2 border-gray-400 pt-1 mt-1">
                    <span className="text-sm font-semibold text-gray-700">Total Working Capital Changes</span>
                    <span className="text-sm font-semibold text-gray-900 text-right">{formatCurrency(workingCapitalChanges.total)}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex justify-between border-b border-gray-200 py-1">
                <span className="text-sm text-gray-500 italic">Changes in Working Capital</span>
                <span className="text-sm text-gray-500 italic text-right">N/A (no prior period)</span>
              </div>
            )}

            <div className="flex justify-between border-t-2 border-gray-900 pt-1 mt-1">
              <span className="font-semibold text-gray-900">Cash from Operations</span>
              <span className="font-semibold text-gray-900 text-right">{formatCurrency(cashFromOperations)}</span>
            </div>
          </div>
        </div>

        {/* Investing Activities */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            CASH FLOW FROM INVESTING ACTIVITIES
          </h3>
          <div className="space-y-0">
            <div className="flex justify-between border-b border-gray-200 py-1">
              <span className="text-sm text-gray-500 italic">(Not available from TB data)</span>
              <span className="text-sm text-gray-500 italic text-right">N/A</span>
            </div>
            <div className="flex justify-between border-t-2 border-gray-400 pt-1 mt-1">
              <span className="font-semibold text-gray-900">Cash from Investing</span>
              <span className="font-semibold text-gray-900 text-right">{formatCurrency(cashFromInvesting)}</span>
            </div>
          </div>
        </div>

        {/* Financing Activities */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            CASH FLOW FROM FINANCING ACTIVITIES
          </h3>
          <div className="space-y-0">
            <div className="flex justify-between border-b border-gray-200 py-1">
              <span className="text-sm text-gray-500 italic">(Not available from TB data)</span>
              <span className="text-sm text-gray-500 italic text-right">N/A</span>
            </div>
            <div className="flex justify-between border-t-2 border-gray-400 pt-1 mt-1">
              <span className="font-semibold text-gray-900">Cash from Financing</span>
              <span className="font-semibold text-gray-900 text-right">{formatCurrency(cashFromFinancing)}</span>
            </div>
          </div>
        </div>

        {/* Net Change and Ending Cash */}
        <div className="space-y-0 border-t-4 border-gray-900 pt-2">
          <div className="flex justify-between py-1">
            <span className="font-semibold text-gray-900">Net Change in Cash</span>
            <span className="font-semibold text-gray-900 text-right">{formatCurrency(netCashChange)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-gray-400 pt-1">
            <span className="font-medium text-gray-700">Beginning Cash</span>
            <span className="font-medium text-gray-700 text-right">{formatCurrency(beginningCash)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-gray-900 pt-1">
            <span className="font-bold text-lg text-gray-900">Ending Cash</span>
            <span className="font-bold text-lg text-gray-900 text-right">{formatCurrency(endingCash)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
