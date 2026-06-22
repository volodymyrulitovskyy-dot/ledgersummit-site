import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { qboFetchForOrg } from '@/lib/qbo/qboFetchForOrg'
import { ensureProjectSchema } from './schema'

export type ProjectMetricRow = {
  customerKey: string
  customerName: string
  isNotSpecified: boolean
  revenueSigned: number
  revenueAbs: number
  cogsSigned: number
  cogsAbs: number
  grossProfitSigned: number
  grossProfitAbs: number
  gpPercent: number
}

export type ProjectSnapshotTotals = {
  totalRevenueSigned: number
  totalRevenueAbs: number
  totalCogsSigned: number
  totalCogsAbs: number
  totalGrossProfitSigned: number
  totalGrossProfitAbs: number
  totalGpPercent: number
  notSpecifiedRevenueSigned: number
  notSpecifiedRevenueAbs: number
  notSpecifiedCogsSigned: number
  notSpecifiedCogsAbs: number
  notSpecifiedGrossProfitSigned: number
  notSpecifiedGrossProfitAbs: number
}

export type ProjectPnlSnapshot = {
  rows: ProjectMetricRow[]
  totals: ProjectSnapshotTotals
}

export type ProjectPnlDebug = {
  request: {
    start_date: string
    end_date: string
    summarize_column_by: 'Customers'
  }
  colsRaw: number
  columnTitlesRawTop3: string[]
  rowGroupHeadersTop3: string[]
  colsCustomers: number
  hasIncome: boolean
  hasCogs: boolean
  columnsDetected: string[]
  topCustomersByRevenue: Array<{ name: string; revenue: number }>
  notSpecifiedRevenue: number
  notSpecifiedPctOfTotalRevenue: number
  totals: ProjectSnapshotTotals
  rawPreview?: string | null
}

type QboColumn = {
  ColTitle?: string
  colTitle?: string
  MetaData?: Array<{ Name?: string; Value?: string }>
  metaData?: Array<{ Name?: string; Value?: string }>
}
type QboRow = {
  type?: string
  group?: string
  Header?: { ColData?: Array<{ value?: string }> }
  header?: { ColData?: Array<{ value?: string }> }
  ColData?: Array<{ value?: string; id?: string }>
  colData?: Array<{ value?: string; id?: string }>
  Rows?: { Row?: QboRow[] }
  rows?: { Row?: QboRow[]; row?: QboRow[] }
}

type CustomerColumn = {
  index: number
  title: string
  key: string
  isNotSpecified: boolean
}

const NOT_SPECIFIED_KEY = 'not_specified'

function normalizeDateOnly(input: string): string {
  const s = String(input || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10)
  const dt = new Date(s)
  if (!Number.isFinite(dt.getTime())) return s.slice(0, 10)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const asNumber = (v: unknown) => {
  if (v == null) return 0
  const s = String(v).trim()
  if (!s || s === '-' || s === '—') return 0
  const neg = /^\(.*\)$/.test(s)
  const n = Number(s.replace(/[$,()]/g, ''))
  if (!Number.isFinite(n)) return 0
  return neg ? -n : n
}

const normKey = (label: string) =>
  label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, '_') || 'unknown'

function classifySection(group?: string, label?: string): 'revenue' | 'cogs' | null {
  const g = String(group || '').toLowerCase()
  const l = String(label || '').toLowerCase()
  if (g.includes('income') || g.includes('revenue') || l.includes('income') || l.includes('revenue')) {
    return 'revenue'
  }
  if (
    g.includes('cost of goods') ||
    g.includes('costofgoods') ||
    g.includes('cogs') ||
    l.includes('cost of goods') ||
    l.includes('costofgoods') ||
    l.includes('cogs')
  ) {
    return 'cogs'
  }
  return null
}

