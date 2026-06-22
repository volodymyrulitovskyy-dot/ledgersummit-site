"use client";

import { useState } from 'react'
import { exportReportToCsv, formatCurrency } from './reportUtils'
import type { FinancialStatements } from '@/lib/reports/financialStatements'
import { AccountDetailDrawer } from './AccountDetailDrawer'
import { formatDateOnly } from '@/lib/dates/dateOnly'

interface TrialBalanceReportProps {
  trialBalance: FinancialStatements['trialBalance']
  period: {
    fromDate: string
    toDate: string
  }
  rollForward?: {
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

export function TrialBalanceReport({ trialBalance, period, rollForward }: TrialBalanceReportProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<{
    id: string
    account_name: string
    account_number: string | null
    account_type: string | null
    category: string
    debit: number | null
    credit: number | null
    balance: number
  } | null>(null)

  const { lines: tbLines, totalDebit, totalCredit, totalNet } = trialBalance
  
  // Use roll-forward if available, otherwise fall back to traditional TB view
  const useRollForward = rollForward && rollForward.endSnapshot

  async function handleExport() {
    setIsExporting(true)
    try {
      if (useRollForward && rollForward) {
        const headers = ['Account Name', 'Account Number', 'Beginning', 'Activity', 'Ending']
        const rows = rollForward.rollForwardLines.map(line => [
          line.account_name,
          line.account_number || '',
          line.beginning.toString(),
          line.activity.toString(),
          line.ending.toString(),
        ])
        
        // Add totals row
        rows.push([
          'TOTAL',
          '',
          rollForward.totalBeginning.toString(),
          rollForward.totalActivity.toString(),
          rollForward.totalEnding.toString(),
        ])

        await exportReportToCsv('trial_balance_rollforward', headers, rows)
      } else {
        const headers = ['Account Name', 'Account Number', 'Debit', 'Credit', 'Net']
        const rows = tbLines.map(line => [
          line.account_name,
          line.account_number || '',
          Number(line.debit || 0).toString(),
          Number(line.credit || 0).toString(),
          Number(line.balance || 0).toString(),
        ])
        
        // Add totals row (separate from account rows)
        rows.push(['TOTAL', '', totalDebit.toString(), totalCredit.toString(), totalNet.toString()])

        await exportReportToCsv('trial_balance', headers, rows)
      }
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Trial Balance (Roll-Forward)</h2>
          {useRollForward && (
            <p className="mt-1 text-sm text-gray-600">
              Beginning: {formatDateOnly(rollForward.beginSnapshot?.as_of_date || period.fromDate)} • 
              Ending: {formatDateOnly(rollForward.endSnapshot?.as_of_date || period.toDate)}
            </p>
          )}
        </div>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {isExporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {useRollForward ? (
        // Roll-Forward View (Beginning | Activity | Ending)
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Account Name
                </th>
                <th className="px-6 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Account Number
                </th>
                <th className="px-6 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Beginning
                </th>
                <th className="px-6 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Activity
                </th>
                <th className="px-6 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Ending
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {rollForward.rollForwardLines.map((line, idx) => (
                <tr key={`${line.account_name}-${idx}`} className="hover:bg-gray-50 cursor-pointer">
                  <td
                    className="whitespace-nowrap px-6 py-1 text-sm text-gray-900"
                    onClick={() => {
                      // Find original TB line for drawer
                      const originalLine = tbLines.find((l) => l.account_name === line.account_name) || {
                        id: `rf-${idx}`,
                        account_name: line.account_name,
                        account_number: line.account_number,
                        account_type: null,
                        category: line.category as any,
                        debit: null,
                        credit: null,
                        balance: line.ending,
                      }
                      setSelectedAccount(originalLine)
                    }}
                  >
                    <span className="hover:text-blue-600 hover:underline">
                      {line.account_name}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-1 text-sm text-gray-500">
                    {line.account_number || '—'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-1 text-sm text-right text-gray-900">
                    {formatCurrency(line.beginning)}
                  </td>
                  <td className={`whitespace-nowrap px-6 py-1 text-sm text-right ${line.activity >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {line.activity >= 0 ? '+' : ''}{formatCurrency(line.activity)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-1 text-sm text-right text-gray-900">
                    {formatCurrency(line.ending)}
                  </td>
                </tr>
              ))}
              {/* Totals Row */}
              <tr className="bg-gray-50 font-semibold border-t-2 border-gray-400">
                <td colSpan={2} className="px-6 py-2 text-sm text-gray-900">
                  TOTAL
                </td>
                <td className="whitespace-nowrap px-6 py-2 text-sm text-right text-gray-900">
                  {formatCurrency(rollForward.totalBeginning)}
                </td>
                <td className="whitespace-nowrap px-6 py-2 text-sm text-right text-gray-900">
                  {formatCurrency(rollForward.totalActivity)}
                </td>
                <td className="whitespace-nowrap px-6 py-2 text-sm text-right text-gray-900">
                  {formatCurrency(rollForward.totalEnding)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        // Traditional TB View (Debit | Credit | Net)
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Account Name
                </th>
                <th className="px-6 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Account Number
                </th>
                <th className="px-6 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Debit
                </th>
                <th className="px-6 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Credit
                </th>
                <th className="px-6 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Net
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {tbLines.map((line) => (
                <tr key={line.id} className="hover:bg-gray-50 cursor-pointer">
                  <td
                    className="whitespace-nowrap px-6 py-1 text-sm text-gray-900"
                    onClick={() => setSelectedAccount(line)}
                  >
                    <span className="hover:text-blue-600 hover:underline">
                      {line.account_name}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-1 text-sm text-gray-500">
                    {line.account_number || '—'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-1 text-sm text-right text-gray-900">
                    {line.debit ? Number(line.debit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-1 text-sm text-right text-gray-900">
                    {line.credit ? Number(line.credit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-6 py-1 text-sm text-right text-gray-900">
                    {formatCurrency(Number(line.balance))}
                  </td>
                </tr>
              ))}
              {/* Totals Row */}
              <tr className="bg-gray-50 font-semibold border-t-2 border-gray-400">
                <td colSpan={2} className="px-6 py-2 text-sm text-gray-900">
                  TOTAL
                </td>
                <td className="whitespace-nowrap px-6 py-2 text-sm text-right text-gray-900">
                  {Number(totalDebit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="whitespace-nowrap px-6 py-2 text-sm text-right text-gray-900">
                  {Number(totalCredit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="whitespace-nowrap px-6 py-2 text-sm text-right text-gray-900">
                  {formatCurrency(Number(totalNet))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Account Detail Drawer */}
      {selectedAccount && (
        <AccountDetailDrawer
          isOpen={!!selectedAccount}
          onClose={() => setSelectedAccount(null)}
          account={{
            ...selectedAccount,
            category: selectedAccount.category as any,
            reportType: 'TB',
          }}
          period={period}
        />
      )}
    </div>
  )
}

