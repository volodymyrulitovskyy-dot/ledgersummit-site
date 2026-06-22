import { NextRequest, NextResponse } from 'next/server'
import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { qboFetchForOrg } from '@/lib/qbo/qboFetchForOrg'

/**
 * GET /api/qbo/accounts/transactions
 * 
 * Fetches QBO transactions for an account within a date range
 * 
 * Query params:
 * - orgId: Organization ID
 * - accountId: QBO Account ID
 * - from: Start date (YYYY-MM-DD)
 * - to: End date (YYYY-MM-DD)
 * 
 * Response:
 * {
 *   ok: true,
 *   count: number,
 *   transactions: Array<{
 *     txnDate: string,
 *     txnType: string,
 *     docNumber?: string,
 *     amount: number,
 *     memo?: string,
 *     txnId?: string
 *   }>,
 *   filters: { orgId, accountId, from, to }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    await ensureUserApi()

    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')
    const accountId = searchParams.get('accountId')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    console.log("[TXNS] route hit", { orgId, accountId, from, to });

    // Log parsed params and any account variable before building queryParams
    console.log("[TXNS] parsed", {
      accountId_param: searchParams.get("accountId"),
      account_param: searchParams.get("account"),
      accountId_var: accountId,
      account_var: (typeof account !== "undefined" ? account : undefined),
    });

    console.log("[TXNS] incoming", { orgId, accountId, from, to });

    // Hard assert before calling QBO
    if (!orgId || !accountId || !from || !to) {
      return NextResponse.json(
        { error: 'Missing required query params: orgId, accountId, from, to' },
        { status: 400 }
      )
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD for both from and to' },
        { status: 400 }
      )
    }

    // Verify org access
    await ensureOrgAccessApi(orgId)

    // Try GeneralLedger report with different parameter combinations
    let glData: any = null
    const path = '/reports/GeneralLedger'
    
    // Build queryParams with toggle for account filter
    const noAccount = searchParams.get("noAccount") === "1";
    const accountIdString = String(accountId ?? "");
    
    const queryParams: any = {
      start_date: from,
      end_date: to,
      minorversion: '65',
    };
    
    // Only add account filter if noAccount is not "1"
    if (!noAccount) {
      queryParams.account = accountIdString;
    }
    
    console.log("[TXNS] QBO url/path", { path: "/reports/GeneralLedger", queryParams, noAccount });

    try {
      glData = await qboFetchForOrg(orgId, path, queryParams)
      
      // Log QBO status after fetch
      console.log("[TXNS] QBO status", { status: 200, hasData: !!glData });
      
      console.log("[TXNS] QBO keys", Object.keys(glData || {}));
      console.log("[TXNS] QBO header", glData?.Header);
      console.log("[TXNS] QBO columns", glData?.Columns?.Column?.map((c: any) => c?.ColTitle));
      console.log("[TXNS] QBO rows top type", Array.isArray(glData?.Rows?.Row) ? "array" : typeof glData?.Rows?.Row);
      console.log("[TXNS] QBO firstRow", glData?.Rows?.Row?.[0]);
      
      const rowCount = Array.isArray(glData?.Rows?.Row) ? glData.Rows.Row.length : (glData?.Rows?.Row ? 1 : 0);
      console.log("[TXNS] GeneralLedger (a) response", {
        hasRows: !!glData?.Rows?.Row,
        rowCount,
      });
      
      // If (a) returns 0 rows, try (b) with additional params
      if (rowCount === 0) {
        console.log("[TXNS] Trying GeneralLedger (b) with accounting_method and summarize_column_by");
        // Create new queryParams object (no mutation)
        const queryParamsB: any = {
          start_date: from,
          end_date: to,
          accounting_method: 'Accrual',
          summarize_column_by: 'Total',
          minorversion: '65',
        }
        // Only add 'account' if QBO GeneralLedger supports it
        // If needed, uncomment: queryParamsB.account = accountId;
        
        console.log("[TXNS] QBO url/path (b)", { path, queryParams: queryParamsB });
        
        glData = await qboFetchForOrg(orgId, path, queryParamsB)
        
        // Log (b) response structure
        console.log("[TXNS] QBO (b) keys", Object.keys(glData || {}));
        console.log("[TXNS] QBO (b) columns", glData?.Columns?.Column?.map((c: any) => c?.ColTitle));
        console.log("[TXNS] QBO (b) firstRow", glData?.Rows?.Row?.[0]);
        
        const rowCountB = Array.isArray(glData?.Rows?.Row) ? glData.Rows.Row.length : (glData?.Rows?.Row ? 1 : 0);
        console.log("[TXNS] GeneralLedger (b) response", {
          hasRows: !!glData?.Rows?.Row,
          rowCount: rowCountB,
        });
        
        if (rowCountB === 0) {
          console.log("[TXNS] GeneralLedger returned 0 rows, trying TransactionList fallback");
          // Fallback to TransactionList report
          const txnListPath = '/reports/TransactionList'
          const txnListParams: any = {
            start_date: from,
            end_date: to,
            minorversion: '65',
          }
          // Only add 'account' if QBO TransactionList supports it
          // If needed, uncomment: txnListParams.account = accountId;
          
          console.log("[TXNS] QBO url/path (TransactionList)", { path: txnListPath, queryParams: txnListParams });
          
          glData = await qboFetchForOrg(orgId, txnListPath, txnListParams)
          
          console.log("[TXNS] TransactionList QBO keys", Object.keys(glData || {}));
          console.log("[TXNS] TransactionList QBO header", glData?.Header);
          console.log("[TXNS] TransactionList QBO columns", glData?.Columns?.Column?.map((c: any) => c?.ColTitle));
          console.log("[TXNS] TransactionList QBO rows top type", Array.isArray(glData?.Rows?.Row) ? "array" : typeof glData?.Rows?.Row);
          console.log("[TXNS] TransactionList QBO firstRow", glData?.Rows?.Row?.[0]);
        }
      }
    } catch (err: any) {
      console.error("[TXNS] QBO fetch failed", err);
      
      // Log QBO status and full Fault body if error
      const errorStatus = err?.response?.status || err?.status || 500;
      const faultBody = err?.response?.data || err?.body || err?.message || err;
      console.log("[TXNS] QBO status", { 
        status: errorStatus, 
        error: true,
        faultBody: typeof faultBody === 'object' ? JSON.stringify(faultBody, null, 2) : faultBody
      });
      
      // Try TransactionList as fallback
      try {
        console.log("[TXNS] Trying TransactionList as fallback after error");
        const txnListPath = '/reports/TransactionList'
        const txnListParams: any = {
          start_date: from,
          end_date: to,
          minorversion: '65',
        }
        // Only add 'account' if QBO TransactionList supports it
        // If needed, uncomment: txnListParams.account = accountId;
        
        console.log("[TXNS] QBO url/path (TransactionList fallback)", { path: txnListPath, queryParams: txnListParams });
        
        glData = await qboFetchForOrg(orgId, txnListPath, txnListParams)
        
        // Log TransactionList fallback response
        console.log("[TXNS] TransactionList fallback QBO keys", Object.keys(glData || {}));
        console.log("[TXNS] TransactionList fallback QBO columns", glData?.Columns?.Column?.map((c: any) => c?.ColTitle));
        console.log("[TXNS] TransactionList fallback QBO firstRow", glData?.Rows?.Row?.[0]);
        console.log("[TXNS] TransactionList fallback succeeded");
      } catch (fallbackErr: any) {
        console.error("[TXNS] TransactionList fallback also failed", fallbackErr);
        return NextResponse.json(
          { error: 'Failed to fetch QBO transactions', details: fallbackErr.message },
          { status: 500 }
        )
      }
    }

    if (!glData) {
      return NextResponse.json(
        { error: 'No data returned from QBO' },
        { status: 500 }
      )
    }

    // Log QBO response structure before parsing
    const topRowsForLog = glData?.Rows?.Row || [];
    const topRowsArrayForLog = Array.isArray(topRowsForLog) ? topRowsForLog : [topRowsForLog].filter(Boolean);
    console.log("[TXNS] qbo", {
      header: glData?.Header,
      topRowTypes: topRowsArrayForLog.map((r: any) => r?.type),
      firstTopRowKeys: Object.keys(topRowsArrayForLog[0] || {}),
      firstSectionHeader: topRowsArrayForLog[0]?.Header?.ColData?.map((c: any) => c?.value)
    });

    // Fetch Chart of Accounts to build account map (same pattern as BS rollforward)
    // Wrap in try/catch so failure doesn't block drilldown
    const warnings: string[] = [];
    let selectedAccountName = "";
    let selectedAccountNumber = "";
    
    try {
      console.log("[TXNS] fetching accounts list")
      const accountsData = await qboFetchForOrg(orgId, '/query', {
        query: 'SELECT Id, Name, AccountType, AccountSubType, FullyQualifiedName FROM Account MAXRESULTS 1000',
        minorversion: '65',
      })
      
      // Proof log after query succeeds
      const accounts = accountsData?.QueryResponse?.Account;
      const accountsArray = Array.isArray(accounts) ? accounts : (accounts ? [accounts] : []);
      const firstAccount = accountsArray[0] || {};
      console.log("[QBO] Account query ok", { 
        count: accountsArray.length,
        firstAccountKeys: Object.keys(firstAccount),
        firstAccount: firstAccount
      });
      
      // Build account map: accountId -> { name, fullyQualifiedName, acctNum, type, subType }
      const accountMap = new Map<string, { 
        name: string; 
        fullyQualifiedName: string; 
        acctNum: string; 
        type: string; 
        subType?: string;
      }>()
      
      if (accountsArray.length > 0) {
        for (const acct of accountsArray) {
          const acctId = acct.Id
          if (acctId) {
            accountMap.set(acctId, {
              name: (acct.Name || "").trim(),
              fullyQualifiedName: (acct.FullyQualifiedName || "").trim(),
              acctNum: (acct.AccountNumber || "").trim(), // May be undefined if not in query
              type: (acct.AccountType || "").trim(),
              subType: acct.AccountSubType ? (acct.AccountSubType || "").trim() : undefined,
            })
          }
        }
      }
      console.log("[TXNS] accounts map", { count: accountMap.size })

      // Get selected account info from map
      const selectedAccount = accountMap.get(accountId);
      selectedAccountName = selectedAccount?.name || selectedAccount?.fullyQualifiedName || "";
      selectedAccountNumber = selectedAccount?.acctNum || "";
      
      console.log("[TXNS] selectedAccount", { accountId, selectedAccountNumber, selectedAccountName });
    } catch (err: any) {
      // Log failure but don't block drilldown
      const errorStatus = err?.response?.status || err?.status || 500;
      // Try to get raw Fault text from qboFetchForOrg error
      const errorText = err?.message || String(err);
      console.error("[QBO] Account query fail", { 
        status: errorStatus,
        text: errorText
      });
      warnings.push(`ACCOUNTS_LIST_FAILED: ${errorStatus}/${errorText}`);
    }

    // Parse transactions from GeneralLedger Report
    // QBO GeneralLedger structure:
    // - Top level: Rows.Row is array of Section rows
    // - Each section has: Header.ColData[0] = section name (e.g., "Checking")
    // - Transactions live under: section.Rows.Row[]
    // - Map by column order: Date, Transaction Type, Num, Name, Memo/Description, Split, Amount, Balance
    
    const cols = (glData?.Columns?.Column ?? []).map((c: any) => (c?.ColTitle || "").trim());
    console.log("[TXNS] GL columns", cols);
    
    // Map by column order (not by name lookup)
    // Expected order: Date, Transaction Type, Num, Name, Memo/Description, Split, Amount, Balance
    const iDate = 0;      // Date
    const iType = 1;      // Transaction Type
    const iNum = 2;       // Num
    const iName = 3;     // Name
    const iMemo = 4;     // Memo/Description
    const iSplit = 5;    // Split
    const iAmt = 6;      // Amount
    const iBal = 7;      // Balance

    function getVal(row: any, i: number) {
      const colData = row?.ColData || [];
      if (i >= colData.length) return "";
      const v = colData[i]?.value ?? colData[i]?.id ?? "";
      return typeof v === "string" ? v.trim() : v;
    }

    function toNum(s: any) {
      if (s === null || s === undefined || s === "") return null;
      const n = Number(String(s).replace(/,/g, "").replace(/[()$]/g, ""));
      return Number.isFinite(n) ? n : null;
    }

    function formatDate(dateStr: string): string {
      if (!dateStr || dateStr.trim() === "") return "";
      const trimmed = dateStr.trim();
      
      // Already YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
      
      // Try MM/DD/YYYY
      const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (match) {
        const [, month, day, year] = match;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      
      return ""; // Invalid format
    }

    type TxnRow = {
      date: string;
      txnType: string;
      num: string;
      name: string;
      memo: string;
      split: string;
      amount: number;
      balance?: number | null;
    };

    // Function to check if section name matches the TB line name
    function matchesSection(sectionName: string, tbLineName: string): boolean {
      if (!sectionName || !tbLineName) return false;
      // Match section header name to TB line name (case-insensitive)
      return sectionName.toLowerCase().trim() === tbLineName.toLowerCase().trim();
    }

    const sectionNames: string[] = [];
    let kept = 0;
    let skippedNoSectionMatch = 0;
    let skippedNoDate = 0;
    let skippedNoAmount = 0;

    function extractRows(rows: any[], currentSectionName: string = "", tbLineName: string): TxnRow[] {
      const out: TxnRow[] = [];
      for (const r of rows || []) {
        const type = r?.type;
        if (type === "Section") {
          // Extract section name from Header.ColData[0]
          const sectionName = (r.Header?.ColData?.[0]?.value || "").trim();
          if (sectionName && !sectionNames.includes(sectionName)) {
            sectionNames.push(sectionName);
          }
          // Recurse with the section name
          out.push(...extractRows(r?.Rows?.Row || [], sectionName, tbLineName));
          continue;
        }
        if (type !== "Data") continue;

        // Only keep Data rows when currentSectionName matches the TB line name
        if (!matchesSection(currentSectionName, tbLineName)) {
          skippedNoSectionMatch++;
          continue;
        }

        // Map by column order
        const dateStr = getVal(r, iDate);
        const date = formatDate(dateStr);
        const amt = toNum(getVal(r, iAmt));
        
        if (!date || date === "0-00-00" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          skippedNoDate++;
          continue;
        }
        if (amt === null) {
          skippedNoAmount++;
          continue;
        }

        out.push({
          date,
          txnType: String(getVal(r, iType) || ""),
          num: String(getVal(r, iNum) || ""),
          name: String(getVal(r, iName) || ""),
          memo: String(getVal(r, iMemo) || ""),
          split: String(getVal(r, iSplit) || ""),
          amount: amt,
          balance: toNum(getVal(r, iBal)),
        });
        kept++;
      }
      return out;
    }

    // Use selectedAccountName as the TB line name to match against section headers
    const tbLineName = selectedAccountName || accountId;
    const topRows = glData?.Rows?.Row || [];
    const txns = extractRows(Array.isArray(topRows) ? topRows : [topRows].filter(Boolean), "", tbLineName);

    console.log("[TXNS] sectionNamesSample", sectionNames.slice(0, 10));
    console.log("[TXNS] matching", { tbLineName, sectionNames: sectionNames.filter(s => matchesSection(s, tbLineName)) });

    // Compute drilldownTotal = sum(amount) (signed)
    const drilldownTotal = txns.reduce((s, t) => s + t.amount, 0);
    
    // Compute debit/credit totals
    const debitTotal = txns.reduce((s, t) => s + Math.max(t.amount, 0), 0);
    const creditTotal = txns.reduce((s, t) => s + Math.max(-t.amount, 0), 0);
    const netChange = drilldownTotal;

    const topRowsArray = Array.isArray(topRows) ? topRows : [topRows].filter(Boolean);
    console.log("[TXNS] topRowTypes", topRowsArray.map((r: any) => r?.type));
    console.log("[TXNS] sectionHasRows", Boolean(topRowsArray?.[0]?.Rows?.Row?.length));
    
    // Determine reason if 0 rows kept
    let reason = "";
    if (txns.length === 0) {
      if (sectionNames.length === 0) {
        reason = "No sections found in GL report";
      } else if (skippedNoSectionMatch > 0 && kept === 0) {
        reason = `No matching section header (looking for "${tbLineName}", found: ${sectionNames.slice(0, 3).join(", ")})`;
      } else if (skippedNoDate > 0) {
        reason = "No txn rows with valid dates";
      } else if (skippedNoAmount > 0) {
        reason = "No txn rows with valid amounts";
      } else {
        reason = "No txn rows found";
      }
    }
    
    console.log("[TXNS] extractedCounts", { 
      kept,
      total: txns.length, 
      skippedNoSectionMatch,
      skippedNoDate,
      skippedNoAmount,
      drilldownTotal,
      debitTotal,
      creditTotal,
      netChange,
      reason: reason || undefined
    });
    console.log("[TXNS] sampleKept", txns[0]);

    console.log("[TXNS] ok", { orgId, accountId, from, to, count: txns.length, debitTotal, creditTotal, netChange });

    return NextResponse.json({
      ok: true,
      orgId,
      accountId,
      from,
      to,
      count: txns.length,
      kept,
      drilldownTotal,
      debitTotal,
      creditTotal,
      netChange,
      transactions: txns,
      reason: reason || undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    })
  } catch (err: any) {
    console.error("[TXNS] error", err);
    
    if (err?.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (err?.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json(
      { error: err?.message || String(err), stack: err?.stack || null },
      { status: 500 }
    )
  }
}

/**
 * Parse QBO amount string
 */
