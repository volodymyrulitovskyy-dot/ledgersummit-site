import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Prisma } from '@prisma/client'
import { requireScreen } from '@/lib/auth/guard'
import { getActiveOrgId, getRangeFromDate, getRangeToDate } from '@/lib/active'
import { prisma } from '@/lib/db/prisma'
import { isoToUTCDateOnly } from '@/lib/dates/dateOnly'
import { ensureProjectSchema } from '@/lib/projects/schema'
import { buildAndStoreProjectPnlSnapshot, loadProjectPnlSnapshot, loadProjectPnlDebug } from '@/lib/projects/projectPnlSnapshot'

import { ExceptionsListWithToast } from '@/app/(app)/close/ExceptionsListWithToast'
import { RunProjectChecksPanel } from './RunProjectChecksPanel'

const NOT_SPECIFIED_WARNING_THRESHOLD = 0.1

function num(v: unknown) {
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function toDateOnlyUTC(date: Date) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default async function ProjectsPage() {
  const viewer = await requireScreen('projects')
  await ensureProjectSchema()

  const activeOrgId = await getActiveOrgId()
  if (!activeOrgId) redirect('/org')

  const qboConnection = await prisma.qboConnection.findUnique({
    where: { org_id: activeOrgId },
    select: { realm_id: true },
  })

  let rangeFromDate = await getRangeFromDate()
  let rangeToDate = await getRangeToDate()

  let snapshot = rangeFromDate && rangeToDate
    ? await prisma.tbSnapshot.findFirst({
      where: {
        org_id: activeOrgId,
        range_from_date: isoToUTCDateOnly(rangeFromDate),
        range_to_date: isoToUTCDateOnly(rangeToDate),
      },
      orderBy: { source: 'desc' },
    })
    : null

  if (!snapshot) {
    snapshot = await prisma.tbSnapshot.findFirst({
      where: { org_id: activeOrgId },
      orderBy: { imported_at: 'desc' },
    })
    if (snapshot) {
      rangeFromDate = toDateOnlyUTC(snapshot.range_from_date)
      rangeToDate = toDateOnlyUTC(snapshot.range_to_date)
    }
  }

  const snapshotId = snapshot?.id ?? null

  let projectSnapshot = snapshotId ? await loadProjectPnlSnapshot(snapshotId) : null
  if (!projectSnapshot && snapshotId && rangeFromDate && rangeToDate) {
    try {
      projectSnapshot = await buildAndStoreProjectPnlSnapshot(activeOrgId, snapshotId, rangeFromDate, rangeToDate)
    } catch {
      projectSnapshot = null
    }
  }
  let projectDebug = snapshotId ? await loadProjectPnlDebug(snapshotId) : null
  const shouldRefreshDebug =
    !!snapshotId &&
    !!rangeFromDate &&
    !!rangeToDate &&
    !!projectSnapshot &&
    (
      !projectDebug ||
      (projectDebug.colsRaw === 0 && projectSnapshot.rows.length > 0)
    )
  if (shouldRefreshDebug) {
    try {
      projectSnapshot = await buildAndStoreProjectPnlSnapshot(activeOrgId, snapshotId, rangeFromDate!, rangeToDate!)
      projectDebug = await loadProjectPnlDebug(snapshotId)
    } catch {
      // Keep rendering from stored snapshot even if parser/debug refresh fails.
    }
  }
  // Fetch prior snapshot for margin drop comparison
  const priorSnapshot = snapshot
    ? await prisma.tbSnapshot.findFirst({
      where: {
        org_id: activeOrgId,
        imported_at: { lt: snapshot.imported_at },
      },
      orderBy: { imported_at: 'desc' },
    })
    : null



  const projectExceptionsRaw = snapshotId
    ? await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT e.*, r.name AS rule_name, r.severity AS rule_severity
      FROM med2.exceptions e
      LEFT JOIN med2.rules r ON r.id = e.rule_id
      WHERE e.snapshot_id = ${snapshotId}::uuid
        AND COALESCE(e.domain, 'GL') = 'PROJECT_PNL'
      ORDER BY COALESCE(e.risk_score, 0) DESC, e.created_at DESC
    `)
    : []

  const exceptions = projectExceptionsRaw.map((e) => ({
    id: String(e.id),
    status: String(e.status || 'open'),
    severity: String(e.severity || 'medium'),
    title: (e.title as string | null) || null,
    details: (e.details as string | null) || null,
    account_name: (e.entity_name as string | null) || (e.account_name as string | null) || null,
    account_number: (e.entity_key as string | null) || null,
    balance: e.balance == null ? null : num(e.balance),
    target_value: e.target_value == null ? null : num(e.target_value),
    variance_amount: e.variance_amount == null ? null : num(e.variance_amount),
    variance_pct: e.variance_pct == null ? null : num(e.variance_pct),
    owner_name: (e.owner_name as string | null) || null,
    owner_user_id: (e.owner_user_id as string | null) || null,
    resolved_reason: (e.resolved_reason as string | null) || null,
    created_at: String(e.created_at || new Date().toISOString()),
    rule_id: String(e.rule_id || ''),
    metric: String(e.metric || ''),
    domain: 'PROJECT_PNL',
    risk_score: e.risk_score == null ? null : num(e.risk_score),
    rule: {
      id: String(e.rule_id || ''),
      name: String(e.rule_name || 'Rule'),
      severity: String(e.rule_severity || e.severity || 'medium'),
    },
  }))

  const users = await prisma.user.findMany({
    where: { is_active: true },
    select: { id: true, email: true, role: true },
    orderBy: { email: 'asc' },
  })

  const scopedExceptions = viewer.role === 'admin'
    ? exceptions
    : exceptions.filter((e) => (e.owner_user_id || '') === viewer.id)

  const snapshotRows = projectSnapshot?.rows || []
  const snapshotTotals = projectSnapshot?.totals
  const totalRevenueSigned = num(snapshotTotals?.totalRevenueSigned)
  const totalCogsSigned = num(snapshotTotals?.totalCogsSigned)
  const totalGrossProfitSigned = num(snapshotTotals?.totalGrossProfitSigned)
  const totalRevenueAbs = Math.abs(totalRevenueSigned)
  const notSpecifiedRevenueAbs = Math.abs(num(snapshotTotals?.notSpecifiedRevenueSigned))
  const notSpecifiedPct = totalRevenueAbs > 0 ? notSpecifiedRevenueAbs / totalRevenueAbs : 0
  const minRevenue = snapshotRows.length ? Math.min(...snapshotRows.map((r) => r.revenueSigned)) : 0
  const maxRevenue = snapshotRows.length ? Math.max(...snapshotRows.map((r) => r.revenueSigned)) : 0
  const minCogs = snapshotRows.length ? Math.min(...snapshotRows.map((r) => r.cogsSigned)) : 0
  const maxCogs = snapshotRows.length ? Math.max(...snapshotRows.map((r) => r.cogsSigned)) : 0
  const minGp = snapshotRows.length ? Math.min(...snapshotRows.map((r) => r.grossProfitSigned)) : 0
  const maxGp = snapshotRows.length ? Math.max(...snapshotRows.map((r) => r.grossProfitSigned)) : 0
  const activeCustomers = snapshotRows.filter((r) => r.revenueAbs !== 0 || r.cogsAbs !== 0).length
  const topCustomersByRevenue = [...snapshotRows]
    .sort((a, b) => b.revenueAbs - a.revenueAbs)
    .slice(0, 10)
  const parserTotals = projectDebug?.totals

  // ----- Phase 2: Executive Summary Metrics -----
  const lossMakingProjects = snapshotRows.filter((r) => r.grossProfitSigned < 0)
  const noCogs = snapshotRows.filter((r) => r.revenueAbs > 0 && r.cogsAbs === 0)
  const noRevenue = snapshotRows.filter((r) => r.revenueAbs === 0 && r.cogsAbs > 0)

  // Top 3 customer concentration
  const sortedByRev = [...snapshotRows].sort((a, b) => b.revenueAbs - a.revenueAbs)
  const top3Customers = sortedByRev.slice(0, 3)
  const top3Rev = top3Customers.reduce((s, r) => s + r.revenueAbs, 0)
  const concentrationPct = totalRevenueAbs > 0 ? top3Rev / totalRevenueAbs : 0

  // Largest margin drop vs prior
  let largestMarginDrop: { name: string; currentGpPct: number; priorGpPct: number; delta: number } | null = null
  if (priorSnapshot) {
    const priorPnl = await loadProjectPnlSnapshot(priorSnapshot.id)
    if (priorPnl) {
      const priorMap = new Map(priorPnl.rows.map((r) => [r.customerKey, r]))
      for (const row of snapshotRows) {
        const prior = priorMap.get(row.customerKey)
        if (!prior) continue
        const currentGpPct = row.gpPercent ?? 0
        const priorGpPct = prior.gpPercent ?? 0
        const delta = currentGpPct - priorGpPct
        if (delta < 0 && (!largestMarginDrop || delta < largestMarginDrop.delta)) {
          largestMarginDrop = { name: row.customerName, currentGpPct, priorGpPct, delta }
        }
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30">
      <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
        <div className="bg-gradient-to-br from-blue-50 via-white to-purple-50 rounded-3xl border border-slate-200/60 p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Projects</h1>
          <p className="text-sm text-slate-600">
            Project checks use QBO P&L by customer for the active period
            {rangeFromDate && rangeToDate ? ` (${rangeFromDate} to ${rangeToDate})` : ''}.
          </p>
        </div>

        {!qboConnection ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 shadow-sm">
            No QBO connection found for this organization. Connect QuickBooks from Home before running project checks.
          </div>
        ) : !snapshotId ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            No active TB snapshot found. Refresh QBO from Home first.
          </div>
        ) : null}

        {notSpecifiedPct > NOT_SPECIFIED_WARNING_THRESHOLD ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Not Specified revenue is {(notSpecifiedPct * 100).toFixed(1)}% of total revenue. This means transactions are missing customer assignment.
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase text-slate-500">Total Customers</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{snapshotRows.length}</div>
            <div className="text-xs text-slate-500">active: {activeCustomers}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase text-slate-500">Project Exceptions</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{scopedExceptions.length}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase text-slate-500">Revenue Total</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{totalRevenueSigned.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase text-slate-500">COGS Total</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{totalCogsSigned.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase text-slate-500">GP Total</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{totalGrossProfitSigned.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
        </div>

        {/* Executive Summary Box */}
        {snapshotRows.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Executive Summary</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                <div className="text-xs uppercase text-red-700 font-medium">Loss-Making Projects</div>
                <div className="mt-1 text-2xl font-bold text-red-900">{lossMakingProjects.length}</div>
                {lossMakingProjects.length > 0 && (
                  <div className="text-xs text-red-600 mt-1 truncate" title={lossMakingProjects.map((r) => r.customerName).join(', ')}>
                    {lossMakingProjects.slice(0, 3).map((r) => r.customerName).join(', ')}{lossMakingProjects.length > 3 ? ` +${lossMakingProjects.length - 3}` : ''}
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                <div className="text-xs uppercase text-amber-700 font-medium">Revenue, No COGS</div>
                <div className="mt-1 text-2xl font-bold text-amber-900">{noCogs.length}</div>
                <div className="text-xs text-amber-600 mt-1">Possible missing cost allocation</div>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                <div className="text-xs uppercase text-amber-700 font-medium">COGS, No Revenue</div>
                <div className="mt-1 text-2xl font-bold text-amber-900">{noRevenue.length}</div>
                <div className="text-xs text-amber-600 mt-1">Possible unrecognised revenue</div>
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <div className="text-xs uppercase text-blue-700 font-medium">Top 3 Concentration</div>
                <div className={`mt-1 text-2xl font-bold ${concentrationPct > 0.6 ? 'text-red-900' : 'text-blue-900'}`}>
                  {(concentrationPct * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-blue-600 mt-1 truncate" title={top3Customers.map((r) => r.customerName).join(', ')}>
                  {top3Customers.map((r) => r.customerName).join(', ')}
                </div>
              </div>
              <div className="rounded-xl border border-purple-100 bg-purple-50 p-4">
                <div className="text-xs uppercase text-purple-700 font-medium">Largest Margin Drop</div>
                {largestMarginDrop ? (
                  <>
                    <div className="mt-1 text-2xl font-bold text-purple-900">{(largestMarginDrop.delta * 100).toFixed(1)}pp</div>
                    <div className="text-xs text-purple-600 mt-1 truncate" title={largestMarginDrop.name}>
                      {largestMarginDrop.name}: {(largestMarginDrop.priorGpPct * 100).toFixed(0)}% → {(largestMarginDrop.currentGpPct * 100).toFixed(0)}%
                    </div>
                  </>
                ) : (
                  <div className="mt-1 text-sm text-purple-600">No prior data</div>
                )}
              </div>
            </div>
          </div>
        )}

        <RunProjectChecksPanel orgId={activeOrgId} snapshotId={snapshotId} />

        <details className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">Project Data (Debug)</summary>
          <div className="mt-3 space-y-3 text-xs text-slate-700">
            <div>
              <div className="font-semibold text-slate-900">QBO Request Params</div>
              <div>start_date: {projectDebug?.request.start_date || rangeFromDate || '—'}</div>
              <div>end_date: {projectDebug?.request.end_date || rangeToDate || '—'}</div>
              <div>summarize_column_by: Customers</div>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Columns Detected (first 15)</div>
              <div>{(projectDebug?.columnsDetected || []).slice(0, 15).join(', ') || '—'}</div>
              <div className="mt-1 text-slate-500">raw: {projectDebug?.colsRaw ?? 0}, customers(filtered): {projectDebug?.colsCustomers ?? 0}</div>
              <div className="mt-1 text-slate-500">raw top3 titles: {(projectDebug?.columnTitlesRawTop3 || []).join(', ') || '—'}</div>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Row Groups</div>
              <div>Income found: {projectDebug?.hasIncome ? 'yes' : 'no'}</div>
              <div>COGS found: {projectDebug?.hasCogs ? 'yes' : 'no'}</div>
              <div className="text-slate-500">raw top3 headers: {(projectDebug?.rowGroupHeadersTop3 || []).join(', ') || '—'}</div>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Top 10 Customers by Revenue</div>
              {topCustomersByRevenue.length ? (
                <ul className="list-disc pl-5">
                  {topCustomersByRevenue.map((r) => (
                    <li key={`${r.customerKey}-${r.customerName}`}>{r.customerName}: {r.revenueSigned.toLocaleString(undefined, { maximumFractionDigits: 2 })}</li>
                  ))}
                </ul>
              ) : (
                <div>—</div>
              )}
            </div>
            <div>
              <div className="font-semibold text-slate-900">Not Specified</div>
              <div>
                Revenue: {(snapshotTotals?.notSpecifiedRevenueSigned ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ({(notSpecifiedPct * 100).toFixed(2)}% of total revenue)
              </div>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Stored Snapshot</div>
              <div>rows: {snapshotRows.length}</div>
              <div>min/max revenue: {minRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })} / {maxRevenue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
              <div>min/max cogs: {minCogs.toLocaleString(undefined, { maximumFractionDigits: 2 })} / {maxCogs.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
              <div>min/max gp: {minGp.toLocaleString(undefined, { maximumFractionDigits: 2 })} / {maxGp.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
              <div>sample rows:</div>
              <pre className="overflow-x-auto rounded bg-slate-50 p-2 text-[11px]">
                {JSON.stringify(snapshotRows.slice(0, 10), null, 2)}
              </pre>
            </div>
            <div>
              <div className="font-semibold text-slate-900">Totals Reconciliation</div>
              <div>
                Parser totals: revenue={num(parserTotals?.totalRevenueSigned).toLocaleString(undefined, { maximumFractionDigits: 2 })}, cogs={num(parserTotals?.totalCogsSigned).toLocaleString(undefined, { maximumFractionDigits: 2 })}, gp={num(parserTotals?.totalGrossProfitSigned).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              <div>
                Snapshot totals: revenue={totalRevenueSigned.toLocaleString(undefined, { maximumFractionDigits: 2 })}, cogs={totalCogsSigned.toLocaleString(undefined, { maximumFractionDigits: 2 })}, gp={totalGrossProfitSigned.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
            {projectDebug?.rawPreview ? (
              <div>
                <div className="font-semibold text-slate-900">Raw QBO JSON Preview (first 2000 chars)</div>
                <pre className="overflow-x-auto rounded bg-slate-50 p-2 text-[11px]">{projectDebug.rawPreview}</pre>
              </div>
            ) : null}
          </div>
        </details>

        <div className="flex justify-end">
          <Link
            href="/rules?tab=project"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Manage Project Rules →
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Project Exceptions</h2>
          <ExceptionsListWithToast exceptions={scopedExceptions as unknown[]} orgId={activeOrgId} viewer={viewer} users={users} />
        </div>
      </div>
    </div>
  )
}
