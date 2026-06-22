'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type ReconciliationStatus = 'pending' | 'in_progress' | 'completed'

interface Reconciliation {
    id: string
    account_name: string
    account_number?: string
    status: ReconciliationStatus
    balance_per_books?: number
    balance_per_bank?: number
    variance?: number
    reconciled_by?: string
    reconciled_at?: string
    notes?: string
}

const STATUS_COLORS: Record<ReconciliationStatus, string> = {
    pending: 'bg-slate-100 text-slate-700 border-slate-200',
    in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
    completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

const STATUS_LABELS: Record<ReconciliationStatus, string> = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
}

export function ReconciliationsClient({
    orgId,
    periodEnd
}: {
    orgId: string
    periodEnd: string | null
}) {
    const router = useRouter()
    const [reconciliations, setReconciliations] = useState<Reconciliation[]>([])
    const [showAddModal, setShowAddModal] = useState(false)
    const [tbAccounts, setTbAccounts] = useState<Array<{ account_name: string; account_number: string; balance: number }>>([])
    const [loadingAccounts, setLoadingAccounts] = useState(false)
    const [newRecon, setNewRecon] = useState({
        account_name: '',
        account_number: '',
        balance_per_books: '',
        balance_per_bank: '',
    })

    // Load reconciliations from API
    const loadReconciliations = async () => {
        if (!periodEnd) return
        const resp = await fetch(`/api/reconciliations?org_id=${orgId}&period_end=${periodEnd}`)
        if (resp.ok) {
            const data = await resp.json()
            setReconciliations(data.reconciliations || [])
        }
    }

    // Load trial balance accounts
    const loadTbAccounts = async () => {
        setLoadingAccounts(true)
        try {
            const resp = await fetch(`/api/trial-balance?org_id=${orgId}&period_end=${periodEnd}`)
            if (resp.ok) {
                const data = await resp.json()
                setTbAccounts(data.accounts || [])
            }
        } finally {
            setLoadingAccounts(false)
        }
    }

    // Handle account selection from dropdown
    const handleAccountSelect = (accountName: string) => {
        const account = tbAccounts.find(a => a.account_name === accountName)
        if (account) {
            setNewRecon({
                account_name: account.account_name,
                account_number: account.account_number || '',
                balance_per_books: account.balance.toString(),
                balance_per_bank: '',
            })
        }
    }

    // Load reconciliations on mount
    useEffect(() => {
        if (orgId && periodEnd) {
            loadReconciliations()
        }
    }, [orgId, periodEnd])

    // Load TB accounts when modal opens
    useEffect(() => {
        if (showAddModal && periodEnd) {
            loadTbAccounts()
        }
    }, [showAddModal, periodEnd])

    const handleAddReconciliation = async () => {
        if (!periodEnd || !newRecon.account_name) return

        const booksBalance = parseFloat(newRecon.balance_per_books) || 0
        const bankBalance = parseFloat(newRecon.balance_per_bank) || 0
        const variance = booksBalance - bankBalance

        const resp = await fetch('/api/reconciliations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                org_id: orgId,
                period_end: periodEnd,
                account_name: newRecon.account_name,
                account_number: newRecon.account_number || null,
                balance_per_books: booksBalance,
                balance_per_bank: bankBalance,
                variance,
                status: 'pending',
            }),
        })

        if (resp.ok) {
            setShowAddModal(false)
            setNewRecon({ account_name: '', account_number: '', balance_per_books: '', balance_per_bank: '' })
            router.refresh()
        }
    }

    const handleStatusChange = async (id: string, status: ReconciliationStatus) => {
        const resp = await fetch(`/api/reconciliations/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status,
                ...(status === 'completed' ? { reconciled_at: new Date().toISOString() } : {})
            }),
        })

        if (resp.ok) {
            router.refresh()
        }
    }

    const completedCount = reconciliations.filter(r => r.status === 'completed').length
    const totalCount = reconciliations.length
    const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <div className="text-sm font-medium text-slate-500 mb-1">Total Accounts</div>
                    <div className="text-3xl font-bold text-slate-900">{totalCount}</div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <div className="text-sm font-medium text-slate-500 mb-1">Completed</div>
                    <div className="text-3xl font-bold text-emerald-600">{completedCount}</div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <div className="text-sm font-medium text-slate-500 mb-1">In Progress</div>
                    <div className="text-3xl font-bold text-amber-600">
                        {reconciliations.filter(r => r.status === 'in_progress').length}
                    </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <div className="text-sm font-medium text-slate-500 mb-1">Completion Rate</div>
                    <div className="text-3xl font-bold text-blue-600">{completionRate}%</div>
                </div>
            </div>

            {/* Action Bar */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
                <div className="text-sm text-slate-600">
                    {periodEnd ? `Period: ${periodEnd}` : 'No period selected'}
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    disabled={!periodEnd}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                    + Add Reconciliation
                </button>
            </div>

            {/* Reconciliations Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                    Account
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                    Books Balance
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                    Bank Balance
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                    Variance
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                    Status
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                    Reconciled By
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {reconciliations.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                                        No reconciliations yet. Click "Add Reconciliation" to get started.
                                    </td>
                                </tr>
                            ) : (
                                reconciliations.map((recon) => (
                                    <tr key={recon.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-semibold text-slate-900">{recon.account_name}</div>
                                            {recon.account_number && (
                                                <div className="text-xs text-slate-500">#{recon.account_number}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-slate-900 tabular-nums">
                                            ${(recon.balance_per_books || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-4 text-slate-900 tabular-nums">
                                            ${(recon.balance_per_bank || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-4 tabular-nums">
                                            <span className={`font-semibold ${Math.abs(recon.variance || 0) > 0.01 ? 'text-red-600' : 'text-emerald-600'
                                                }`}>
                                                ${(recon.variance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <select
                                                value={recon.status}
                                                onChange={(e) => handleStatusChange(recon.id, e.target.value as ReconciliationStatus)}
                                                className={`rounded-lg border px-3 py-1 text-xs font-medium ${STATUS_COLORS[recon.status]}`}
                                            >
                                                <option value="pending">Pending</option>
                                                <option value="in_progress">In Progress</option>
                                                <option value="completed">Completed</option>
                                            </select>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            {recon.reconciled_by || '—'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                                                View Details
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
                        <h2 className="text-xl font-bold text-slate-900 mb-4">Add Reconciliation</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Account Name *
                                </label>
                                {loadingAccounts ? (
                                    <div className="text-sm text-slate-500">Loading accounts...</div>
                                ) : (
                                    <select
                                        value={newRecon.account_name}
                                        onChange={(e) => handleAccountSelect(e.target.value)}
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                    >
                                        <option value="">Select an account...</option>
                                        {tbAccounts.map((account) => (
                                            <option key={account.account_name} value={account.account_name}>
                                                {account.account_number ? `${account.account_number} - ` : ''}{account.account_name}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {tbAccounts.length === 0 && !loadingAccounts && (
                                    <p className="text-xs text-amber-600 mt-1">
                                        No trial balance found for this period. Please upload a trial balance first.
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Account Number
                                </label>
                                <input
                                    type="text"
                                    value={newRecon.account_number}
                                    disabled
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-slate-50"
                                    placeholder="Auto-populated"
                                />
                                <p className="text-xs text-slate-500 mt-1">Auto-populated from trial balance</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Balance per Books
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={newRecon.balance_per_books}
                                    disabled
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-slate-50"
                                    placeholder="Auto-populated"
                                />
                                <p className="text-xs text-slate-500 mt-1">Auto-populated from trial balance</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Balance per Bank *
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={newRecon.balance_per_bank}
                                    onChange={(e) => setNewRecon({ ...newRecon, balance_per_bank: e.target.value })}
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                    placeholder="Enter bank balance"
                                />
                            </div>
                            {newRecon.balance_per_books && newRecon.balance_per_bank && (
                                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                                    <div className="text-sm font-medium text-blue-900">Variance</div>
                                    <div className="text-lg font-bold text-blue-900">
                                        ${(parseFloat(newRecon.balance_per_books) - parseFloat(newRecon.balance_per_bank)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowAddModal(false)
                                    setNewRecon({ account_name: '', account_number: '', balance_per_books: '', balance_per_bank: '' })
                                }}
                                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddReconciliation}
                                disabled={!newRecon.account_name || !newRecon.balance_per_bank}
                                className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                            >
                                Add
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
