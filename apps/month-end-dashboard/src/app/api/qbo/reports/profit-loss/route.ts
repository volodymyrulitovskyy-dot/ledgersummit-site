/**
 * Profit & Loss report endpoint
 * Uses ported qboFetchForOrg and pnlParse
 */

import { NextRequest, NextResponse } from 'next/server'
import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { getProfitAndLossReport } from '@/lib/qbo/reports'
import { extractPnlLines, findNetIncome } from '@/lib/qbo/pnlParse'

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

    // Note: request params are logged in getProfitAndLossReport

    // Fetch from QBO
    const qboData = await getProfitAndLossReport(orgId, fromDate, toDate)

    // Log Columns.Column titles and their index
    const cols = qboData?.Columns?.Column || [];
    const colTitlesWithIndex = cols.map((c: any, i: number) => ({
      index: i,
      ColTitle: c?.ColTitle || '',
      ColType: c?.ColType || '',
    }));
    console.log("[QBO:P&L:COLS]", JSON.stringify(colTitlesWithIndex, null, 2));
    
    const rows = qboData?.Rows?.Row ?? []
    const topRowTypes = rows.slice(0, 5).map((r: any) => ({
      type: r?.type,
      group: r?.group,
      Header: r?.Header?.ColData?.[0]?.value || r?.Header?.ColData?.[0]?.Value,
      hasRows: !!r?.Rows?.Row,
      rowsCount: r?.Rows?.Row?.length || 0
    }));
    console.log("[P&L] topRowTypes + firstSectionHeader", topRowTypes);
    
    // TEMP: Find and log the raw QBO Section row for "Landscaping Services"
    function findLandscapingServicesRow(rows: any[]): any | null {
      for (const row of rows) {
        const headerValue = row?.Header?.ColData?.[0]?.value || row?.Header?.ColData?.[0]?.Value;
        if (headerValue && String(headerValue).includes("Landscaping Services")) {
          return row;
        }
        if (row?.Rows?.Row) {
          const found = findLandscapingServicesRow(row.Rows.Row);
          if (found) return found;
        }
      }
      return null;
    }
    const lsRow = findLandscapingServicesRow(rows);
    if (lsRow) {
      console.log("[P&L][RAW][LS]", JSON.stringify(lsRow, null, 2));
    } else {
      console.log("[P&L][RAW][LS]", "NOT FOUND");
    }
    
    // Get first section header - log Data rows properly (they use ColData, not Header/Summary)
    const firstSection = rows.find((r: any) => r?.type === 'Section' || r?.group);
    if (firstSection?.Rows?.Row) {
      const firstSectionHeader = firstSection.Rows.Row.slice(0, 10).map((r: any) => ({
        type: r?.type,
        group: r?.group,
        header: r?.Header?.ColData?.[0]?.value || r?.Header?.ColData?.[0]?.Value,
        summary: r?.Summary?.ColData,
        col0: r?.ColData?.[0],
        colDataLen: r?.ColData?.length,
        colData: r?.ColData
      }));
      console.log("[P&L] firstSectionHeader (with ColData for Data rows)", firstSectionHeader);
    }

    // Parse using ported parser and flatten to SeriesResponse shape
    // Note: cols already defined above for column logging
    
    // Extract column names (skip first "Account" column)
    const columnTitles: string[] = []
    for (const col of cols) {
      const title = col?.ColTitle || ''
      if (title) columnTitles.push(title)
    }
    const dataColumns = columnTitles.slice(1) // Skip "Account"
    if (dataColumns.length === 0) {
      dataColumns.push('Total')
    }
    
    // Log last ~10 top-level rows to see Other Income/Expense section structure
    const tailRows = rows.slice(-10).map((r: any) => ({
      group: r?.group,
      Header: r?.Header?.ColData?.[0]?.value || r?.Header?.ColData?.[0]?.Value,
      Summary: r?.Summary?.ColData?.[1]?.value || r?.Summary?.ColData?.[1]?.Value || r?.Summary?.ColData?.[1]?.amount || r?.Summary?.ColData?.[1]?.Amount,
      type: r?.type
    }));
    console.log("[P&L] tail rows", tailRows);
    
    // Find Net Income row by group-based matching (Section with group: 'NetIncome')
    // Net Income row is a Section with group: 'NetIncome', Header: undefined, amount in Summary
    function findSectionByGroup(rows: any[], targetGroup: string): any | null {
      for (const row of rows ?? []) {
        if (row?.type === 'Section' && row?.group === targetGroup) return row;
        const child = findSectionByGroup(row?.Rows?.Row ?? [], targetGroup);
        if (child) return child;
      }
      return null;
    }
    
    const netIncomeRow = findSectionByGroup(rows, 'NetIncome');
    
    if (netIncomeRow) {
      // Extract "Total" column by using Columns.Column title mapping
      const totalIdx = cols.findIndex((c: any) => (c?.ColTitle || '').toLowerCase() === 'total');
      
      // Pull amount from Summary
      const colData = netIncomeRow?.Summary?.ColData ?? [];
      const netIncomeStr = colData[totalIdx]?.value ?? colData[totalIdx]?.Value ?? null;
      
      // Log the raw row object that is used as Net Income
      console.log("[QBO:P&L:NET_INCOME_ROW]", JSON.stringify({
        type: netIncomeRow?.type,
        group: netIncomeRow?.group,
        Header: netIncomeRow?.Header?.ColData?.[0]?.value || netIncomeRow?.Header?.ColData?.[0]?.Value,
        Summary: colData.map((c: any, i: number) => ({
          index: i,
          title: cols[i]?.ColTitle,
          value: c?.value,
          Value: c?.Value
        })),
        ColData: netIncomeRow?.ColData?.map((c: any, i: number) => ({
          index: i,
          title: cols[i]?.ColTitle,
          value: c?.value,
          Value: c?.Value
        })),
        extractedValue: netIncomeStr,
        columnIndex: totalIdx,
        columnTitle: cols[totalIdx]?.ColTitle
      }, null, 2));
      
      console.log("[QBO:P&L] extractedNetIncome", { 
        found: !!netIncomeRow, 
        totalIdx, 
        netIncomeStr,
        reportParams: { orgId, fromDate, toDate }
      });
    } else {
      console.log("[QBO:P&L] extractedNetIncome - Net Income section not found (group: 'NetIncome')");
    }

    // Flatten QBO rows using same logic as BS
    // Pass qboColumns for "Total" index mapping
    const { flattenQboRows } = await import('@/lib/reports/qboFlatten')
    const { buildStatementTree, flattenStatementTree } = await import('@/lib/reports/statementTree')
    
    const flatRows = flattenQboRows(rows, dataColumns, [], cols)
    
    // TEMP: Log flattened rows for "Landscaping Services"
    const lsFlatRows = flatRows.filter((r: any) => r.path.includes("Landscaping Services"));
    console.log("[P&L][FLAT][LS]", JSON.stringify(lsFlatRows, null, 2));
    const statementRows = flatRows
      .filter((row) => !row.isGroup || (row.values && Object.keys(row.values).length > 0))
      .map((row) => ({
        account_id: row.accountId,
        account_path: row.path,
        account_name: row.account_name || row.label,
        group: row.originalNode?.group, // Preserve QBO group for classification
        ...row.values,
      }))

    // Build statement tree
    const tree = buildStatementTree(statementRows, {
      pathAccessor: (row) => row.account_path || row.account_name || '',
      accountIdAccessor: (row) => row.account_id,
      columnKeys: dataColumns,
    })

    // Flatten for display
    const displayRows = flattenStatementTree(tree, {
      includeSubtotals: true,
      includeStatementTotals: false,
      indentPerLevel: 16,
      statementType: 'pnl',
      columnKeys: dataColumns,
    })

    // Return SeriesResponse shape
    // PnlView builds its own tree from rows with paths, so return all statementRows (not just leaves)
    const monthKey = toDate // Use toDate as the month key
    
    return NextResponse.json({
      ok: true,
      orgId,
      from: fromDate,
      to: toDate,
      months: [monthKey],
      columns: dataColumns,
      rows: statementRows.map((row) => {
        // Build values object with all columns
        const values: Record<string, number | null> = {}
        for (const colKey of dataColumns) {
          values[colKey] = (row as any)[colKey] ?? null
        }
        
        return {
          account_id: row.account_id,
          account_name: row.account_path || row.account_name, // Full path for tree building
          values,
        }
      }),
      success: true,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to fetch Profit & Loss report' },
      { status: 500 }
    )
  }
}

