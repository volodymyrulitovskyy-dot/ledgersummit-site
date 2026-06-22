import { NextRequest, NextResponse } from 'next/server'
import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { qboFetchForOrg } from '@/lib/qbo/qboFetchForOrg'

/**
 * POST /api/reports/drilldown
 * 
 * Fetches transaction details for an account drilldown
 * 
 * Request:
 * {
 *   orgId: string,
 *   accountId: string,
 *   mode: "ACTIVITY" | "ASOF",
 *   from?: string,
 *   to?: string,
 *   asOf?: string
 * }
 * 
 * Response:
 * {
 *   lines: Array<{
 *     txn_date: string,
 *     txn_type: string,
 *     doc_no?: string,
 *     memo?: string,
 *     name?: string,
 *     amount: number,
 *     source?: "manual" | "system" | "unknown"
 *   }>,
 *   total: number
 * }
 */
export async function POST(request: NextRequest) {
  try {
    await ensureUserApi()

    const body = await request.json()
    const { orgId, accountId, mode, from, to, asOf } = body

    if (!orgId || !accountId || !mode) {
      return NextResponse.json(
        { error: 'Missing required fields: orgId, accountId, mode' },
        { status: 400 }
      )
    }

    if (mode === 'ACTIVITY' && (!from || !to)) {
      return NextResponse.json(
        { error: 'ACTIVITY mode requires from and to dates' },
        { status: 400 }
      )
    }

    if (mode === 'ASOF' && !asOf) {
      return NextResponse.json(
        { error: 'ASOF mode requires asOf date' },
        { status: 400 }
      )
    }

    // Verify org access
    await ensureOrgAccessApi(orgId)

    // Determine date range for QBO query
    let queryFrom: string
    let queryTo: string

    if (mode === 'ACTIVITY') {
      queryFrom = from!
      queryTo = to!
    } else {
      // ASOF: query from beginning of time to asOf date
      queryFrom = '2000-01-01' // Far back date
      queryTo = asOf!
    }

    console.log("[Drilldown] fetching QBO transactions", { orgId, accountId, queryFrom, queryTo, mode });

    // Fetch Journal Report filtered by account
    const journalData = await qboFetchForOrg(orgId, '/reports/JournalReport', {
      start_date: queryFrom,
      end_date: queryTo,
      account: accountId,
      minorversion: '65',
    })

    console.log("[Drilldown] QBO response", {
      hasData: !!journalData,
      hasRows: !!journalData?.Rows?.Row,
      rowCount: Array.isArray(journalData?.Rows?.Row) ? journalData.Rows.Row.length : (journalData?.Rows?.Row ? 1 : 0),
    });

    if (!journalData) {
      return NextResponse.json(
        { error: 'Failed to fetch journal data', reason: 'No data returned from QBO' },
        { status: 500 }
      )
    }

    // Parse Journal Report rows
    const lines: Array<{
      txn_date: string
      txn_type: string
      doc_no?: string
      memo?: string
      name?: string
      amount: number
      source: 'manual' | 'system' | 'unknown'
    }> = []

    const journalRows = journalData?.Rows?.Row || []
    const rowsArray = Array.isArray(journalRows) ? journalRows : [journalRows].filter(Boolean)
    
    console.log("[Drilldown] parsing rows", { rowCount: rowsArray.length });
    
    for (const row of rowsArray) {
      const colData = row?.ColData || []
      
      if (colData.length < 8) continue

      const date = colData[0]?.value || ''
      const txnType = colData[1]?.value || ''
      const docNo = colData[2]?.value || ''
      const account = colData[3]?.value || ''
      const name = colData[4]?.value || ''
      const memo = colData[5]?.value || ''
      const debitStr = colData[6]?.value || '0'
      const creditStr = colData[7]?.value || '0'

      // Only include rows for the requested account
      // QBO may return account name or ID, so be lenient
      if (account && accountId && !account.includes(accountId) && accountId !== account && !account.includes(accountId.toString())) {
        // Skip if account doesn't match (but log for debugging)
        continue
      }

      // Parse amounts
      const debit = parseAmount(debitStr)
      const credit = parseAmount(creditStr)
      const amount = debit > 0 ? debit : -credit

      // Determine source
      const source: 'manual' | 'system' | 'unknown' = 
        txnType?.toLowerCase().includes('journal') || 
        txnType?.toLowerCase().includes('adjustment')
          ? 'manual'
          : 'system'

      // Format date
      const txnDate = formatDate(date)

      // Filter by mode
      if (mode === 'ASOF') {
        // Only include transactions up to and including asOf date
        const txnDateObj = new Date(txnDate + 'T00:00:00Z')
        const asOfObj = new Date(asOf! + 'T23:59:59Z')
        if (txnDateObj > asOfObj) continue
      }
      // ACTIVITY mode: already filtered by date range in QBO query

      lines.push({
        txn_date: txnDate,
        txn_type: txnType || '—',
        doc_no: docNo || undefined,
        memo: memo || undefined,
        name: name || undefined,
        amount,
        source,
      })
    }

    // Calculate total
    const total = lines.reduce((sum, line) => sum + line.amount, 0)

    // Sort by date (most recent first)
    lines.sort((a, b) => {
      const dateA = new Date(a.txn_date).getTime()
      const dateB = new Date(b.txn_date).getTime()
      return dateB - dateA
    })

    console.log("[Drilldown] returning", {
      lineCount: lines.length,
      total,
      filters: { orgId, accountId, queryFrom, queryTo, mode },
    });

    // Return with diagnostic info
    return NextResponse.json({
      ok: true,
      lines,
      total,
      count: lines.length,
      filters: { orgId, accountId, from: queryFrom, to: queryTo, mode },
      reason: lines.length === 0 ? `No transactions found for account ${accountId} in period ${queryFrom} to ${queryTo}` : undefined,
    })
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (err.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json(
      { error: err.message || 'Failed to fetch drilldown' },
      { status: 500 }
    )
  }
}

/**
 * Parse QBO amount string
 */
function parseAmount(str: string): number {
  if (!str || str.trim() === '' || str === '—') return 0
  const cleaned = str.replace(/,/g, '').replace(/[()$]/g, '').trim()
  const isNegative = /^\(.*\)$/.test(str.trim())
  const num = Number(cleaned)
  if (!Number.isFinite(num)) return 0
  return isNegative ? -num : num
}

/**
 * Format date to YYYY-MM-DD
 */
function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match) {
    const [, month, day, year] = match
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  return dateStr
}

