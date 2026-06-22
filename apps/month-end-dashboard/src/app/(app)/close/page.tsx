import { Suspense } from 'react'
import { Prisma } from '@prisma/client'
import {
  getActiveOrgId,
  getRangeFromDate,
  getRangeToDate,
} from '@/lib/active'
import { ensureOrgAccess } from '@/lib/auth/ensureOrgAccess'
import { prisma } from '@/lib/db/prisma'
import { redirect } from 'next/navigation'
import { isoToUTCDateOnly } from '@/lib/dates/dateOnly'
import { DateRangePicker } from './DateRangePicker'
import { ExceptionsListWithToast } from './ExceptionsListWithToast'
import { RulesAdmin } from './RulesAdmin'
import { CollapsibleSection } from '@/components/close/CollapsibleSection'
import { ExceptionsCountCard, ExceptionsDollarCard } from '@/components/close/ExceptionsOverview'
import { CloseProgressCard } from '@/components/close/CloseProgressCard'
import { LoadingStats } from '@/components/ui/LoadingStates'
import { buildCloseSummary, CloseSnapshot } from '@/lib/closeSummary'
import { CloseSummaryCard } from '@/app/(app)/close/CloseSummaryCard'
import { requireScreen } from '@/lib/auth/guard'
import type { AppUser } from '@/lib/auth/appUser'
import { CloseTabs } from './CloseTabs'
import { CloseWorkflowTab } from './CloseWorkflowTab'
import { ensureProjectSchema } from '@/lib/projects/schema'