function extractColumnKey(col?: QboColumn): string | null {
  if (!col) return null
  const md = col.MetaData || col.metaData || []
  const id =
    md.find((m) => m?.Name?.toLowerCase() === 'colkey')?.Value ||
    md.find((m) => m?.Name?.toLowerCase() === 'id')?.Value ||
    null
  return id ? id.trim() : null
}

function getCustomerColumns(columns: QboColumn[]): CustomerColumn[] {
  const out: CustomerColumn[] = []
  for (let i = 1; i < columns.length; i++) {
    const title = String(columns[i]?.ColTitle || columns[i]?.colTitle || '').trim()
    if (!title) continue
    if (/^total\s+/i.test(title)) continue
    if (/^total$/i.test(title)) continue
    const isNotSpecified = title.toLowerCase() === 'not specified'
    const rawKey = extractColumnKey(columns[i])
    const key = isNotSpecified ? NOT_SPECIFIED_KEY : rawKey || normKey(title)
    out.push({ index: i, title, key, isNotSpecified })
  }
  return out
}

function buildRows(
  report: unknown,
  request: { start_date: string; end_date: string; summarize_column_by: 'Customers' }
): { snapshot: ProjectPnlSnapshot; debug: ProjectPnlDebug } {
  const reportRoot = (report || {}) as Record<string, unknown>
  const reportObj = (
    (typeof reportRoot.Report === 'object' ? reportRoot.Report : null) ||
    (typeof reportRoot.report === 'object' ? reportRoot.report : null) ||
    reportRoot
  ) as {
    Columns?: { Column?: QboColumn[] }
    columns?: { Column?: QboColumn[]; column?: QboColumn[] }
    Rows?: { Row?: QboRow[] }
    rows?: { Row?: QboRow[]; row?: QboRow[] }
  }
  const columns = (
    reportObj.Columns?.Column ||
    reportObj.columns?.Column ||
    reportObj.columns?.column ||
    []
  ) as QboColumn[]
  const customerCols = getCustomerColumns(columns)
  const buckets = new Map<string, ProjectMetricRow>()
  const rootRows = ((reportObj.Rows?.Row || reportObj.rows?.Row || reportObj.rows?.row || []) as QboRow[])
  const columnTitlesRawTop3 = columns.slice(0, 3).map((c) => String(c?.ColTitle || c?.colTitle || '').trim()).filter(Boolean)
  const rowGroupHeadersTop3 = rootRows
    .slice(0, 3)
    .map((r) => String(r.group || r.Header?.ColData?.[0]?.value || r.header?.ColData?.[0]?.value || '').trim())
    .filter(Boolean)
  let hasIncome = false
  let hasCogs = false

  for (const col of customerCols) {
    buckets.set(col.key, {
      customerKey: col.key,
      customerName: col.title,
      isNotSpecified: col.isNotSpecified,
      revenueSigned: 0,
      revenueAbs: 0,
      cogsSigned: 0,
      cogsAbs: 0,
      grossProfitSigned: 0,
      grossProfitAbs: 0,
      gpPercent: 0,
    })
  }

  const walk = (rows: QboRow[] | undefined, section: 'revenue' | 'cogs' | null) => {
    if (!rows?.length) return
    for (const row of rows) {
      const headerLabel = row.Header?.ColData?.[0]?.value || row.header?.ColData?.[0]?.value
      const rowSection = classifySection(row.group, headerLabel) || section
      if (rowSection === 'revenue') hasIncome = true
      if (rowSection === 'cogs') hasCogs = true
      const colData = row.ColData || row.colData || []
      const rowType = String(row.type || '').toLowerCase()
      const isDataRow = Array.isArray(colData) && colData.length > 1 && (rowType === 'data' || !row.type)
      if (isDataRow && rowSection) {
        for (const col of customerCols) {
          const bucket = buckets.get(col.key)
          if (!bucket) continue
          const value = asNumber(colData?.[col.index]?.value)
          if (rowSection === 'revenue') {
            bucket.revenueSigned += value
            bucket.revenueAbs += Math.abs(value)
          } else {
            bucket.cogsSigned += value
            bucket.cogsAbs += Math.abs(value)
          }
        }
      }
      walk(row.Rows?.Row || row.rows?.Row || row.rows?.row, rowSection)
    }
  }

  walk(rootRows, null)

  const rows = Array.from(buckets.values()).map((r) => {
    const gross = r.revenueSigned - r.cogsSigned
    const revenue = r.revenueSigned
    const gpPercent = revenue !== 0 ? gross / revenue : 0
    return {
      ...r,
      grossProfitSigned: gross,
      grossProfitAbs: Math.abs(gross),
      gpPercent,
    }
  })

  const totals = rows.reduce<ProjectSnapshotTotals>(
    (acc, r) => {
      acc.totalRevenueSigned += r.revenueSigned
      acc.totalRevenueAbs += r.revenueAbs
      acc.totalCogsSigned += r.cogsSigned
      acc.totalCogsAbs += r.cogsAbs
      acc.totalGrossProfitSigned += r.grossProfitSigned
      acc.totalGrossProfitAbs += r.grossProfitAbs
      if (r.isNotSpecified) {
        acc.notSpecifiedRevenueSigned += r.revenueSigned
        acc.notSpecifiedRevenueAbs += r.revenueAbs
        acc.notSpecifiedCogsSigned += r.cogsSigned
        acc.notSpecifiedCogsAbs += r.cogsAbs
        acc.notSpecifiedGrossProfitSigned += r.grossProfitSigned
        acc.notSpecifiedGrossProfitAbs += r.grossProfitAbs
      }
      return acc
    },
    {
      totalRevenueSigned: 0,
      totalRevenueAbs: 0,
      totalCogsSigned: 0,
      totalCogsAbs: 0,
      totalGrossProfitSigned: 0,
      totalGrossProfitAbs: 0,
      totalGpPercent: 0,
      notSpecifiedRevenueSigned: 0,
      notSpecifiedRevenueAbs: 0,
      notSpecifiedCogsSigned: 0,
      notSpecifiedCogsAbs: 0,
      notSpecifiedGrossProfitSigned: 0,
      notSpecifiedGrossProfitAbs: 0,
    }
  )

  if (totals.totalRevenueSigned !== 0) {
    totals.totalGpPercent = totals.totalGrossProfitSigned / totals.totalRevenueSigned
  }

  const notSpecifiedRevenue = Math.abs(totals.notSpecifiedRevenueSigned)
  const totalRevenue = Math.abs(totals.totalRevenueSigned)
  const notSpecifiedPct = totalRevenue > 0 ? notSpecifiedRevenue / totalRevenue : 0

  const topCustomersByRevenue = [...rows]
    .sort((a, b) => Math.abs(b.revenueSigned) - Math.abs(a.revenueSigned))
    .slice(0, 10)
    .map((r) => ({ name: r.customerName, revenue: r.revenueSigned }))

  const debug: ProjectPnlDebug = {
    request,
    colsRaw: columns.length,
    columnTitlesRawTop3,
    rowGroupHeadersTop3,
    colsCustomers: customerCols.length,
    hasIncome,
    hasCogs,
    columnsDetected: customerCols.map((c) => c.title).slice(0, 15),
    topCustomersByRevenue,
    notSpecifiedRevenue: totals.notSpecifiedRevenueSigned,
    notSpecifiedPctOfTotalRevenue: notSpecifiedPct,
    totals,
    rawPreview: totalRevenue === 0 && Math.abs(totals.totalCogsSigned) === 0
      ? JSON.stringify(reportObj).slice(0, 2000)
      : null,
  }

  console.log('[PROJECT_PNL]', {
    colsRaw: debug.colsRaw,
    colsCustomers: debug.colsCustomers,
    hasIncome: debug.hasIncome,
    hasCogs: debug.hasCogs,
    totals: {
      revenue: totals.totalRevenueSigned,
      cogs: totals.totalCogsSigned,
      gp: totals.totalGrossProfitSigned,
    },
  })
  console.log('[PROJECT_PNL_RAW]', {
    topKeys: Object.keys((reportRoot || {}) as Record<string, unknown>),
    columnsTop3: columns.slice(0, 3),
    rowsTop3: rootRows.slice(0, 3),
  })

  return { snapshot: { rows, totals }, debug }
}

