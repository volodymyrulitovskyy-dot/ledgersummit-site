import { NextRequest, NextResponse } from 'next/server'
import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { qboFetchForOrg } from '@/lib/qbo/qboFetchForOrg'

/**
 * GL Detail endpoint - fetches transactions for a specific account
 * Uses QBO Journal Report filtered by account
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const orgId = searchParams.get('orgId')

    if (!accountId || !from || !to) {
      return NextResponse.json(
        { error: 'Missing required parameters: accountId, from, to' },
        { status: 400 }
      )
    }

    if (!orgId) {
      return NextResponse.json(
        { error: 'Missing required parameter: orgId' },
        { status: 400 }
      )
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
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

    // Fetch Journal Report filtered by account
    // QBO Journal Report shows all transactions for accounts in the date range
    const journalData = await qboFetchForOrg(orgId, '/reports/JournalReport', {
      start_date: from,
      end_date: to,
      account: accountId, // Filter by account ID
      minorversion: '65',
    })

    // Parse Journal Report rows
    const rows: Array<{
      date: string
      docNo: string
      vendorOrCustomer: string
      memo: string
      txnType: string
      amount: number
      postingType: 'manual' | 'system'
      isReversing: boolean
      isBackdated: boolean
      balanceImpact: number
    }> = []

    const journalRows = journalData?.Rows?.Row || []
    const periodEndDate = new Date(to + 'T23:59:59Z')
    
    // Track document numbers to detect reversing entries
    const docNoMap = new Map<string, Array<{ date: string; amount: number; docNo: string }>>()
    
    for (const row of journalRows) {
      // Journal Report structure: ColData array with [Date, Transaction Type, Transaction No, Account, Name, Memo, Debit, Credit]
      const colData = row?.ColData || []
      
      if (colData.length < 8) continue

      const date = colData[0]?.value || ''
      const txnType = colData[1]?.value || ''
      const docNo = colData[2]?.value || ''
      const account = colData[3]?.value || ''
      const name = colData[4]?.value || '' // Vendor/Customer name
      const memo = colData[5]?.value || ''
      const debitStr = colData[6]?.value || '0'
      const creditStr = colData[7]?.value || '0'

      // Only include rows for the requested account
      if (account !== accountId) continue

      // Parse amounts
      const debit = parseAmount(debitStr)
      const credit = parseAmount(creditStr)
      const amount = debit > 0 ? debit : -credit // Positive for debit, negative for credit

      // Determine posting type (manual vs system)
      const postingType: 'manual' | 'system' = 
        txnType?.toLowerCase().includes('journal') || 
        txnType?.toLowerCase().includes('adjustment')
          ? 'manual'
          : 'system'

      // Check if backdated (posted after period end)
      const entryDate = new Date(formatDate(date) + 'T00:00:00Z')
      const isBackdated = entryDate > periodEndDate

      // Track for reversing entry detection
      if (docNo) {
        if (!docNoMap.has(docNo)) {
          docNoMap.set(docNo, [])
        }
        docNoMap.get(docNo)!.push({ date: formatDate(date), amount, docNo })
      }

      rows.push({
        date: formatDate(date),
        docNo: docNo || '—',
        vendorOrCustomer: name || '—',
        memo: memo || '—',
        txnType: txnType || '—',
        amount,
        postingType,
        isReversing: false, // Will be set below
        isBackdated,
        balanceImpact: amount, // Will be calculated below
      })
    }

    // Detect reversing entries (same doc number, opposite amounts)
    for (const [docNo, entries] of docNoMap.entries()) {
      if (entries.length === 2) {
        const [entry1, entry2] = entries
        // Check if amounts are opposite (within tolerance)
        if (Math.abs(entry1.amount + entry2.amount) < 0.01) {
          // Mark both as reversing
          for (const row of rows) {
            if (row.docNo === docNo) {
              row.isReversing = true
            }
          }
        }
      }
    }

    // Calculate cumulative balance impact (sorted by date ascending)
    const rowsByDate = [...rows].sort((a, b) => {
      const dateA = new Date(a.date).getTime()
      const dateB = new Date(b.date).getTime()
      return dateA - dateB
    })

    let runningBalance = 0
    for (const row of rowsByDate) {
      runningBalance += row.amount
      row.balanceImpact = runningBalance
    }

    // Sort by absolute balance impact (descending) to highlight top JEs
    // Top 5 JEs by absolute balance impact will be shown first
    rows.sort((a, b) => Math.abs(b.balanceImpact || 0) - Math.abs(a.balanceImpact || 0))

    return NextResponse.json({
      ok: true,
      accountId,
      from,
      to,
      rows,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to fetch GL detail' },
      { status: 500 }
    )
  }
}

/**
 * Parse QBO amount string (handles commas, parentheses for negatives, etc.)
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
 * Format date from QBO format to YYYY-MM-DD
 */
function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  // QBO returns dates in various formats, try to normalize
  // If already YYYY-MM-DD, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  // Try MM/DD/YYYY
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match) {
    const [, month, day, year] = match
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  // Try other formats or return as-is
  return dateStr
}

