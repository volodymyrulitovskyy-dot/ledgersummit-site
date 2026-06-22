'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SeverityBadge, StatusBadge } from '@/components/close/Badges'
import { ToastBanner } from '@/components/close/ToastBanner'

type Status = 'open' | 'awaiting_explanation' | 'resolved' | 'dismissed' | 'complete'
type Severity = 'low' | 'medium' | 'high' | 'critical'

interface Exception {
  id: string
  status: Status
  severity: Severity
  title?: string | null
  details?: string | null
  account_name: string | null
  account_number: string | null
  balance: number | null
  target_value?: number | null
  variance_amount?: number | null
  variance_pct?: number | null
  owner_name: string | null
  owner_user_id?: string | null
  resolved_reason?: string | null
  created_at: Date | string
  rule_id?: string | null
  metric?: string | null
  domain?: string | null
  risk_score?: number | null
  rule?: { id: string; name: string; severity?: Severity | null } | null
}

interface ExceptionsListProps {
  orgId: string
  exceptions: Exception[]
  viewer: {
    id: string
    role: 'admin' | 'user'
    email?: string | null
  }
  users?: Array<{ id: string; email: string; role?: string | null }>
}

function formatMoney(n: number | null | undefined) {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function ExceptionsList({ orgId, exceptions, viewer, users = [] }: ExceptionsListProps) {
  const router = useRouter()
  const isAdmin = viewer.role === 'admin'
  const [items, setItems] = useState<Exception[]>(exceptions)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [metricFilter, setMetricFilter] = useState<string>('all')
  const [tabFilter, setTabFilter] = useState<'all' | 'open' | 'completed'>('all')
  const [ownerFilter, setOwnerFilter] = useState<'mine' | 'unassigned' | 'all'>(isAdmin ? 'all' : 'mine')
  const [searchQuery, setSearchQuery] = useState('')
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({})
  const [resolveReason, setResolveReason] = useState<Record<string, string>>({})
  const [statusDraft, setStatusDraft] = useState<Record<string, Status>>({})
  const [ownerDraft, setOwnerDraft] = useState<Record<string, string>>({})
  const [commentsById, setCommentsById] = useState<Record<string, any[]>>({})
  const [loadingComments, setLoadingComments] = useState<Record<string, boolean>>({})
  const [bulkStatus, setBulkStatus] = useState<string>('') // if set to resolved require reason
  const [bulkOwner, setBulkOwner] = useState<string>('')
  const [bulkNote, setBulkNote] = useState<string>('')
  const [bulkReason, setBulkReason] = useState<string>('')
  const [toast, setToast] = useState<{ message: string; tone?: 'success' | 'error' } | null>(null)

  const ownerOptions = useMemo(() => {
    const base = [{ value: '', label: 'Unassigned' }]
    const fromUsers = users.map((u) => ({ value: u.id, label: u.email || u.id }))
    return [...base, ...fromUsers]
  }, [users])

  useEffect(() => {
    setItems(exceptions)
    const nextStatus: Record<string, Status> = {}
    const nextOwner: Record<string, string> = {}
    const nextReason: Record<string, string> = {}
    for (const ex of exceptions) {
      if (!ex?.id) continue
      nextStatus[ex.id] = ex.status
      nextOwner[ex.id] = ex.owner_user_id ?? ''
      if (ex.resolved_reason) nextReason[ex.id] = ex.resolved_reason
    }
    setStatusDraft(nextStatus)
    setOwnerDraft(nextOwner)
    setResolveReason((prev) => ({ ...nextReason, ...prev }))
  }, [exceptions])

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.sessionStorage.getItem('exceptions_tab') : null
    if (saved === 'open' || saved === 'completed' || saved === 'all') setTabFilter(saved)
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('exceptions_tab', tabFilter)
    }
  }, [tabFilter])

  function requireExceptionId(ex: Exception) {
    if (!ex?.id) throw new Error('Missing id')
    return ex.id
  }

  function matchesFilters(ex: Exception) {
    const statusNorm = (ex.status || '').toLowerCase()
    if (tabFilter === 'open' && statusNorm === 'resolved') return false
    if (tabFilter === 'completed' && statusNorm !== 'resolved' && statusNorm !== 'complete')
      return false
    if (severityFilter !== 'all' && (ex.severity || '').toLowerCase() !== severityFilter)
      return false
    if (statusFilter !== 'all' && statusNorm !== statusFilter) return false
    if (metricFilter !== 'all' && (ex.metric || '').toLowerCase() !== metricFilter) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const ruleName = ex.rule?.name?.toLowerCase() ?? ''
      const account = ex.account_name?.toLowerCase() ?? ''
      if (!ruleName.includes(q) && !account.includes(q)) return false
    }
    if (!isAdmin && (ex.owner_user_id || '') !== viewer.id) return false
    if (isAdmin) {
      if (ownerFilter === 'mine' && (ex.owner_user_id || '') !== viewer.id) return false
      if (ownerFilter === 'unassigned' && (ex.owner_user_id || '') !== '') return false
    }
    return true
  }

  const filtered = useMemo(() => items.filter(matchesFilters), [items, severityFilter, statusFilter, metricFilter, tabFilter, searchQuery, ownerFilter])
  const metrics = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .map((i) => (i.metric || '').toLowerCase())
            .filter((v) => v === 'revenue' || v === 'cogs' || v === 'gross_profit' || v === 'gp_percent')
        )
      ),
    [items]
  )
  const showMetric = metrics.length > 0
  const isProjectView = items.some((i) => (i.domain || '').toUpperCase() === 'PROJECT_PNL')

  const grouped = useMemo(() => {
    const map: Record<string, { label: string; items: Exception[] }> = {}
    for (const ex of filtered) {
      const key = ex.rule_id || ex.rule?.id || 'unknown-rule'
      const label = ex.rule?.name || 'Unknown rule'
      if (!map[key]) map[key] = { label, items: [] }
      map[key].items.push(ex)
    }
    return Object.entries(map)
      .map(([key, value]) => ({
        key,
        ...value,
        totalRiskScore: value.items.reduce((s, i) => s + (i.risk_score ?? 0), 0),
      }))
      .sort((a, b) => b.totalRiskScore - a.totalRiskScore)
  }, [filtered])

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (expandedGroups.size === 0) {
      setExpandedGroups(new Set(grouped.map((g) => g.key)))
    }
  }, [grouped, expandedGroups.size])

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll(ids: string[]) {
    setSelected((prev) => {
      if (prev.size === ids.length) return new Set()
      return new Set(ids)
    })
  }

  async function loadComments(exceptionId: string) {
    setLoadingComments((p) => ({ ...p, [exceptionId]: true }))
    try {
      const resp = await fetch(`/api/close/exceptions/${exceptionId}/comments`)
      if (!resp.ok) {
        setToast({ message: 'Failed to load comments', tone: 'error' })
        return
      }
      const json = await resp.json()
      setCommentsById((p) => ({ ...p, [exceptionId]: json.comments || [] }))
    } finally {
      setLoadingComments((p) => ({ ...p, [exceptionId]: false }))
    }
  }

  async function addComment(exceptionId: string, text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    const resp = await fetch(`/api/close/exceptions/${exceptionId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: trimmed }),
    })
    if (!resp.ok) {
      const text = await resp.text()
      setToast({ message: text || 'Failed to add comment', tone: 'error' })
      return
    }
    await loadComments(exceptionId)
    setToast({ message: 'Note added', tone: 'success' })
  }

  async function patchException(exception: Exception, payload: any) {
    const exceptionId = requireExceptionId(exception)
    const resp = await fetch(`/api/close/exceptions/${exceptionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) {
      const text = await resp.text()
      setToast({ message: text || 'Update failed', tone: 'error' })
      throw new Error(text || 'Update failed')
    }
    setToast({ message: 'Updated', tone: 'success' })
    router.refresh()
  }

  async function handleSubmit(ex: Exception) {
    const id = requireExceptionId(ex)
    const status = statusDraft[id] ?? ex.status
    const ownerId = ownerDraft[id] ?? ''
    const pendingNote = noteDraft[id]?.trim()
    const reason = resolveReason[id]?.trim()

    if ((status === 'resolved' || status === 'awaiting_explanation') && !pendingNote) {
      setToast({ message: 'Add a note before changing to this status', tone: 'error' })
      return
    }
    if (status === 'resolved' && !reason) {
      setToast({ message: 'Add a resolve reason before closing', tone: 'error' })
      return
    }

    const payload: any = {
      status,
      comment: pendingNote,
      resolved_reason: status === 'resolved' ? reason : undefined,
    }
    if (isAdmin) {
      const ownerOption = ownerOptions.find((o) => o.value === ownerId)
      payload.owner_user_id = ownerId || null
      payload.owner_name = ownerOption?.label || null
    }

    await patchException(ex, payload)
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, status, owner_name: payload.owner_name ?? item.owner_name, owner_user_id: isAdmin ? payload.owner_user_id ?? null : item.owner_user_id }
          : item
      )
    )
    setNoteDraft((p) => ({ ...p, [id]: '' }))
    if (status === 'resolved') {
      setResolveReason((p) => ({ ...p, [id]: '' }))
    }
  }

  async function handleBulkApply() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (bulkStatus === 'resolved' && !bulkReason.trim() && !bulkNote.trim()) {
      setToast({ message: 'Provide a resolve reason or note for bulk resolve', tone: 'error' })
      return
    }
    const ownerOption = ownerOptions.find((o) => o.value === bulkOwner)
    const resp = await fetch('/api/close/exceptions/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids,
        owner_user_id: isAdmin ? (bulkOwner || undefined) : undefined,
        owner_name: isAdmin ? ownerOption?.label || undefined : undefined,
        status: bulkStatus || undefined,
        comment: bulkNote?.trim() || undefined,
        resolved_reason: bulkStatus === 'resolved' ? bulkReason || 'Bulk resolve' : undefined,
      }),
    })
    if (!resp.ok) {
      const text = await resp.text()
      setToast({ message: text || 'Bulk update failed', tone: 'error' })
      return
    }
    setToast({ message: 'Bulk update applied', tone: 'success' })
    setSelected(new Set())
    setBulkOwner('')
    setBulkStatus('')
    setBulkNote('')
    setBulkReason('')
    router.refresh()
  }

  const anySelected = selected.size > 0

  return (
    <div className="space-y-3">
      {toast && (
        <ToastBanner
          type={toast.tone === 'error' ? 'error' : 'success'}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm">
          <button
            className={`px-2 py-1 ${ownerFilter === 'mine' ? 'font-semibold text-slate-900' : 'text-slate-500'}`}
            onClick={() => setOwnerFilter('mine')}
          >
            My Exceptions
          </button>
          {isAdmin && (
            <>
              <button
                className={`px-2 py-1 ${ownerFilter === 'unassigned' ? 'font-semibold text-slate-900' : 'text-slate-500'}`}
                onClick={() => setOwnerFilter('unassigned')}
              >
                Unassigned
              </button>
              <button
                className={`px-2 py-1 ${ownerFilter === 'all' ? 'font-semibold text-slate-900' : 'text-slate-500'}`}
                onClick={() => setOwnerFilter('all')}
              >
                All
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm">
          <button
            className={`px-2 py-1 ${tabFilter === 'all' ? 'font-semibold text-slate-900' : 'text-slate-500'}`}
            onClick={() => setTabFilter('all')}
          >
            All
          </button>
          <button
            className={`px-2 py-1 ${tabFilter === 'open' ? 'font-semibold text-slate-900' : 'text-slate-500'}`}
            onClick={() => setTabFilter('open')}
          >
            Open
          </button>
          <button
            className={`px-2 py-1 ${tabFilter === 'completed' ? 'font-semibold text-slate-900' : 'text-slate-500'}`}
            onClick={() => setTabFilter('completed')}
          >
            Completed
          </button>
        </div>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="all">All severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="all">All status</option>
          <option value="open">Open</option>
          <option value="awaiting_explanation">Awaiting explanation</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
        {showMetric && (
          <select
            value={metricFilter}
            onChange={(e) => setMetricFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="all">All metrics</option>
            <option value="revenue">Revenue</option>
            <option value="cogs">COGS</option>
            <option value="gross_profit">Gross Profit</option>
            <option value="gp_percent">GP %</option>
          </select>
        )}
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search account or rule"
          className="w-60 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </div>

      {anySelected && (
        <div className="sticky top-0 z-10 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm font-semibold text-slate-900">{selected.size} selected</div>
            <select
              value={bulkOwner}
              onChange={(e) => setBulkOwner(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              disabled={!isAdmin}
            >
              {ownerOptions.map((opt) => (
                <option key={opt.value || 'unassigned'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Status…</option>
              <option value="open">Open</option>
              <option value="awaiting_explanation">Awaiting explanation</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
            {bulkStatus === 'resolved' && (
              <input
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
                placeholder="Resolve reason"
                className="w-48 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            )}
            <input
              value={bulkNote}
              onChange={(e) => setBulkNote(e.target.value)}
              placeholder="Add note to all"
              className="flex-1 min-w-[160px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              onClick={handleBulkApply}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      <div className="w-full overflow-x-auto">
        <table className="min-w-[1200px] w-full table-auto border-separate border-spacing-0">
          <thead className="bg-slate-50">
            <tr>
              <th className="w-10 px-3 py-2 text-left text-xs font-semibold text-slate-500">
                <input
                  type="checkbox"
                  checked={
                    filtered.length > 0 && selected.size === filtered.length
                  }
                  onChange={() => toggleAll(filtered.map((f) => f.id))}
                />
              </th>
              <th className="w-10 px-3 py-2 text-left text-xs font-semibold text-slate-500"></th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">{isProjectView ? 'Customer' : 'Account'}</th>
              {showMetric && <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Metric</th>}
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">{isProjectView ? 'Current' : 'Activity'}</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">{isProjectView ? 'Baseline' : 'Target'}</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Δ$</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Δ%</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((group) => {
              const groupExpanded = expandedGroups.has(group.key)
              return (
                <React.Fragment key={group.key}>
                  <tr className="bg-slate-100">
                    <td colSpan={showMetric ? 9 : 8} className="px-3 py-2 text-sm font-semibold text-slate-800">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between"
                        onClick={() => toggleGroup(group.key)}
                      >
                        <span>
                          {group.label} ({group.items.length})
                        </span>
                        <span className={`text-xs transition-transform ${groupExpanded ? 'rotate-90' : 'rotate-0'}`}>
                          ▸
                        </span>
                      </button>
                    </td>
                  </tr>
                  {groupExpanded ? (
                    group.items.map((ex) => {
                      const isExpanded = expandedId === ex.id
                      const id = requireExceptionId(ex)
                      return (
                        <React.Fragment key={id}>
                          <tr className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-3 py-2 align-top">
                              <input
                                type="checkbox"
                                checked={selected.has(id)}
                                onChange={() => toggleSelect(id)}
                              />
                            </td>
                            <td className="px-3 py-2 align-top">
                              <button
                                type="button"
                                className="p-1 text-slate-500 hover:text-slate-800"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setExpandedId(isExpanded ? null : id)
                                  if (!commentsById[id]) loadComments(id)
                                }}
                                aria-label="Toggle details"
                              >
                                {isExpanded ? '▾' : '▸'}
                              </button>
                            </td>
                            <td className="px-3 py-2 align-top">
                              <div className="font-semibold text-slate-900">
                                {ex.account_name || '—'}
                              </div>
                              {ex.account_number && (
                                <div className="text-xs text-slate-500">#{ex.account_number}</div>
                              )}
                            </td>
                            {showMetric && (
                              <td className="px-3 py-2 align-top">
                                <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                                  {(ex.metric || '').replace('_', ' ')}
                                </span>
                              </td>
                            )}
                            <td className="px-3 py-2 align-top text-right">
                              <div className="tabular-nums text-slate-900">{formatMoney(ex.balance)}</div>
                            </td>
                            <td className="px-3 py-2 align-top text-right">
                              <div className="tabular-nums text-slate-500">{formatMoney(ex.target_value)}</div>
                            </td>
                            <td className="px-3 py-2 align-top text-right">
                              <div className={`tabular-nums ${(ex.variance_amount ?? 0) < 0 ? 'text-green-600' : (ex.variance_amount ?? 0) > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                                {formatMoney(ex.variance_amount)}
                              </div>
                            </td>
                            <td className="px-3 py-2 align-top text-right">
                              <div className={`tabular-nums ${(ex.variance_pct ?? 0) < 0 ? 'text-green-600' : (ex.variance_pct ?? 0) > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                                {ex.variance_pct != null ? `${ex.variance_pct.toFixed(1)}%` : '—'}
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={showMetric ? 9 : 8} className="bg-slate-50 px-4 py-4 text-sm text-slate-800">
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div>
                                    <div className="font-semibold mb-1">What this means</div>
                                    <div>{isProjectView ? 'Current' : 'Current activity'}: {formatMoney(ex.balance)}</div>
                                    {ex.target_value != null && <div>{isProjectView ? 'Baseline' : 'Target/Prior'}: {formatMoney(ex.target_value)}</div>}
                                    {ex.variance_amount != null && <div>Variance: {formatMoney(ex.variance_amount)} ({ex.variance_pct?.toFixed(1)}%)</div>}
                                    {ex.details && (
                                      <div className="mt-2 text-slate-700">{ex.details}</div>
                                    )}
                                  </div>
                                  <div>
                                    <div className="font-semibold mb-1">Recommended action</div>
                                    <ul className="list-disc pl-4 space-y-1 text-slate-700">
                                      <li>Review account activity for the period</li>
                                      <li>Verify balance matches supporting documentation</li>
                                      <li>Check for missing or duplicate transactions</li>
                                      <li>Document any adjustments or explanations</li>
                                    </ul>
                                  </div>
                                </div>

                                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="font-semibold text-slate-900">Notes</div>
                                    {loadingComments[id] && (
                                      <span className="text-xs text-slate-500">Loading…</span>
                                    )}
                                  </div>
                                  <div className="mt-2 space-y-2">
                                    {(commentsById[id] ?? []).map((c, idx) => (
                                      <div key={idx} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                                        <div className="text-slate-700">{c.text}</div>
                                        <div className="text-xs text-slate-500">
                                          {c.user_email || 'User'} · {new Date(c.created_at).toLocaleString()}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="mt-2 flex flex-col gap-2">
                                    <textarea
                                      className="min-h-[60px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                      placeholder="Add a note…"
                                      value={noteDraft[id] ?? ''}
                                      onChange={(e) =>
                                        setNoteDraft((p) => ({ ...p, [id]: e.target.value }))
                                      }
                                    />
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => addComment(id, noteDraft[id] ?? '')}
                                        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                                      >
                                        Add note
                                      </button>
                                      <div className="text-xs text-slate-500">
                                        Status changes to Awaiting / Resolved require a note.
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                                  <div className="flex flex-wrap items-center gap-3 justify-between">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="text-sm font-semibold text-slate-900">Workflow</div>
                                      <SeverityBadge severity={ex.severity} />
                                      <StatusBadge status={statusDraft[id] ?? ex.status} />
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="min-w-[180px]">
                                        <div className="text-xs text-slate-500 mb-1">Owner</div>
                                        <select
                                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                                          value={ownerDraft[id] ?? ''}
                                          onChange={(e) =>
                                            setOwnerDraft((p) => ({ ...p, [id]: e.target.value }))
                                          }
                                          disabled={!isAdmin}
                                        >
                                          {ownerOptions.map((opt) => (
                                            <option key={opt.value || 'unassigned'} value={opt.value}>
                                              {opt.label}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="min-w-[180px]">
                                        <div className="text-xs text-slate-500 mb-1">Status</div>
                                        <select
                                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                                          value={statusDraft[id] ?? ex.status}
                                          onChange={(e) =>
                                            setStatusDraft((p) => ({
                                              ...p,
                                              [id]: e.target.value as Status,
                                            }))
                                          }
                                        >
                                          <option value="open">Open</option>
                                          <option value="awaiting_explanation">Awaiting explanation</option>
                                          <option value="resolved">Resolved</option>
                                          <option value="dismissed">Dismissed</option>
                                        </select>
                                      </div>
                                      {(resolveReason[id] !== undefined ||
                                        (statusDraft[id] ?? ex.status) === 'resolved') && (
                                          <div className="min-w-[220px]">
                                            <div className="text-xs text-slate-500 mb-1">Resolve reason</div>
                                            <input
                                              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                                              placeholder="Resolve reason"
                                              value={resolveReason[id] ?? ''}
                                              onChange={(e) =>
                                                setResolveReason((p) => ({ ...p, [id]: e.target.value }))
                                              }
                                            />
                                          </div>
                                        )}
                                      <button
                                        onClick={() => handleSubmit(ex)}
                                        className="self-end rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                                      >
                                        Submit
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })
                  ) : null}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