async function DashboardStats({
  orgId,
  rangeFromDate,
  rangeToDate,
  snapshotId,
  viewer,
}: {
  orgId: string
  rangeFromDate: string | null
  rangeToDate: string | null
  snapshotId: string | null
  viewer: AppUser
}) {
  let tbSnapshot = snapshotId
    ? await prisma.tbSnapshot.findUnique({
      where: { id: snapshotId },
    })
    : null

  if (!tbSnapshot && rangeFromDate && rangeToDate) {
    tbSnapshot = await prisma.tbSnapshot.findFirst({
      where: {
        org_id: orgId,
        range_from_date: isoToUTCDateOnly(rangeFromDate),
        range_to_date: isoToUTCDateOnly(rangeToDate),
      },
      orderBy: { source: 'desc' },
    })
  }

  if (!tbSnapshot) {
    tbSnapshot = await prisma.tbSnapshot.findFirst({
      where: { org_id: orgId },
      orderBy: { imported_at: 'desc' },
    })
  }

  const snapshotWithLines = tbSnapshot
    ? await prisma.tbSnapshot.findUnique({
      where: { id: tbSnapshot.id },
      include: { tb_lines: true },
    })
    : null

  const toNumber = (v: any) => {
    if (v == null) return 0
    if (typeof v === "number") return v
    if (typeof v === "string") return Number(v) || 0
    if (typeof v === "object" && typeof (v as any).toNumber === "function") return (v as any).toNumber()
    return Number(v) || 0
  }

  const tbLinesPlain = (snapshotWithLines?.tb_lines ?? []).map((l: any) => ({
    id: l.id,
    snapshot_id: l.snapshot_id,
    account_number: l.account_number ?? "",
    account_name: l.account_name ?? "",
    account_type: l.account_type ?? "",
    debit: toNumber(l.debit),
    credit: toNumber(l.credit),
    balance: toNumber(l.balance),
    currency: l.currency ?? null,
  }))

  const exceptionsRaw = tbSnapshot
    ? await prisma.exception.findMany({
      where: { snapshot_id: tbSnapshot.id },
      include: {
        rule: { select: { id: true, name: true, severity: true } },
      },
      orderBy: [{ severity: 'desc' }, { created_at: 'desc' }],
    })
    : []

  const exceptions = exceptionsRaw.map((e: any) => {
    const num = (v: any) => (v == null ? null : typeof v === "number" ? v : Number(v));
    return {
      ...e,
      balance: num(e.balance),
      target_value: num(e.target_value),
      variance_amount: num(e.variance_amount),
      variance_pct: num(e.variance_pct),
      value_signed: num(e.value_signed),
      value_abs: num(e.value_abs),
      baseline_value: num(e.baseline_value),
      delta_abs: num(e.delta_abs),
      delta_pct: num(e.delta_pct),
      risk_score: num(e.risk_score),
      threshold_abs: num(e.threshold_abs),
      threshold_pos: num(e.threshold_pos),
      threshold_neg: num(e.threshold_neg),
      variance_threshold: num(e.variance_threshold),
    }
  })

  const scopedExceptions = viewer.role === 'admin'
    ? exceptions
    : exceptions.filter((e: any) => (e.owner_user_id || '') === viewer.id)

  const severityOrder: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 }
  const chooseSeverity = (a?: string | null, b?: string | null) => {
    const sa = (a || '').toLowerCase()
    const sb = (b || '').toLowerCase()
    return (severityOrder[sa] ?? -1) >= (severityOrder[sb] ?? -1) ? sa : sb
  }

  const snapshot: CloseSnapshot = {
    periodStart: rangeFromDate,
    periodEnd: rangeToDate,
    totalAccounts: tbLinesPlain.length,
    exceptionsTotal: scopedExceptions.length,
    openCount: scopedExceptions.filter((r: any) => {
      const s = (r.status || '').toLowerCase()
      return s !== 'resolved' && s !== 'complete' && !r.resolved_at
    }).length,
    closedCount: scopedExceptions.filter((r: any) => {
      const s = (r.status || '').toLowerCase()
      return s === 'resolved' || s === 'complete' || !!r.resolved_at
    }).length,
    exceptionsBySeverity: scopedExceptions.reduce(
      (acc: any, ex: any) => {
        const sev = (ex.rule?.severity || ex.severity || '').toLowerCase()
        if (sev === 'critical') acc.critical += 1
        else if (sev === 'medium') acc.medium += 1
        else acc.low += 1
        return acc
      },
      { critical: 0, medium: 0, low: 0 }
    ),
    dollarTotalActivity: tbLinesPlain.reduce((sum: number, l: any) => {
      const net = (l.debit ?? 0) - (l.credit ?? 0)
      return sum + Math.abs(net)
    }, 0),
    dollarExceptionActivity: scopedExceptions.reduce((sum: number, ex: any) => {
      return sum + Math.abs(ex.balance ?? 0)
    }, 0),
    topExceptions: scopedExceptions
      .map((ex: any) => ({
        account: ex.account_name || 'Account',
        rule: ex.rule?.name || 'Rule',
        amount: ex.balance ?? 0,
        severity: (ex.rule?.severity || ex.severity || 'medium').toLowerCase() as any,
      }))
      .sort((a: any, b: any) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 5)
      .map((ex: any) => ({ ...ex, severity: ex.severity === 'high' ? 'medium' : ex.severity })),
    topRules: Object.values(
      scopedExceptions.reduce((acc: any, ex: any) => {
        const key = ex.rule?.name || 'Rule'
        const sev = (ex.rule?.severity || ex.severity || 'medium').toLowerCase()
        if (!acc[key]) acc[key] = { rule: key, count: 0, severity: sev }
        acc[key].count += 1
        acc[key].severity = chooseSeverity(acc[key].severity, sev)
        return acc
      }, {} as Record<string, any>)
    )
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 5)
      .map((r: any) => ({ ...r, severity: r.severity === 'high' ? 'medium' : r.severity })),
  }

  const summary = buildCloseSummary(snapshot)

  return (
    <div className="space-y-4">
      <CloseSummaryCard summary={summary} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-stretch">
        <ExceptionsCountCard exceptions={scopedExceptions} tbLines={tbLinesPlain} />
        <ExceptionsDollarCard exceptions={scopedExceptions} tbLines={tbLinesPlain} />
        <CloseProgressCard exceptions={scopedExceptions} tbLines={tbLinesPlain} />
      </div>
    </div>
  )
}