export async function buildAndStoreProjectPnlSnapshot(
  orgId: string,
  snapshotId: string,
  fromDate: string,
  toDate: string
): Promise<ProjectPnlSnapshot> {
  await ensureProjectSchema()

  const startDate = normalizeDateOnly(fromDate)
  const endDate = normalizeDateOnly(toDate)
  const request = { start_date: startDate, end_date: endDate, summarize_column_by: 'Customers' as const }
  const report = await qboFetchForOrg(
    orgId,
    '/reports/ProfitAndLoss',
    { ...request, minorversion: '65' },
    { suppressErrorLog: true }
  )

  const parsed = buildRows(report, request)

  await prisma.$executeRaw(
    Prisma.sql`DELETE FROM med2.project_pnl_snapshot_lines WHERE snapshot_id = ${snapshotId}::uuid`
  )
  await prisma.$executeRaw(
    Prisma.sql`DELETE FROM med2.project_pnl_snapshot_totals WHERE snapshot_id = ${snapshotId}::uuid`
  )

  for (const row of parsed.snapshot.rows) {
    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO med2.project_pnl_snapshot_lines (
          snapshot_id, org_id, customer_key, customer_name, is_not_specified,
          revenue_signed, revenue_abs, cogs_signed, cogs_abs, gross_profit_signed, gross_profit_abs
        ) VALUES (
          ${snapshotId}::uuid, ${orgId}::uuid, ${row.customerKey}, ${row.customerName}, ${row.isNotSpecified},
          ${row.revenueSigned}, ${row.revenueAbs}, ${row.cogsSigned}, ${row.cogsAbs}, ${row.grossProfitSigned}, ${row.grossProfitAbs}
        )
      `
    )
  }

  const t = parsed.snapshot.totals
  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO med2.project_pnl_snapshot_totals (
        snapshot_id, org_id,
        total_revenue_signed, total_revenue_abs,
        total_cogs_signed, total_cogs_abs,
        total_gross_profit_signed, total_gross_profit_abs,
        not_specified_revenue_signed, not_specified_revenue_abs,
        not_specified_cogs_signed, not_specified_cogs_abs,
        not_specified_gross_profit_signed, not_specified_gross_profit_abs
      ) VALUES (
        ${snapshotId}::uuid, ${orgId}::uuid,
        ${t.totalRevenueSigned}, ${t.totalRevenueAbs},
        ${t.totalCogsSigned}, ${t.totalCogsAbs},
        ${t.totalGrossProfitSigned}, ${t.totalGrossProfitAbs},
        ${t.notSpecifiedRevenueSigned}, ${t.notSpecifiedRevenueAbs},
        ${t.notSpecifiedCogsSigned}, ${t.notSpecifiedCogsAbs},
        ${t.notSpecifiedGrossProfitSigned}, ${t.notSpecifiedGrossProfitAbs}
      )
    `
  )

  await prisma.$executeRaw(
    Prisma.sql`DELETE FROM med2.project_pnl_snapshot_debug WHERE snapshot_id = ${snapshotId}::uuid`
  )

  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO med2.project_pnl_snapshot_debug (
        snapshot_id, org_id, start_date, end_date, summarize_column_by,
        cols_raw, cols_customers, has_income, has_cogs, columns_filtered,
        top_customers_by_revenue, totals, raw_preview
      ) VALUES (
        ${snapshotId}::uuid, ${orgId}::uuid, ${startDate}::date, ${endDate}::date, 'Customers',
        ${parsed.debug.colsRaw}, ${parsed.debug.colsCustomers}, ${parsed.debug.hasIncome}, ${parsed.debug.hasCogs},
        ${JSON.stringify({
      detected: parsed.debug.columnsDetected,
      rawTop3: parsed.debug.columnTitlesRawTop3,
      rowGroupsTop3: parsed.debug.rowGroupHeadersTop3,
    })}::jsonb,
        ${JSON.stringify(parsed.debug.topCustomersByRevenue)}::jsonb,
        ${JSON.stringify(parsed.debug.totals)}::jsonb,
        ${parsed.debug.rawPreview ?? null}
      )
    `
  )

  return parsed.snapshot
}

export async function loadProjectPnlSnapshot(snapshotId: string): Promise<ProjectPnlSnapshot | null> {
  await ensureProjectSchema()
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(
    Prisma.sql`SELECT * FROM med2.project_pnl_snapshot_lines WHERE snapshot_id = ${snapshotId}::uuid ORDER BY customer_name`
  )
  if (!rows.length) return null

  const totalsRows = await prisma.$queryRaw<Array<Record<string, unknown>>>(
    Prisma.sql`SELECT * FROM med2.project_pnl_snapshot_totals WHERE snapshot_id = ${snapshotId}::uuid LIMIT 1`
  )
  const totals = totalsRows[0] || {}

  return {
    rows: rows.map((r) => ({
      customerKey: String(r.customer_key || ''),
      customerName: String(r.customer_name || ''),
      isNotSpecified: Boolean(r.is_not_specified),
      revenueSigned: Number(r.revenue_signed || 0),
      revenueAbs: Number(r.revenue_abs || 0),
      cogsSigned: Number(r.cogs_signed || 0),
      cogsAbs: Number(r.cogs_abs || 0),
      grossProfitSigned: Number(r.gross_profit_signed || 0),
      grossProfitAbs: Number(r.gross_profit_abs || 0),
      gpPercent: Number(r.revenue_signed || 0) !== 0 ? Number(r.gross_profit_signed || 0) / Number(r.revenue_signed || 0) : 0,
    })),
    totals: {
      totalRevenueSigned: Number(totals.total_revenue_signed || 0),
      totalRevenueAbs: Number(totals.total_revenue_abs || 0),
      totalCogsSigned: Number(totals.total_cogs_signed || 0),
      totalCogsAbs: Number(totals.total_cogs_abs || 0),
      totalGrossProfitSigned: Number(totals.total_gross_profit_signed || 0),
      totalGrossProfitAbs: Number(totals.total_gross_profit_abs || 0),
      totalGpPercent: Number(totals.total_revenue_signed || 0) !== 0 ? Number(totals.total_gross_profit_signed || 0) / Number(totals.total_revenue_signed || 0) : 0,
      notSpecifiedRevenueSigned: Number(totals.not_specified_revenue_signed || 0),
      notSpecifiedRevenueAbs: Number(totals.not_specified_revenue_abs || 0),
      notSpecifiedCogsSigned: Number(totals.not_specified_cogs_signed || 0),
      notSpecifiedCogsAbs: Number(totals.not_specified_cogs_abs || 0),
      notSpecifiedGrossProfitSigned: Number(totals.not_specified_gross_profit_signed || 0),
      notSpecifiedGrossProfitAbs: Number(totals.not_specified_gross_profit_abs || 0),
    },
  }
}

export async function loadProjectPnlDebug(snapshotId: string): Promise<ProjectPnlDebug | null> {
  await ensureProjectSchema()
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(
    Prisma.sql`SELECT * FROM med2.project_pnl_snapshot_debug WHERE snapshot_id = ${snapshotId}::uuid LIMIT 1`
  )
  const row = rows[0]
  if (!row) return null

  const totalsRaw = (row.totals as Record<string, unknown> | null) || {}
  const totals: ProjectSnapshotTotals = {
    totalRevenueSigned: Number(totalsRaw.totalRevenueSigned || 0),
    totalRevenueAbs: Number(totalsRaw.totalRevenueAbs || 0),
    totalCogsSigned: Number(totalsRaw.totalCogsSigned || 0),
    totalCogsAbs: Number(totalsRaw.totalCogsAbs || 0),
    totalGrossProfitSigned: Number(totalsRaw.totalGrossProfitSigned || 0),
    totalGrossProfitAbs: Number(totalsRaw.totalGrossProfitAbs || 0),
    totalGpPercent: Number(totalsRaw.totalRevenueSigned || 0) !== 0 ? Number(totalsRaw.totalGrossProfitSigned || 0) / Number(totalsRaw.totalRevenueSigned || 0) : 0,
    notSpecifiedRevenueSigned: Number(totalsRaw.notSpecifiedRevenueSigned || 0),
    notSpecifiedRevenueAbs: Number(totalsRaw.notSpecifiedRevenueAbs || 0),
    notSpecifiedCogsSigned: Number(totalsRaw.notSpecifiedCogsSigned || 0),
    notSpecifiedCogsAbs: Number(totalsRaw.notSpecifiedCogsAbs || 0),
    notSpecifiedGrossProfitSigned: Number(totalsRaw.notSpecifiedGrossProfitSigned || 0),
    notSpecifiedGrossProfitAbs: Number(totalsRaw.notSpecifiedGrossProfitAbs || 0),
  }

  return {
    request: {
      start_date: String(row.start_date).slice(0, 10),
      end_date: String(row.end_date).slice(0, 10),
      summarize_column_by: 'Customers',
    },
    colsRaw: Number(row.cols_raw || 0),
    colsCustomers: Number(row.cols_customers || 0),
    hasIncome: Boolean(row.has_income),
    hasCogs: Boolean(row.has_cogs),
    columnsDetected:
      row.columns_filtered && typeof row.columns_filtered === 'object' && !Array.isArray(row.columns_filtered)
        ? Array.isArray((row.columns_filtered as Record<string, unknown>).detected)
          ? ((row.columns_filtered as Record<string, unknown>).detected as unknown[]).filter((v): v is string => typeof v === 'string')
          : []
        : Array.isArray(row.columns_filtered)
          ? (row.columns_filtered as unknown[]).filter((v): v is string => typeof v === 'string')
          : [],
    columnTitlesRawTop3:
      row.columns_filtered && typeof row.columns_filtered === 'object' && !Array.isArray(row.columns_filtered)
        ? Array.isArray((row.columns_filtered as Record<string, unknown>).rawTop3)
          ? ((row.columns_filtered as Record<string, unknown>).rawTop3 as unknown[]).filter((v): v is string => typeof v === 'string')
          : []
        : [],
    rowGroupHeadersTop3:
      row.columns_filtered && typeof row.columns_filtered === 'object' && !Array.isArray(row.columns_filtered)
        ? Array.isArray((row.columns_filtered as Record<string, unknown>).rowGroupsTop3)
          ? ((row.columns_filtered as Record<string, unknown>).rowGroupsTop3 as unknown[]).filter((v): v is string => typeof v === 'string')
          : []
        : [],
    topCustomersByRevenue: Array.isArray(row.top_customers_by_revenue)
      ? row.top_customers_by_revenue
        .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
        .map((v) => ({ name: String(v.name || ''), revenue: Number(v.revenue || 0) }))
      : [],
    notSpecifiedRevenue: totals.notSpecifiedRevenueSigned,
    notSpecifiedPctOfTotalRevenue:
      Math.abs(totals.totalRevenueSigned) > 0
        ? Math.abs(totals.notSpecifiedRevenueSigned) / Math.abs(totals.totalRevenueSigned)
        : 0,
    totals,
    rawPreview: (row.raw_preview as string | null) || null,
  }
}
