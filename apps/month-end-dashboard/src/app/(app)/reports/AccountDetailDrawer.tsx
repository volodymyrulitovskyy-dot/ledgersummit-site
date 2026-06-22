'use client'

import { formatCurrency } from './reportUtils'
import type { AccountCategory } from '@/lib/reports/accountClassification'

interface AccountDetailDrawerProps {
  isOpen: boolean
  onClose: () => void
  account: {
    id?: string
    account_name: string
    account_number: string | null
    account_type: string | null
    category: AccountCategory
    debit: number | null
    credit: number | null
    balance: number
    normalized_balance?: number
    reportType: 'BS' | 'P&L' | 'TB'
  }
  period: {
    fromDate: string
    toDate: string
  }
  varianceContribution?: {
    amount: number
    rank: number
    totalDrivers: number
  }
  isDiagnostic?: boolean
  diagnosticExplanation?: string
}

export function AccountDetailDrawer({
  isOpen,
  onClose,
  account,
  period,
  varianceContribution,
  isDiagnostic = false,
  diagnosticExplanation,
}: AccountDetailDrawerProps) {
  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-2xl bg-white shadow-xl transition-transform">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Account Detail</h2>
              <p className="mt-1 text-sm text-gray-600">{account.account_name}</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-6">
              {/* Account Info */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Account Information</h3>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Account Name</dt>
                    <dd className="mt-1 text-sm text-gray-900">{account.account_name}</dd>
                  </div>
                  {account.account_number && (
                    <div>
                      <dt className="text-xs font-medium text-gray-500">Account Number</dt>
                      <dd className="mt-1 text-sm text-gray-900">{account.account_number}</dd>
                    </div>
                  )}
                  {account.account_type && (
                    <div>
                      <dt className="text-xs font-medium text-gray-500">Account Type</dt>
                      <dd className="mt-1 text-sm text-gray-900">{account.account_type}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Category</dt>
                    <dd className="mt-1 text-sm text-gray-900 capitalize">{account.category}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Report Type</dt>
                    <dd className="mt-1 text-sm text-gray-900">{account.reportType}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Period</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {period.fromDate} to {period.toDate}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Diagnostic Account Warning */}
              {isDiagnostic && (
                <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg
                        className="h-5 w-5 text-yellow-400"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-yellow-800">Diagnostic Account</h3>
                      <div className="mt-2 text-sm text-yellow-700">
                        <p>
                          {diagnosticExplanation ||
                            'This balance usually results from initial setup or incomplete prior-period data.'}
                        </p>
                        <p className="mt-2">
                          Journal-level drilldown is not available for diagnostic accounts.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Variance Contribution */}
              {varianceContribution && (
                <div className="rounded-md border border-red-200 bg-red-50 p-4">
                  <div className="flex items-start">
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
                      <h3 className="text-sm font-medium text-red-800">
                        ⚠️ Contributes to Balance Sheet imbalance
                      </h3>
                      <div className="mt-2 space-y-1">
                        <p className="text-sm text-red-700">
                          <span className="font-semibold">Contribution to variance:</span>{' '}
                          {formatCurrency(varianceContribution.amount)}
                        </p>
                        <p className="text-sm text-red-700">
                          <span className="font-semibold">Rank:</span> #{varianceContribution.rank} of{' '}
                          {varianceContribution.totalDrivers} variance drivers
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Trial Balance Details */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Trial Balance Details</h3>
                <div className="overflow-hidden border border-gray-200 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Field
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      <tr>
                        <td className="px-4 py-2 text-sm text-gray-700">Debit</td>
                        <td className="px-4 py-2 text-sm text-right text-gray-900">
                          {account.debit
                            ? formatCurrency(account.debit)
                            : '—'}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-sm text-gray-700">Credit</td>
                        <td className="px-4 py-2 text-sm text-right text-gray-900">
                          {account.credit
                            ? formatCurrency(account.credit)
                            : '—'}
                        </td>
                      </tr>
                      <tr className="bg-gray-50">
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">Net Balance</td>
                        <td className="px-4 py-2 text-sm font-medium text-right text-gray-900">
                          {formatCurrency(account.balance)}
                        </td>
                      </tr>
                      {account.normalized_balance !== undefined && (
                        <tr>
                          <td className="px-4 py-2 text-sm text-gray-700">Normalized (Display)</td>
                          <td className="px-4 py-2 text-sm text-right text-gray-900">
                            {formatCurrency(account.normalized_balance)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Source: QBO Trial Balance snapshot
                </p>
              </div>

              {/* Journal-Level Drilldown Stub */}
              {!isDiagnostic && (
                <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                  <h3 className="text-sm font-medium text-gray-900 mb-2">
                    Underlying Transactions
                  </h3>
                  <p className="text-sm text-gray-600">
                    Journal-level drilldown coming soon. This will show individual transactions
                    from QuickBooks JournalEntry API or NetSuite GL lines.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

