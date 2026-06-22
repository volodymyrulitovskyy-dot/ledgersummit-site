'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { VarianceDrillDownDrawer } from './VarianceDrillDownDrawer'

interface VarianceDetail {
    id: string
    account_name: string
    account_number?: string
    current_balance: number
    prior_balance: number
    variance_amount: number
    variance_percent: number
    explanation?: string
    explained_by?: string
    explained_at?: string
}

interface DrillDownData {
    currentPeriod: {
        date: string
        balance: number
        transactions: Array<{
            date: string
            description: string
            debit: number | null
            credit: number | null
            amount: number
        }>
    }
    priorPeriod: {
        date: string
        balance: number
        transactions: Array<{
            date: string
            description: string
            debit: number | null
            credit: number | null
            amount: number
        }>
    }
}

export function VarianceClient({
    orgId,
    currentPeriodEnd: initialCurrentPeriodEnd // Renamed prop to avoid conflict with state
}: {
    orgId: string
    currentPeriodEnd: string | null
}) {
    const router = useRouter()
    const [currentPeriodEnd, setCurrentPeriodEnd] = useState<string | null>(initialCurrentPeriodEnd) // State for currentPeriodEnd
    const [priorPeriod, setPriorPeriod] = useState<string>('')
    const [threshold, setThreshold] = useState<number>(1000)
    const [variances, setVariances] = useState<VarianceDetail[]>([])
    const [loading, setLoading] = useState(false)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [explanations, setExplanations] = useState<Record<string, string>>({}) // Renamed from explanationDraft

    // Drill-down drawer state
    const [drillDownOpen, setDrillDownOpen] = useState(false)
    const [selectedVariance, setSelectedVariance] = useState<VarianceDetail | null>(null)
    const [drillDownData, setDrillDownData] = useState<any>(null) // Type changed from DrillDownData | null
    const [loadingDrillDown, setLoadingDrillDown] = useState(false)
    const [mounted, setMounted] = useState(false) // New state

    // Set mounted state and auto-populate prior period only on client
    useEffect(() => {
        setMounted(true)
        if (initialCurrentPeriodEnd && !priorPeriod) { // Use initialCurrentPeriodEnd prop here
            // Calculate last day of previous month
            const currentDate = new Date(initialCurrentPeriodEnd)
            const priorDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0) // Last day of previous month
            const priorPeriodStr = priorDate.toISOString().split('T')[0]
            setPriorPeriod(priorPeriodStr)
        }
    }, [initialCurrentPeriodEnd, priorPeriod]) // Dependency on initialCurrentPeriodEnd prop

    const loadVariances = async () => {
        if (!currentPeriodEnd || !priorPeriod) return

        setLoading(true)
        try {
            const resp = await fetch(`/api/variance?org_id=${orgId}&current_period=${currentPeriodEnd}&prior_period=${priorPeriod}&threshold=${threshold}`)
            if (resp.ok) {
                const data = await resp.json()
                setVariances(data.variances || [])
            }
        } finally {
            setLoading(false)
        }
    }

    const openDrillDown = async (variance: VarianceDetail) => {
        setSelectedVariance(variance)
        setDrillDownOpen(true)
        setLoadingDrillDown(true)
        setDrillDownData(null)

        try {
            const params = new URLSearchParams({
                org_id: orgId,
                account_name: variance.account_name,
                current_period: currentPeriodEnd || '',
                prior_period: priorPeriod
            })

            // Add account_id if available
            if (variance.account_number) {
                params.set('account_id', variance.account_number)
            }

            const resp = await fetch(`/api/variance/drill-down?${params.toString()}`)
            if (resp.ok) {
                const data = await resp.json()
                setDrillDownData(data)
            }
        } finally {
            setLoadingDrillDown(false)
        }
    }

    const handleExpand = (varianceId: string) => {
        const newExpandedId = expandedId === varianceId ? null : varianceId
        setExpandedId(newExpandedId)
    }

    const saveExplanation = async (varianceId: string) => {
        const explanation = explanations[varianceId]?.trim()
        if (!explanation) return

        const resp = await fetch(`/api/variance/${varianceId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ explanation }),
        })

        if (resp.ok) {
            setExplanations(prev => ({ ...prev, [varianceId]: '' }))
            loadVariances()
        }
    }

    // Auto-populate prior period when current period changes
    useEffect(() => {
        if (currentPeriodEnd && !priorPeriod) {
            // Calculate last day of previous month
            const currentDate = new Date(currentPeriodEnd)
            const priorDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0) // Last day of previous month
            const priorPeriodStr = priorDate.toISOString().split('T')[0]
            setPriorPeriod(priorPeriodStr)
        }
    }, [currentPeriodEnd, priorPeriod])

    const totalVariance = variances.reduce((sum, v) => sum + Math.abs(v.variance_amount), 0)
    const explainedCount = variances.filter(v => v.explanation).length
    const unexplainedCount = variances.length - explainedCount

    return (
        <div className="space-y-6">
            {/* Configuration */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Analysis Settings</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Current Period
                        </label>
                        <input
                            type="date"
                            value={currentPeriodEnd || ''}
                            disabled
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-slate-50"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Prior Period *
                        </label>
                        <input
                            type="date"
                            value={priorPeriod}
                            onChange={(e) => setPriorPeriod(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Variance Threshold ($)
                        </label>
                        <input
                            type="number"
                            value={threshold}
                            onChange={(e) => setThreshold(parseFloat(e.target.value) || 0)}
                            className="rounded-lg border border-slate-300 px-3 py-2 w-32"
                            placeholder="1000"
                        />
                    </div>
                </div>
                <div className="mt-4">
                    <button
                        onClick={loadVariances}
                        disabled={!currentPeriodEnd || !priorPeriod || loading}
                        className="rounded-xl bg-slate-900 px-6 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                        {loading ? 'Analyzing...' : 'Run Analysis'}
                    </button>
                </div>
            </div>

            {/* Stats */}
            {variances.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                        <div className="text-sm font-medium text-slate-500 mb-1">Total Variances</div>
                        <div className="text-3xl font-bold text-slate-900">{variances.length}</div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                        <div className="text-sm font-medium text-slate-500 mb-1">Total Impact</div>
                        <div className="text-3xl font-bold text-slate-900">
                            ${totalVariance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                        <div className="text-sm font-medium text-slate-500 mb-1">Explained</div>
                        <div className="text-3xl font-bold text-emerald-600">{explainedCount}</div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                        <div className="text-sm font-medium text-slate-500 mb-1">Unexplained</div>
                        <div className="text-3xl font-bold text-amber-600">{unexplainedCount}</div>
                    </div>
                </div>
            )}

            {/* Variances Table */}
            {variances.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        Account
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        Current
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        Prior
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        Variance $
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        Variance %
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {variances.map((variance) => {
                                    const isExpanded = expandedId === variance.id
                                    const isPositive = variance.variance_amount > 0

                                    return (
                                        <React.Fragment key={variance.id}>
                                            <tr className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="font-semibold text-slate-900">{variance.account_name}</div>
                                                    {variance.account_number && (
                                                        <div className="text-xs text-slate-500">#{variance.account_number}</div>
                                                    )}
                                                </td>
                                                <td
                                                    className="px-6 py-4 text-right text-slate-900 tabular-nums cursor-pointer hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                                    onClick={() => openDrillDown(variance)}
                                                    title="Click to view transaction details"
                                                >
                                                    ${variance.current_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td
                                                    className="px-6 py-4 text-right text-slate-900 tabular-nums cursor-pointer hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                                    onClick={() => openDrillDown(variance)}
                                                    title="Click to view transaction details"
                                                >
                                                    ${variance.prior_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-6 py-4 text-right tabular-nums">
                                                    <span className={`font-semibold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                                                        {isPositive ? '+' : ''}${variance.variance_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right tabular-nums">
                                                    <span className={`font-semibold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                                                        {isPositive ? '+' : ''}{variance.variance_percent.toFixed(1)}%
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {variance.explanation ? (
                                                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                                                            Explained
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                                                            Pending
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <button
                                                        onClick={() => setExpandedId(isExpanded ? null : variance.id)}
                                                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                                                    >
                                                        {isExpanded ? 'Hide' : 'Explain'}
                                                    </button>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr>
                                                    <td colSpan={7} className="px-6 py-4 bg-slate-50">
                                                        <div className="max-w-2xl">
                                                            <div className="text-sm font-semibold text-slate-900 mb-2">
                                                                Variance Explanation
                                                            </div>
                                                            {variance.explanation ? (
                                                                <div className="rounded-lg border border-slate-200 bg-white p-4 mb-3">
                                                                    <div className="text-sm text-slate-700">{variance.explanation}</div>
                                                                    {variance.explained_by && (
                                                                        <div className="text-xs text-slate-500 mt-2">
                                                                            By {variance.explained_by} on {new Date(variance.explained_at!).toLocaleDateString()}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : null}
                                                            <textarea
                                                                value={explanations[variance.id] || ''}
                                                                onChange={(e) => setExplanations((prev: Record<string, string>) => ({ ...prev, [variance.id]: e.target.value }))}
                                                                placeholder="Explain this variance..."
                                                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[80px]"
                                                            />
                                                            <button
                                                                onClick={() => saveExplanation(variance.id)}
                                                                disabled={!explanations[variance.id]?.trim()}
                                                                className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                                                            >
                                                                Save Explanation
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {!loading && variances.length === 0 && priorPeriod && (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
                    No variances found above the threshold. Try adjusting the threshold or period selection.
                </div>
            )}

            {/* Drill-Down Drawer */}
            {selectedVariance && (
                <VarianceDrillDownDrawer
                    isOpen={drillDownOpen}
                    onClose={() => {
                        setDrillDownOpen(false)
                        setSelectedVariance(null)
                        setDrillDownData(null)
                    }}
                    accountName={selectedVariance.account_name}
                    accountNumber={selectedVariance.account_number}
                    currentPeriod={{
                        date: currentPeriodEnd || '',
                        balance: selectedVariance.current_balance,
                        transactions: drillDownData?.currentPeriod?.transactions || []
                    }}
                    priorPeriod={{
                        date: priorPeriod,
                        balance: selectedVariance.prior_balance,
                        transactions: drillDownData?.priorPeriod?.transactions || []
                    }}
                    varianceAmount={selectedVariance.variance_amount}
                    variancePercent={selectedVariance.variance_percent}
                />
            )}
        </div>
    )
}

// Add React import
import React from 'react'
