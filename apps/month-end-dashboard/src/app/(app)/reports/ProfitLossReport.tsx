"use client";

import { useState } from 'react'
import { exportReportToCsv, formatCurrency } from './reportUtils'
import type { FinancialStatements } from '@/lib/reports/financialStatements'
import { AccountDetailDrawer } from './AccountDetailDrawer'
import type { NormalizedLine } from '@/lib/reports/normalize'

interface ProfitLossReportProps {
  profitAndLoss: FinancialStatements['profitAndLoss']
  period: {
    fromDate: string
    toDate: string
  }
  trialBalanceLines?: FinancialStatements['trialBalance']['lines']
}

export function ProfitLossReport({ profitAndLoss, period, trialBalanceLines }: ProfitLossReportProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<NormalizedLine | null>(null)

  const {
    revenue,
    cogs,
    operatingExpenses,
    otherIncome,
    otherExpense,
    totalRevenue,
    totalCogs,
    grossProfit,
    totalOperatingExpenses,
    operatingIncome,
    totalOtherIncome,
    totalOtherExpense,
    netIncome,
  } = profitAndLoss

  async function handleExport() {
    setIsExporting(true)
    try {
      const headers = ['Account', 'Amount']
      const rows: (string | number)[][] = []
      
      rows.push(['REVENUE', ''])
      revenue.forEach(line => {
        rows.push([line.account_name, line.normalized_balance])
      })
      rows.push(['Total Revenue', totalRevenue])
      rows.push(['', ''])
      
      rows.push(['COST OF GOODS SOLD', ''])
      cogs.forEach(line => {
        rows.push([line.account_name, line.normalized_balance])
      })
      rows.push(['Total COGS', totalCogs])
      rows.push(['Gross Profit', grossProfit])
      rows.push(['', ''])
      
      rows.push(['OPERATING EXPENSES', ''])
      operatingExpenses.forEach(line => {
        rows.push([line.account_name, line.normalized_balance])
      })
      rows.push(['Total Operating Expenses', totalOperatingExpenses])
      rows.push(['Operating Income', operatingIncome])
      rows.push(['', ''])
      
      if (otherIncome.length > 0 || otherExpense.length > 0) {
        rows.push(['OTHER INCOME', ''])
        otherIncome.forEach(line => {
          rows.push([line.account_name, line.normalized_balance])
        })
        rows.push(['Total Other Income', totalOtherIncome])
        rows.push(['', ''])
        
        rows.push(['OTHER EXPENSES', ''])
        otherExpense.forEach(line => {
          rows.push([line.account_name, line.normalized_balance])
        })
        rows.push(['Total Other Expenses', totalOtherExpense])
        rows.push(['', ''])
      }
      
      rows.push(['NET INCOME', netIncome])

      await exportReportToCsv('profit_loss', headers, rows)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Profit & Loss Statement</h2>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {isExporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      <div className="space-y-4">
        {/* Revenue */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">REVENUE</h3>
          <div className="space-y-0">
            {revenue.map((line) => (
              <div
                key={line.account_name}
                className="flex justify-between border-b border-gray-200 py-1 hover:bg-gray-50 cursor-pointer"
                onClick={() => setSelectedAccount(line)}
              >
                <span className="text-sm text-gray-700 hover:text-blue-600 hover:underline">
                  {line.account_name}
                </span>
                <span className="text-sm text-gray-900 text-right">
                  {formatCurrency(line.normalized_balance)}
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t-2 border-gray-400 pt-1 mt-1">
              <span className="font-semibold text-gray-900">Total Revenue</span>
              <span className="font-semibold text-gray-900 text-right">{formatCurrency(totalRevenue)}</span>
            </div>
          </div>
        </div>

        {/* COGS */}
        {cogs.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">COST OF GOODS SOLD</h3>
            <div className="space-y-0">
              {cogs.map((line) => (
                <div
                  key={line.account_name}
                  className="flex justify-between border-b border-gray-200 py-1 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedAccount(line)}
                >
                  <span className="text-sm text-gray-700 hover:text-blue-600 hover:underline">
                    {line.account_name}
                  </span>
                  <span className="text-sm text-gray-900 text-right">
                    {formatCurrency(line.normalized_balance)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between border-t-2 border-gray-400 pt-1 mt-1">
                <span className="font-semibold text-gray-900">Total COGS</span>
                <span className="font-semibold text-gray-900 text-right">{formatCurrency(totalCogs)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Gross Profit */}
        <div className="flex justify-between border-t-2 border-gray-900 pt-1">
          <span className="font-semibold text-gray-900">Gross Profit</span>
          <span className="font-semibold text-gray-900 text-right">{formatCurrency(grossProfit)}</span>
        </div>

        {/* Operating Expenses */}
        {operatingExpenses.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">OPERATING EXPENSES</h3>
            <div className="space-y-0">
              {operatingExpenses.map((line) => (
                <div
                  key={line.account_name}
                  className="flex justify-between border-b border-gray-200 py-1 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedAccount(line)}
                >
                  <span className="text-sm text-gray-700 hover:text-blue-600 hover:underline">
                    {line.account_name}
                  </span>
                  <span className="text-sm text-gray-900 text-right">
                    {formatCurrency(line.normalized_balance)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between border-t-2 border-gray-400 pt-1 mt-1">
                <span className="font-semibold text-gray-900">Total Operating Expenses</span>
                <span className="font-semibold text-gray-900 text-right">{formatCurrency(totalOperatingExpenses)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Operating Income */}
        <div className="flex justify-between border-t-2 border-gray-900 pt-1">
          <span className="font-semibold text-gray-900">Operating Income</span>
          <span className="font-semibold text-gray-900 text-right">{formatCurrency(operatingIncome)}</span>
        </div>

        {/* Other Income/Expense */}
        {(otherIncome.length > 0 || otherExpense.length > 0) && (
          <>
            {otherIncome.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">OTHER INCOME</h3>
                <div className="space-y-0">
                  {otherIncome.map((line) => (
                    <div
                      key={line.account_name}
                      className="flex justify-between border-b border-gray-200 py-1 hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedAccount(line)}
                    >
                      <span className="text-sm text-gray-700 hover:text-blue-600 hover:underline">
                        {line.account_name}
                      </span>
                      <span className="text-sm text-gray-900 text-right">
                        {formatCurrency(line.normalized_balance)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t-2 border-gray-400 pt-1 mt-1">
                    <span className="font-semibold text-gray-900">Total Other Income</span>
                    <span className="font-semibold text-gray-900 text-right">{formatCurrency(totalOtherIncome)}</span>
                  </div>
                </div>
              </div>
            )}

            {otherExpense.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">OTHER EXPENSES</h3>
                <div className="space-y-0">
                  {otherExpense.map((line) => (
                    <div
                      key={line.account_name}
                      className="flex justify-between border-b border-gray-200 py-1 hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedAccount(line)}
                    >
                      <span className="text-sm text-gray-700 hover:text-blue-600 hover:underline">
                        {line.account_name}
                      </span>
                      <span className="text-sm text-gray-900 text-right">
                        {formatCurrency(line.normalized_balance)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t-2 border-gray-400 pt-1 mt-1">
                    <span className="font-semibold text-gray-900">Total Other Expenses</span>
                    <span className="font-semibold text-gray-900 text-right">{formatCurrency(totalOtherExpense)}</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Net Income */}
        <div className="flex justify-between border-t-4 border-gray-900 pt-2">
          <span className="font-bold text-lg text-gray-900">NET INCOME</span>
          <span className={`font-bold text-lg text-right ${netIncome >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
            {formatCurrency(netIncome)}
          </span>
        </div>
      </div>

      {/* Account Detail Drawer */}
      {selectedAccount && (() => {
        const originalTbLine = trialBalanceLines?.find(
          l => l.account_name === selectedAccount.account_name
        )
        return (
          <AccountDetailDrawer
            isOpen={!!selectedAccount}
            onClose={() => setSelectedAccount(null)}
            account={{
              account_name: selectedAccount.account_name,
              account_number: selectedAccount.account_number,
              account_type: originalTbLine?.account_type || null,
              category: selectedAccount.category,
              debit: originalTbLine?.debit || null,
              credit: originalTbLine?.credit || null,
              balance: selectedAccount.raw_balance,
              normalized_balance: selectedAccount.normalized_balance,
              reportType: 'P&L',
            }}
            period={period}
          />
        )
      })()}
    </div>
  )
}