function parseAmount(str: string): number {
  if (!str || str.trim() === '' || str === '—' || str === '-') return 0
  const cleaned = str.replace(/,/g, '').replace(/[()$]/g, '').trim()
  const isNegative = /^\(.*\)$/.test(str.trim())
  const num = Number(cleaned)
  if (!Number.isFinite(num)) return 0
  return isNegative ? -num : num
}

/**
 * Format date to YYYY-MM-DD
 * Returns empty string for invalid dates or "0-00-00"
 */
function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.trim() === '') return ''
  
  // Reject "0-00-00" and similar invalid patterns
  if (dateStr.includes('0-00-00') || dateStr.includes('00-00-00') || /^0+-\d+-0+$/.test(dateStr)) {
    return ''
  }
  
  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    // Validate it's a real date
    const dateObj = new Date(dateStr + 'T00:00:00Z')
    if (isNaN(dateObj.getTime())) return ''
    return dateStr
  }
  
  // Try MM/DD/YYYY format
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match) {
    const [, month, day, year] = match
    const formatted = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    // Validate it's a real date
    const dateObj = new Date(formatted + 'T00:00:00Z')
    if (isNaN(dateObj.getTime())) return ''
    return formatted
  }
  
  // Try parsing as Date object
  const dateObj = new Date(dateStr)
  if (!isNaN(dateObj.getTime())) {
    const formatted = dateObj.toISOString().split('T')[0]
    // Double-check it's valid
    if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) {
      return formatted
    }
  }
  
  return ''
}

