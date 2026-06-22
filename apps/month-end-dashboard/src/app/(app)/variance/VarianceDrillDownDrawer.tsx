'use client'

import { formatCurrency } from '../reports/reportUtils'

interface Transaction {
    date: string
    description: string
    debit: number | null
    credit: number | null
    amount: number
}

interface VarianceDrillDownDrawerProps {
    isOpen: boolean
    onClose: () => void
    accountName: string
    accountNumber?: string
    currentPeriod: {
        date: string
        balance: number
        transactions: Transaction[]
    }
    priorPeriod: {
        date: string
        balance: number
        transactions: Transaction[]
    }
    varianceAmount: number
    variancePercent: number
}

export function VarianceDrillDownDrawer({
    isOpen,
    onClose,
    accountName,
    accountNumber,
    currentPeriod,
    priorPeriod,
    varianceAmount,
    variancePercent,
}: VarianceDrillDownDrawerProps) {
    if (!isOpen) return null

    const isPositiveVariance = varianceAmount > 0

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black bg-opacity-50 transition-opacity"
                onClick={onClose}
            />

            {/* Drawer */}
            <div className="fixed right-0 top-0 z-50 h-full w-full max-w-6xl bg-white shadow-xl transition-transform overflow-hidden">
                <div className="flex h-full flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-gradient-to-r from-slate-50 to-white">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Transaction Drill-Down</h2>
                            <p className="mt-1 text-sm text-gray-600">{accountName}</p>
                            {accountNumber && (
                                <p className="text-xs text-gray-500">Account #{accountNumber}</p>
                            )}
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

                    {/* Variance Summary */}
                    <div className="border-b border-gray-200 bg-slate-50 px-6 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Current Period Column */}
                            <div className="bg-white rounded-lg p-4 border border-gray-200">
                                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Current Period - {currentPeriod.date}</h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Net Change (from transactions):</span>
                                        <span className="font-semibold">{formatCurrency(currentPeriod.balance)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-500">
                                        <span>{currentPeriod.transactions.length} transactions</span>
                                    </div>
                                </div>
                            </div>

                            {/* Prior Period Column */}
                            <div className="bg-white rounded-lg p-4 border border-gray-200">
                                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Prior Period - {priorPeriod.date}</h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Net Change (from transactions):</span>
                                        <span className="font-semibold">{formatCurrency(priorPeriod.balance)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-500">
                                        <span>{priorPeriod.transactions.length} transactions</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Variance Info */}
                        <div className="mt-4 flex items-center justify-center gap-8 text-sm">
                            <div className="text-center">
                                <div className="text-xs text-gray-500">Period-over-Period Change</div>
                                <div className={`mt-1 text-lg font-bold ${isPositiveVariance ? 'text-green-600' : 'text-red-600'}`}>
                                    {isPositiveVariance ? '+' : ''}{formatCurrency(varianceAmount)}
                                </div>
                            </div>
                            <div className="text-center">
                                <div className="text-xs text-gray-500">Variance %</div>
                                <div className={`mt-1 text-lg font-bold ${isPositiveVariance ? 'text-green-600' : 'text-red-600'}`}>
                                    {isPositiveVariance ? '+' : ''}{variancePercent.toFixed(1)}%
                                </div>
                            </div>
                        </div>

                        {/* Info Alert */}
                        <div className="mt-4 rounded-lg bg-blue-50 border border-blue-200 p-3">
                            <div className="flex items-start gap-2">
                                <svg className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                </svg>
                                <div className="text-xs text-blue-800">
                                    <strong>Note:</strong> Amounts shown above are the <strong>net change from transactions during each period</strong>, not the ending Trial Balance. The Trial Balance also includes the beginning balance for each account.
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content - Side by Side Transactions */}
                    <div className="flex-1 overflow-y-auto">
                        <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-gray-200">
                            {/* Current Period Transactions */}
                            <div className="px-6 py-4">
                                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                                    Current Period Transactions
                                    <span className="ml-2 text-xs font-normal text-gray-500">
                                        ({currentPeriod.transactions.length} transactions)
                                    </span>
                                </h3>
                                {currentPeriod.transactions.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                                        No transactions found for this period
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {currentPeriod.transactions.map((txn, idx) => (
                                            <div
                                                key={idx}
                                                className="rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50 transition-colors"
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <div className="text-sm font-medium text-gray-900">
                                                            {txn.description}
                                                        </div>
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            {txn.date}
                                                        </div>
                                                    </div>
                                                    <div className="ml-4 text-right">
                                                        {txn.debit !== null && txn.debit !== 0 && (
                                                            <div className="text-sm font-semibold text-gray-900">
                                                                DR: {formatCurrency(txn.debit)}
                                                            </div>
                                                        )}
                                                        {txn.credit !== null && txn.credit !== 0 && (
                                                            <div className="text-sm font-semibold text-gray-900">
                                                                CR: {formatCurrency(txn.credit)}
                                                            </div>
                                                        )}
                                                        <div className={`text-xs mt-1 ${txn.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                            Net: {formatCurrency(txn.amount)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Prior Period Transactions */}
                            <div className="px-6 py-4 bg-gray-50">
                                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                                    Prior Period Transactions
                                    <span className="ml-2 text-xs font-normal text-gray-500">
                                        ({priorPeriod.transactions.length} transactions)
                                    </span>
                                </h3>
                                {priorPeriod.transactions.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
                                        No transactions found for this period
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {priorPeriod.transactions.map((txn, idx) => (
                                            <div
                                                key={idx}
                                                className="rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50 transition-colors"
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <div className="text-sm font-medium text-gray-900">
                                                            {txn.description}
                                                        </div>
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            {txn.date}
                                                        </div>
                                                    </div>
                                                    <div className="ml-4 text-right">
                                                        {txn.debit !== null && txn.debit !== 0 && (
                                                            <div className="text-sm font-semibold text-gray-900">
                                                                DR: {formatCurrency(txn.debit)}
                                                            </div>
                                                        )}
                                                        {txn.credit !== null && txn.credit !== 0 && (
                                                            <div className="text-sm font-semibold text-gray-900">
                                                                CR: {formatCurrency(txn.credit)}
                                                            </div>
                                                        )}
                                                        <div className={`text-xs mt-1 ${txn.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                            Net: {formatCurrency(txn.amount)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="border-t border-gray-200 bg-white px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div className="text-xs text-gray-500">
                                Source: Trial Balance Snapshots
                            </div>
                            <button
                                onClick={onClose}
                                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