async function ExceptionsSection({
  orgId,
  rangeFromDate,
  rangeToDate,
  snapshotId,
  viewer,
}: {
  orgId: string
  rangeFromDate: string | null
  rangeToDate: string | null
  snapshotId: string | null
  viewer: AppUser
}) {
  await ensureProjectSchema()

  let tbSnapshot = snapshotId
    ? await prisma.tbSnapshot.findUnique({ where: { id: snapshotId } })
    : null

  if (!tbSnapshot && rangeFromDate && rangeToDate) {
    tbSnapshot = await prisma.tbSnapshot.findFirst({
      where: {
        org_id: orgId,
        range_from_date: isoToUTCDateOnly(rangeFromDate),
        range_to_date: isoToUTCDateOnly(rangeToDate),
      },
      orderBy: { source: 'desc' },
    })
  }

  if (!tbSnapshot) {
    tbSnapshot = await prisma.tbSnapshot.findFirst({
      where: { org_id: orgId },
      orderBy: { imported_at: 'desc' },
    })
  }

  const rulesRaw = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT r.*, (
      SELECT COUNT(*)::int FROM med2.exceptions e WHERE e.rule_id = r.id
    ) AS exceptions_count
    FROM med2.rules r
    WHERE r.org_id = ${orgId}::uuid
      AND COALESCE(r.domain, 'GL') = 'GL'
    ORDER BY r.created_at DESC
  `)

  const rules = rulesRaw.map((r: any) => {
    const num = (v: any) => (v == null ? null : typeof v === "number" ? v : Number(v));
    return {
      ...r,
      threshold_abs: num(r.threshold_abs),
      threshold_pos: num(r.threshold_pos),
      threshold_neg: num(r.threshold_neg),
      variance_threshold: num(r.variance_threshold),
      _count: { exceptions: Number(r.exceptions_count || 0) },
    }
  })

  const exceptionsRaw = tbSnapshot
    ? await prisma.exception.findMany({
      where: { snapshot_id: tbSnapshot.id },
      include: {
        rule: { select: { id: true, name: true, severity: true } },
      },
      orderBy: [{ severity: 'desc' }, { created_at: 'desc' }],
    })
    : []

  const exceptions = exceptionsRaw.map((e: any) => {
    const num = (v: any) => (v == null ? null : typeof v === "number" ? v : Number(v));
    return {
      ...e,
      balance: num(e.balance),
      target_value: num(e.target_value),
      variance_amount: num(e.variance_amount),
      variance_pct: num(e.variance_pct),
      value_signed: num(e.value_signed),
      value_abs: num(e.value_abs),
      baseline_value: num(e.baseline_value),
      delta_abs: num(e.delta_abs),
      delta_pct: num(e.delta_pct),
      risk_score: num(e.risk_score),
      threshold_abs: num(e.threshold_abs),
      threshold_pos: num(e.threshold_pos),
      threshold_neg: num(e.threshold_neg),
      variance_threshold: num(e.variance_threshold),
    }
  })

  const users = await prisma.user.findMany({
    where: { is_active: true },
    select: { id: true, email: true, role: true },
    orderBy: { email: 'asc' },
  })

  const scopedExceptions = viewer.role === 'admin'
    ? exceptions
    : exceptions.filter((e: any) => (e.owner_user_id || '') === viewer.id)

  const statusCounts = scopedExceptions.reduce(
    (acc, ex: any) => {
      const status = (ex.status || '').toLowerCase()
      if (status === 'awaiting_explanation') acc.awaiting += 1
      else if (status === 'resolved') acc.resolved += 1
      else acc.open += 1
      return acc
    },
    { open: 0, awaiting: 0, resolved: 0 }
  )

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-slate-500">My Work</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{statusCounts.open}</div>
          <div className="text-sm text-slate-600">Open</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-slate-500">Awaiting</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{statusCounts.awaiting}</div>
          <div className="text-sm text-slate-600">Awaiting explanation</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase text-slate-500">Resolved</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{statusCounts.resolved}</div>
          <div className="text-sm text-slate-600">Completed items</div>
        </div>
      </div>
      <CollapsibleSection title="Exceptions" defaultOpen={true}>
        <ExceptionsListWithToast orgId={orgId} exceptions={scopedExceptions} viewer={viewer} users={users} />
      </CollapsibleSection>
      <CollapsibleSection title="Rules" defaultOpen={false}>
        <RulesAdmin orgId={orgId} snapshotId={tbSnapshot?.id ?? null} rules={rules} />
      </CollapsibleSection>
    </div>
  )
}

export default async function ClosePage() {
  const viewer = await requireScreen('home')

  const activeOrgId = await getActiveOrgId()
  if (!activeOrgId) redirect('/org')

  // Run org lookup, org access check, and cookie reads in parallel
  const [org, , rangeFromDateVal, rangeToDateVal] = await Promise.all([
    prisma.org.findUnique({ where: { id: activeOrgId } }),
    ensureOrgAccess(activeOrgId),
    getRangeFromDate(),
    getRangeToDate(),
  ])
  if (!org) redirect('/org')

  let rangeFromDate = rangeFromDateVal
  let rangeToDate = rangeToDateVal

  let tbSnapshot = rangeFromDate && rangeToDate
    ? await prisma.tbSnapshot.findFirst({
      where: {
        org_id: activeOrgId,
        range_from_date: isoToUTCDateOnly(rangeFromDate),
        range_to_date: isoToUTCDateOnly(rangeToDate),
      },
      orderBy: { source: 'desc' },
    })
    : null

  // Fallback: if no snapshot for selected range, pick latest snapshot and update range cookies
  if (!tbSnapshot) {
    const latest = await prisma.tbSnapshot.findFirst({
      where: { org_id: activeOrgId },
      orderBy: { imported_at: 'desc' },
    })
    if (latest) {
      rangeFromDate = latest.range_from_date.toISOString().slice(0, 10)
      rangeToDate = latest.range_to_date.toISOString().slice(0, 10)
      tbSnapshot = latest
    }
  }

  const exceptionsRaw = tbSnapshot
    ? await prisma.exception.findMany({
      where: { snapshot_id: tbSnapshot.id },
      include: {
        rule: { select: { id: true, name: true, severity: true } },
      },
      orderBy: [{ severity: 'desc' }, { created_at: 'desc' }],
    })
    : []

  const openWorkflowExceptions = exceptionsRaw.filter((r: any) => {
    const s = (r.status || '').toLowerCase()
    return s !== 'resolved' && s !== 'complete' && !r.resolved_at
  }).length
  const periodRangeLabel = rangeFromDate && rangeToDate ? `${rangeFromDate} → ${rangeToDate}` : null

  const overviewContent = (
    <>
      {!rangeFromDate || !rangeToDate ? (
        <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-blue-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">No date range selected</h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>Select a date range above to view close status and exceptions.</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <Suspense fallback={<LoadingStats />}>
            <DashboardStats orgId={activeOrgId} rangeFromDate={rangeFromDate} rangeToDate={rangeToDate} snapshotId={tbSnapshot?.id ?? null} viewer={viewer} />
          </Suspense>

          <Suspense fallback={<div className="text-center py-8 text-slate-500">Loading exceptions...</div>}>
            <ExceptionsSection orgId={activeOrgId} rangeFromDate={rangeFromDate} rangeToDate={rangeToDate} snapshotId={tbSnapshot?.id ?? null} viewer={viewer} />
          </Suspense>
        </>
      )}
    </>
  )

  const workflowContent = (
    <CloseWorkflowTab
      orgName={org.name || 'Organization'}
      periodRange={periodRangeLabel || undefined}
      snapshotSource={tbSnapshot?.source ?? null}
      openExceptions={openWorkflowExceptions}
      totalExceptions={exceptionsRaw.length}
    />
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30">
      <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
        {/* Enhanced Header with Quick Actions */}
        <div className="bg-gradient-to-br from-blue-50 via-white to-purple-50 rounded-3xl border border-slate-200/60 p-8 shadow-sm">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">
                Close Dashboard
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <DateRangePicker
                rangeFromDate={rangeFromDate}
                rangeToDate={rangeToDate}
                orgId={activeOrgId}
                snapshotId={tbSnapshot?.id ?? null}
              />
            </div>
          </div>
        </div>

        <CloseTabs overview={overviewContent} workflow={workflowContent} />
      </div>
    </div>
  )
}
