/**
 * Trial Balance report endpoint
 * Uses ported qboFetchForOrg and returns data in stable format
 */

import { NextRequest, NextResponse } from 'next/server'
import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { getTrialBalanceReport } from '@/lib/qbo/reports'
import { parseTrialBalanceReport } from '@/lib/qbo/parseTrialBalanceReport'
import { priorDay } from '@/lib/dates/dateOnly'

export async function POST(request: NextRequest) {
  try {
    // Auth
    try {
      await ensureUserApi()
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      throw err
    }

    const body = await request.json()
    const { orgId, fromDate, toDate } = body

    if (!orgId || !fromDate || !toDate) {
      return NextResponse.json(
        { error: 'Missing required fields: orgId, fromDate, toDate' },
        { status: 400 }
      )
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // Verify org access
    try {
      await ensureOrgAccessApi(orgId)
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      if (err.message === 'FORBIDDEN') {
        return NextResponse.json({ error: 'Forbidden - no access to this organization' }, { status: 403 })
      }
      throw err
    }

    // Log QBO request params
    console.log("[QBO:TB] request params", {
      orgId,
      start_date: fromDate,
      end_date: toDate,
      minorversion: '65',
      // Note: accounting_method and summarize_column_by are not passed explicitly
      // QBO uses default unless specified
    })

    // Fetch ending TB (period) and beginning TB (as-of prior day)
    const [qboData, beginData] = await Promise.all([
      getTrialBalanceReport(orgId, fromDate, toDate),
      // Beginning balance is the TB as of the prior day before the range start
      getTrialBalanceReport(orgId, priorDay(fromDate), priorDay(fromDate)),
    ])

    // Log Columns.Column titles (exact strings)
    const cols = qboData?.Columns?.Column ?? [];
    const colTitles = cols.map((c: any, i: number) => ({
      index: i,
      ColTitle: c?.ColTitle || '',
      ColType: c?.ColType || '',
    }));
    console.log("[QBO:TB:COLS]", JSON.stringify(colTitles, null, 2));
    
    // Log first TB data row raw ColData array (values, in order)
    const rows = qboData?.Rows?.Row ?? [];
    if (rows.length > 0) {
      const firstRow = rows[0];
      const colDataValues = firstRow?.ColData?.map((c: any, i: number) => ({
        index: i,
        columnTitle: cols[i]?.ColTitle || '',
        id: c?.id || '',
        value: c?.value || c?.Value || '',
        amount: c?.amount || c?.Amount || '',
      })) || [];
      console.log("[QBO:TB:ROW0]", JSON.stringify(colDataValues, null, 2));
    } else {
      console.log("[QBO:TB:ROW0] no rows found");
    }

    const parsed = parseTrialBalanceReport(qboData)
    const parsedBeginning = beginData ? parseTrialBalanceReport(beginData) : null

    return NextResponse.json({
      success: true,
      orgId,
      fromDate,
      toDate,
      report: qboData,
      parsed,
      beginning: parsedBeginning
        ? {
            asOfDate: priorDay(fromDate),
            rows: parsedBeginning.rows,
          }
        : null,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to fetch Trial Balance report' },
      { status: 500 }
    )
  }
}

