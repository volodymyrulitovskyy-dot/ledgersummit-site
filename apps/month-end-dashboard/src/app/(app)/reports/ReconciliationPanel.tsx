'use client'

import type { ReconciliationCheck } from '@/lib/reports/financialStatements'
import { formatCurrency } from './reportUtils'

interface ReconciliationPanelProps {
  reconciliation: {
    checks: ReconciliationCheck[]
    allPassed: boolean
  }
}

export function ReconciliationPanel({ reconciliation }: ReconciliationPanelProps) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
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
          <h3 className="text-sm font-semibold text-red-800">Reconciliation Issues Detected</h3>
          <div className="mt-2 space-y-3">
            {reconciliation.checks
              .filter((check) => !check.passed)
              .map((check, idx) => (
                <div key={idx} className="rounded border border-red-200 bg-white p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-900">{check.check}</p>
                      <p className="mt-1 text-sm text-red-700">{check.message}</p>
                      {check.variance !== undefined && (
                        <p className="mt-1 text-sm font-semibold text-red-800">
                          Variance: {formatCurrency(check.variance)}
                        </p>
                      )}
                      {check.topContributors && check.topContributors.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-red-800">Top Contributing Accounts:</p>
                          <ul className="mt-1 space-y-1">
                            {check.topContributors.map((contrib, cIdx) => (
                              <li key={cIdx} className="text-xs text-red-700">
                                {contrib.account_name}: {formatCurrency(contrib.amount)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}

