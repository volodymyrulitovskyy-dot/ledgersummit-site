/**
 * Native QBO Balance Sheet report endpoint
 * Fetches QBO's native BalanceSheet report and returns it in BalanceSheetView contract
 */

import { NextRequest, NextResponse } from 'next/server'
import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { getBalanceSheetReport } from '@/lib/qbo/reports'
import { flattenQboRows } from '@/lib/reports/qboFlatten'
import { bsPathForAccount } from '@/lib/reports/bsPathBuilder'
import { qboFetchForOrg } from '@/lib/qbo/qboFetchForOrg'

/**
 * GET /api/qbo/reports/balance-sheet-native
 * 
 * Query params:
 * - orgId: Organization ID
 * - from: Start date (YYYY-MM-DD) - not used for BS, but kept for consistency
 * - to: End date (YYYY-MM-DD) - used as as-of date
 * 
 * Returns:
 * - Single column Balance Sheet as-of the to date
 */
export async function GET(request: NextRequest) {
  console.log("[BS NATIVE] handler hit", { url: request.url });
  
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
    const orgId = searchParams.get('orgId')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    console.log("[BS NATIVE] params", { orgId, from, to });

    if (!orgId || !to) {
      return NextResponse.json(
        { error: 'Missing required query params: orgId, to' },
        { status: 400 }
      )
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD for to' },
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

    // Use to as the as-of date
    const asOfEnd = to

    // Log QBO request params
    console.log("[QBO:BS] request params", {
      orgId,
      as_of_date: asOfEnd,
      minorversion: '65',
      // Note: accounting_method and summarize_column_by are not passed explicitly
      // QBO uses default unless specified
    })

    // Fetch QBO native Balance Sheet report
    const qboData = await getBalanceSheetReport(orgId, asOfEnd)

    console.log("[BS NATIVE] qbo row counts", {
      topRows: qboData?.Rows?.Row?.length ?? 0,
      firstRowKeys: qboData?.Rows?.Row?.[0] ? Object.keys(qboData.Rows.Row[0]) : null
    });

    console.log("[QBO:BS] response keys", Object.keys(qboData || {}));
    console.log("[QBO:BS] Header", qboData?.Header || 'missing');
    console.log("[QBO:BS] Columns", qboData?.Columns?.Column?.map((c: any) => ({
      ColTitle: c?.ColTitle,
      ColType: c?.ColType,
      MetaData: c?.MetaData
    })) || 'missing');
    
    // Parse rows and columns - must declare before use
    const rows = qboData?.Rows?.Row ?? []
    const cols = qboData?.Columns?.Column ?? []
    
    console.log("[BS] rows count:", rows?.length ?? 0);
    
    // Find LIABILITIES AND EQUITY section and log equity child headers
    const findLiabilitiesEquitySection = (rows: any[]): any => {
      for (const row of rows) {
        const headerValue = row?.Header?.ColData?.[0]?.value || row?.Header?.ColData?.[0]?.Value || '';
        if (headerValue.toUpperCase().includes('LIABILITIES') && headerValue.toUpperCase().includes('EQUITY')) {
          return row;
        }
        if (row?.Rows?.Row) {
          const found = findLiabilitiesEquitySection(row.Rows.Row);
          if (found) return found;
        }
      }
      return null;
    };
    
    const leSection = findLiabilitiesEquitySection(rows);
    if (leSection?.Rows?.Row) {
      const equityChildHeaders = leSection.Rows.Row
        .map((r: any) => ({
          type: r?.type,
          group: r?.group,
          Header: r?.Header?.ColData?.[0]?.value || r?.Header?.ColData?.[0]?.Value,
          hasRows: !!r?.Rows?.Row,
          rowsCount: r?.Rows?.Row?.length || 0,
          Summary: r?.Summary?.ColData?.map((c: any) => ({
            value: c?.value,
            Value: c?.Value,
            amount: c?.amount,
            Amount: c?.Amount
          }))
        }))
        .filter((r: any) => r.Header && (r.Header.toUpperCase().includes('EQUITY') || r.Header.toUpperCase().includes('LIABILITIES')));
      console.log("[BS] equity child headers", equityChildHeaders);
      
      // Also log all children of LIABILITIES AND EQUITY section
      console.log("[BS] LIABILITIES AND EQUITY all children", leSection.Rows.Row.map((r: any) => ({
        Header: r?.Header?.ColData?.[0]?.value || r?.Header?.ColData?.[0]?.Value,
        type: r?.type,
        group: r?.group
      })));
    } else {
      console.log("[BS] LIABILITIES AND EQUITY section not found in response");
    }

    // Determine single numeric column key
    const titles = cols.map((c: any) => (c?.ColTitle || '').trim()).filter(Boolean)

    // For QBO BS, titles should already be ["Total"].
    const colKey = titles[0] || "Total"
    const dataColumns = [colKey] // MUST be non-empty for flattenQboRows

    console.log("[BS Native API] column info", { columnTitles: titles, dataColumns, colKey })

    // Flatten QBO rows using flattenQboRows to see structure
    const flatRows = flattenQboRows(rows, dataColumns)

    console.log("[BS NATIVE] flatRows sample", {
      flatRowsCount: flatRows.length,
      sample: flatRows.slice(0, 5).map(r => ({ label: r.label, accountId: r.accountId, isGroup: r.isGroup, path: r.path, values: r.values }))
    });

    // Fetch account metadata to build GAAP paths for leaf accounts only
    const accountsData = await qboFetchForOrg(orgId, '/query', {
      query: 'SELECT Id, Name, AccountType, AccountSubType, FullyQualifiedName FROM Account MAXRESULTS 1000',
      minorversion: '65',
    })

    const accountMap = new Map<string, { accountType: string; accountSubType?: string; accountName: string }>()
    if (accountsData?.QueryResponse?.Account) {
      const accounts = Array.isArray(accountsData.QueryResponse.Account)
        ? accountsData.QueryResponse.Account
        : [accountsData.QueryResponse.Account]

      for (const acct of accounts) {
        const accountId = acct.Id
        if (accountId) {
          accountMap.set(accountId, {
            accountType: acct.AccountType || '',
            accountSubType: acct.AccountSubType,
            accountName: acct.Name || acct.FullyQualifiedName || '',
          })
        }
      }
    }

    console.log("[BS Native API] meta stats", {
      metaCount: accountMap.size,
      sampleMetaKey: accountMap.size > 0 ? Array.from(accountMap.keys())[0] : null,
      sampleMetaValue: accountMap.size > 0 ? accountMap.get(Array.from(accountMap.keys())[0]) : null,
    });

    // Adapter: Convert QBO AccountType to normalized account_type for bsPathForAccount
    const mapQboTypeToBsType = (qboAccountType: string): 'ASSET' | 'LIABILITY' | 'EQUITY' | null => {
      const t = (qboAccountType || '').trim()
      
      // EQUITY
      if (t === 'Equity') {
        return 'EQUITY'
      }
      
      // ASSETS
      if (
        t === 'Bank' ||
        t === 'Accounts Receivable' ||
        t === 'Other Current Asset' ||
        t === 'Fixed Asset' ||
        t === 'Inventory' ||
        t === 'Undeposited Funds'
      ) {
        return 'ASSET'
      }
      
      // LIABILITIES
      if (
        t === 'Accounts Payable' ||
        t === 'Credit Card' ||
        t === 'Other Current Liability' ||
        t === 'Long Term Liability'
      ) {
        return 'LIABILITY'
      }
      
      return null
    }

    // Build statementRows from flatRows - temporarily relaxed filter to only require numeric Total value
    const statementRows = flatRows
      .filter(r => r.values && typeof r.values[colKey] === "number" && !Number.isNaN(r.values[colKey]))
      .map(r => ({
        account_id: r.accountId || null,
        account_name: r.path || r.label,
        values: { [colKey]: r.values[colKey] }
      }))

    console.log("[BS NATIVE] rowsCount", statementRows.length);
    console.log("[BS NATIVE] sampleRow", statementRows[0]);

    // Return in BalanceSheetView contract
    return NextResponse.json({
      ok: true,
      columns: [colKey],
      asOfEnd,
      rowsCount: statementRows.length,
      rows: statementRows,
      raw: qboData,
    })
  } catch (err: any) {
    console.error('[BS Native API] error', err)
    return NextResponse.json(
      { error: err.message || 'Failed to fetch native Balance Sheet report' },
      { status: 500 }
    )
  }
}

