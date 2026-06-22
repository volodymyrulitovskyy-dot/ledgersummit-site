import { NextRequest, NextResponse } from 'next/server'
import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { getBalanceSheetReport } from '@/lib/qbo/reports'
import { flattenQboRows } from '@/lib/reports/qboFlatten'
import { buildStatementTree, flattenStatementTree, type StatementRow } from '@/lib/reports/statementTree'

export async function POST(request: NextRequest) {
  try {
    let user
    try {
      user = await ensureUserApi()
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      throw err
    }

    const body = await request.json()
    const { orgId, asOfDate } = body

    if (!orgId || !asOfDate) {
      return NextResponse.json(
        { error: 'Missing required fields: orgId, asOfDate' },
        { status: 400 }
      )
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // Verify org access
    let orgMember
    try {
      const access = await ensureOrgAccessApi(orgId)
      orgMember = access.orgMember
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      if (err.message === 'FORBIDDEN') {
        return NextResponse.json({ error: 'Forbidden - no access to this organization' }, { status: 403 })
      }
      throw err
    }

    // Fetch Balance Sheet from QBO using ported function
    const qboData = await getBalanceSheetReport(orgId, asOfDate)
    // Parse using proven approach: flatten QBO rows, then build statement tree
    const rows = qboData?.Rows?.Row ?? []
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: 'Balance Sheet report has no rows' },
        { status: 500 }
      )
    }

    // Extract column names
    const columns: string[] = []
    const cols = qboData?.Columns?.Column || []
    if (Array.isArray(cols)) {
      for (const col of cols) {
        const title = col?.ColTitle || ''
        if (title) columns.push(title)
      }
    }
    // Default to ["Account", "Total"] if no columns found
    if (columns.length === 0) {
      columns.push('Account', 'Total')
    }

    // Determine column keys: if first column is "Account", skip it; otherwise use all columns
    const columnKeys = columns[0]?.toLowerCase() === 'account' 
      ? columns.slice(1) 
      : columns

    // Flatten QBO rows into flat structure with paths
    const flatRows = flattenQboRows(rows, columnKeys)

    // Convert to StatementRow format
    const statementRows: StatementRow[] = flatRows
      .filter((row) => !row.isGroup || row.values && Object.keys(row.values).length > 0) // Filter out empty groups
      .map((row) => ({
        account_id: row.accountId,
        account_path: row.path,
        account_name: row.account_name || row.label,
        ...row.values, // Spread column values
      }))

    // Build statement tree using proven helpers
    // columnKeys already computed above
    const tree = buildStatementTree(statementRows, {
      pathAccessor: (row) => row.account_path || row.account_name || '',
      accountIdAccessor: (row) => row.account_id,
      columnKeys,
    })

    // Flatten tree for display
    const displayRows = flattenStatementTree(tree, {
      includeSubtotals: true,
      includeStatementTotals: true,
      indentPerLevel: 16,
      statementType: 'bs',
      columnKeys,
    })

    // Return SeriesResponse shape for consistency with other reports
    // BalanceSheetView builds its own tree from rows with paths, so return all statementRows with full paths
    const monthKey = asOfDate // Use ISO date format (YYYY-MM-DD)
    
    // Normalize column keys to match month key format if needed
    // QBO might return "Nov 30, 2025" but we want ISO format
    const normalizedColumns = columnKeys.map((col) => {
      // If column looks like a date, try to normalize to ISO
      // Otherwise keep as-is
      return col
    })
    
    return NextResponse.json({
      ok: true,
      orgId,
      from: asOfDate, // BS is "as of" date, not a range
      to: asOfDate,
      months: [monthKey],
      columns: normalizedColumns,
      rows: statementRows.map((row) => {
        // Build values object - row already has values spread via ...row.values
        // Extract values using columnKeys (the keys used during flattening)
        const values: Record<string, number | null> = {}
        const primaryKey = normalizedColumns[0] || columnKeys[0] || 'Total'
        
        // The row object has values spread, so access them directly by columnKey
        for (const colKey of columnKeys) {
          const value = (row as any)[colKey] ?? null
          // For single-month BS, use primaryKey; otherwise use original colKey
          if (normalizedColumns.length === 1) {
            values[primaryKey] = value
          } else {
            values[colKey] = value
          }
        }
        
        return {
          account_id: row.account_id,
          account_name: row.account_path || row.account_name, // Full path for tree building
          values,
        }
      }),
      success: true,
      asOfDate,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'BS refresh failed', details: String(err) },
      { status: 500 }
    )
  }
}

