/**
 * Cash Flow report endpoint
 * Uses ported qboFetchForOrg
 */

import { NextRequest, NextResponse } from 'next/server'
import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { getCashFlowReport } from '@/lib/qbo/reports'

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

    // Note: request params are logged in getCashFlowReport

    // Fetch from QBO
    const qboData = await getCashFlowReport(orgId, fromDate, toDate)

    // Loud marker to confirm logs are executing
    console.log("[CF][LOGS_ACTIVE]", { 
      hasRows: !!qboData?.Rows?.Row?.length, 
      topCount: (qboData?.Rows?.Row ?? []).length 
    });

    // Parse rows and columns
    const rows = qboData?.Rows?.Row ?? []
    const cols = qboData?.Columns?.Column || []
    
    // Helper: get label from row (checks Header, Summary, ColData in order)
    const getLabel = (row: any): string => {
      return row?.Header?.ColData?.[0]?.value ?? 
             row?.Summary?.ColData?.[0]?.value ?? 
             row?.ColData?.[0]?.value ?? 
             "";
    };
    
    // Helper: get amount from row (checks Summary.ColData[1], ColData[1] with fallbacks)
    const getAmount = (row: any): string | null => {
      return row?.Summary?.ColData?.[1]?.value ?? 
             row?.ColData?.[1]?.value ?? 
             row?.Summary?.ColData?.[1]?.Value ?? 
             row?.ColData?.[1]?.Value ?? 
             null;
    };
    
    // Helper: normalize text for matching (lowercase, normalize whitespace)
    const normalizeText = (s: string): string => {
      return s.toLowerCase().replace(/\s+/g, " ").trim();
    };
    
    // 1) Log the last 30 top-level rows
    console.log("[CF][TOP_TAIL]", JSON.stringify((rows).slice(-30).map((r: any) => ({
      type: r?.type,
      group: r?.group,
      label: getLabel(r),
      amt: getAmount(r),
      hasChildren: !!r?.Rows?.Row?.length
    })), null, 2));
    
    // 2) Recursively collect ANY row where label contains search strings (for logging)
    const searchStrings = ["cash at beginning", "cash at end", "net increase", "net decrease"];
    
    const findMatches = (rows: any[]): void => {
      for (const row of rows) {
        const label = getLabel(row);
        const labelNormalized = normalizeText(label);
        
        // Check if label contains any search string
        for (const searchStr of searchStrings) {
          if (labelNormalized.includes(normalizeText(searchStr))) {
            console.log("[CF][MATCH]", JSON.stringify({
              type: row?.type,
              group: row?.group,
              label: label,
              amt: getAmount(row),
              hasSummary: !!row?.Summary?.ColData,
              hasColData: !!row?.ColData
            }, null, 2));
            break; // Found a match, no need to check other search strings for this row
          }
        }
        
        // Recurse into children
        if (row?.Rows?.Row) {
          findMatches(row.Rows.Row);
        }
      }
    };
    
    findMatches(rows);
    
    // Helper: Find row by group (DFS through Rows.Row)
    const findRowByGroup = (rows: any[], targetGroup: string): any | null => {
      for (const row of rows) {
        if (row?.group === targetGroup) {
          return row;
        }
        // Recurse into children
        if (row?.Rows?.Row) {
          const found = findRowByGroup(row.Rows.Row, targetGroup);
          if (found) return found;
        }
      }
      return null;
    };
    
    // Log Columns.Column titles and their index
    const colTitlesWithIndex = cols.map((c: any, i: number) => ({
      index: i,
      ColTitle: c?.ColTitle || '',
      ColType: c?.ColType || '',
    }));
    console.log("[QBO:CF:COLS]", JSON.stringify(colTitlesWithIndex, null, 2));
    
    // 1) Determine Total column index once (control value)
    let totalColIdx = cols.findIndex((c: any) => (c?.ColTitle || '').toLowerCase() === 'total');
    if (totalColIdx === -1 && cols.length > 1) {
      totalColIdx = 1; // Fallback to index 1
    }
    
    // Helper: find row by header text (tolerant matching with normalization)
    const findRowByHeader = (rows: any[], searchPatterns: string[]): any => {
      for (const row of rows) {
        const headerValue = row?.Header?.ColData?.[0]?.value || row?.Header?.ColData?.[0]?.Value || '';
        const normalizedHeader = normalizeText(headerValue);
        
        // Check if normalized header includes any of the search patterns
        for (const pattern of searchPatterns) {
          if (normalizedHeader.includes(normalizeText(pattern))) {
            return row;
          }
        }
        
        if (row?.Rows?.Row) {
          const found = findRowByHeader(row.Rows.Row, searchPatterns);
          if (found) return found;
        }
      }
      return null;
    };
    
    // TEMP: Log all candidate rows with "cash" in header
    const logCashCandidates = (rows: any[]): void => {
      for (const row of rows) {
        const headerValue = row?.Header?.ColData?.[0]?.value || row?.Header?.ColData?.[0]?.Value || '';
        if (normalizeText(headerValue).includes("cash")) {
          console.log("[CF][CASH_CANDIDATE]", {
            header: headerValue,
            type: row?.type,
            hasSummary: !!row?.Summary,
            colDataLen: row?.ColData?.length || 0,
            summaryLen: row?.Summary?.ColData?.length || 0,
            summaryColData: row?.Summary?.ColData,
            colData: row?.ColData
          });
        }
        if (row?.Rows?.Row) {
          logCashCandidates(row.Rows.Row);
        }
      }
    };
    
    // TEMP: Log all cash candidates
    logCashCandidates(rows);
    
    // Helper: extract value from row (robust fallback chain)
    const extractValue = (row: any, useRobustFallback: boolean = false): number | null => {
      const summaryColData = row?.Summary?.ColData || [];
      const colData = row?.ColData || [];
      
      let valueStr: string | null | undefined = null;
      
      if (useRobustFallback) {
        // Robust fallback: try multiple sources in order
        valueStr = summaryColData[totalColIdx]?.value ?? 
                   summaryColData[totalColIdx]?.Value ??
                   colData[totalColIdx]?.value ?? 
                   colData[totalColIdx]?.Value ??
                   summaryColData[1]?.value ??
                   summaryColData[1]?.Value ??
                   colData[1]?.value ??
                   colData[1]?.Value;
      } else {
        // Standard extraction: prefer Summary, fallback ColData
        valueStr = summaryColData[totalColIdx]?.value ?? 
                   summaryColData[totalColIdx]?.Value ??
                   colData[totalColIdx]?.value ?? 
                   colData[totalColIdx]?.Value;
      }
      
      if (!valueStr || valueStr === "—" || valueStr === "-" || String(valueStr).trim() === "") {
        return null;
      }
      
      // Parse QBO money format
      const s = String(valueStr).trim();
      const negByParens = /^\(.*\)$/.test(s);
      const cleaned = s.replace(/\$/g, '').replace(/,/g, '').replace(/[()]/g, '').trim();
      if (!cleaned) return null;
      const n = Number(cleaned);
      if (!Number.isFinite(n)) return null;
      return negByParens ? -n : n;
    };
    
    // 3) Extract Net Income (control number)
    const netIncomeRow = findRowByHeader(rows, ["Net Income"]);
    const netIncome = netIncomeRow ? extractValue(netIncomeRow) : null;
    
    if (netIncomeRow) {
      console.log("[QBO:CF:NET_INCOME_ROW]", {
        Header: netIncomeRow?.Header?.ColData?.[0]?.value || netIncomeRow?.Header?.ColData?.[0]?.Value,
        extractedValue: netIncome,
        columnIndex: totalColIdx,
        columnTitle: cols[totalColIdx]?.ColTitle
      });
    }
    
    // Helper: parse QBO money string to number
    const toNumber = (valueStr: string | null | undefined): number | null => {
      if (!valueStr || valueStr === "—" || valueStr === "-" || String(valueStr).trim() === "") {
        return null;
      }
      const s = String(valueStr).trim();
      const negByParens = /^\(.*\)$/.test(s);
      const cleaned = s.replace(/\$/g, '').replace(/,/g, '').replace(/[()]/g, '').trim();
      if (!cleaned) return null;
      const n = Number(cleaned);
      if (!Number.isFinite(n)) return null;
      return negByParens ? -n : n;
    };
    
    // 4) Extract cash control rows using group-based matching (proven matcher)
    const topRows = qboData?.Rows?.Row ?? [];
    const beginNode = findRowByGroup(topRows, "BeginningCash");
    const endNode = findRowByGroup(topRows, "EndingCash");
    
    // Extract amounts from ColData[1] (these rows have no Summary)
    const beginAmt = toNumber(beginNode?.ColData?.[1]?.value ?? beginNode?.ColData?.[1]?.Value);
    const endAmt = toNumber(endNode?.ColData?.[1]?.value ?? endNode?.ColData?.[1]?.Value);
    
    // Also extract net change using header matching (for compatibility)
    const netChangeRow = findRowByHeader(rows, [
      "net increase (decrease)",
      "net increase",
      "net decrease"
    ]);
    const netChange = netChangeRow ? extractValue(netChangeRow, true) : null;
    
    // Log extraction results
    console.log("[CF][FOUND_CASH]", {
      beginFound: !!beginNode,
      beginAmt,
      endFound: !!endNode,
      endAmt
    });
    
    // Use extracted amounts
    const begin = beginAmt;
    const end = endAmt;
    
    // Get explicit labels from matched rows
    const netChangeLabel = netChangeRow ? getLabel(netChangeRow) : "Net increase (decrease) in cash";
    const beginLabel = beginNode ? getLabel(beginNode) : "Cash at beginning of period";
    const endLabel = endNode ? getLabel(endNode) : "Cash at end of period";
    
    // 6) Reconciliation check (log only)
    if (begin != null && netChange != null && end != null) {
      const check = (begin as number) + (netChange as number) - (end as number);
      console.log("[CF] reconcile", {
        begin,
        netChange,
        end,
        check: check.toFixed(2)
      });
    }
    
    // 2) Preserve QBO row order - recursively walk tree structure
    const resultRows: any[] = [];
    const firstKey = 'Total'; // Single column for Cash Flow
    
    // Helper: recursively walk QBO structure, outputting in correct order with level tracking:
    // 1) Section header (level 0 for top-level, +1 for nested)
    // 2) Children (details and nested sections) in QBO order
    // 3) Section total (from Summary) AFTER all children
    const walkRows = (qboRows: any[], currentPath: string[], currentLevel: number, isTopLevel: boolean = false): void => {
      for (const row of qboRows) {
        const rowType = row?.type || '';
        const headerValue = row?.Header?.ColData?.[0]?.value || row?.Header?.ColData?.[0]?.Value || '';
        const label = String(headerValue).trim();
        
        if (rowType === 'Section') {
          // Section header - add as group row (no amount, just label)
          const fullPath = [...currentPath, label];
          const pathStr = fullPath.join(' / ');
          
          resultRows.push({
            account_id: row?.Header?.ColData?.[0]?.id,
            account_path: pathStr,
            account_name: label,
            level: currentLevel,
            isGroup: true,
            isSection: true,
            isTotal: false,
            isControl: false,
            [firstKey]: null, // Section header has no amount
          });
          
          // Process children in EXACT QBO order (preserve order, don't separate Data from Sections)
          if (row?.Rows?.Row) {
            for (const child of row.Rows.Row) {
              const childType = child?.type || '';
              
              if (childType === 'Data') {
                // Data row (detail line) - level is parent + 1
                const colData = child?.ColData || [];
                const dataLabel = String(colData[0]?.value ?? colData[0]?.Value ?? '').trim();
                const dataPath = [...fullPath, dataLabel];
                const dataPathStr = dataPath.join(' / ');
                const value = extractValue(child);
                
                resultRows.push({
                  account_id: colData[0]?.id,
                  account_path: dataPathStr,
                  account_name: dataLabel,
                  level: currentLevel + 1,
                  isGroup: false,
                  isSection: false,
                  isTotal: false,
                  isControl: false,
                  [firstKey]: value,
                });
              } else if (childType === 'Section') {
                // Nested section (e.g., "Adjustments to reconcile...")
                // Recursively process: subsection header, its details, then its total
                walkRows([child], fullPath, currentLevel + 1, false);
              }
            }
          }
          
          // Add section total (from Summary) AFTER all children - separate row
          const sectionTotal = extractValue(row);
          if (sectionTotal != null) {
            // For top-level sections, use GAAP wording:
            // - Operating Activities → "Net cash provided by operating activities"
            // - Investing Activities → "Net cash used in investing activities"
            // - Financing Activities → "Net cash provided by financing activities"
            // For nested sections, use "Total [section name]"
            let totalLabel: string;
            if (isTopLevel) {
              const labelUpper = label.toUpperCase();
              if (labelUpper.includes('OPERATING')) {
                totalLabel = "Net cash provided by operating activities";
              } else if (labelUpper.includes('INVESTING')) {
                totalLabel = "Net cash used in investing activities";
              } else if (labelUpper.includes('FINANCING')) {
                totalLabel = "Net cash provided by financing activities";
              } else {
                totalLabel = `Total ${label.toUpperCase()}`;
              }
            } else {
              totalLabel = `Total ${label}`;
            }
            resultRows.push({
              account_id: null,
              account_path: `${pathStr} / ${totalLabel}`,
              account_name: totalLabel,
              level: currentLevel,
              isGroup: false,
              isSection: false,
              isTotal: true,
              isControl: false,
              [firstKey]: sectionTotal,
            });
          }
        } else if (rowType === 'Data') {
          // Data row (leaf detail) - should only happen at top level
          const colData = row?.ColData || [];
          const dataLabel = String(colData[0]?.value ?? colData[0]?.Value ?? '').trim();
          const fullPath = [...currentPath, dataLabel];
          const pathStr = fullPath.join(' / ');
          const value = extractValue(row);
          
          resultRows.push({
            account_id: colData[0]?.id,
            account_path: pathStr,
            account_name: dataLabel,
            level: currentLevel,
            isGroup: false,
            isSection: false,
            isTotal: false,
            isControl: false,
            [firstKey]: value,
          });
        }
      }
    };
    
    // Walk top-level sections in QBO order
    // Identify top-level sections (Operating, Investing, Financing)
    for (const row of rows) {
      if (row?.type === 'Section') {
        walkRows([row], [], 0, true); // level 0 for top-level, true = isTopLevel
      } else if (row?.type === 'Data') {
        // Handle any top-level Data rows (shouldn't happen in standard CF, but safe)
        const colData = row?.ColData || [];
        const dataLabel = String(colData[0]?.value ?? colData[0]?.Value ?? '').trim();
        const value = extractValue(row);
        
        resultRows.push({
          account_id: colData[0]?.id,
          account_path: dataLabel,
          account_name: dataLabel,
          level: 0,
          isGroup: false,
          isSection: false,
          isTotal: false,
          isControl: false,
          [firstKey]: value,
        });
      }
    }
    
    // Extract column names FIRST (needed for setting correct key on control rows)
    const columnTitles: string[] = []
    for (const col of cols) {
      const title = col?.ColTitle || ''
      if (title) columnTitles.push(title)
    }
    const dataColumns = columnTitles.slice(1) // Skip "Account"
    if (dataColumns.length === 0) {
      dataColumns.push('Total')
    }
    const colKey = dataColumns[0] || "Total"; // The actual column key (usually "Total")
    
    // 5) De-duplicate control rows BEFORE adding new ones
    // Filter out any row whose normalized label is exactly "total" AND value equals netChange or endingCash
    const normalizeLabel = (s: string): string => {
      return s.toLowerCase().replace(/\s+/g, " ").trim();
    };
    
    const filteredRows = resultRows.filter((r: any) => {
      const label = normalizeLabel(r.account_name || "");
      const value = r[firstKey];
      
      // Skip unlabeled "Total" rows that match control values
      if (label === "total" || label === "total ") {
        // If this "Total" has the same value as netChange or end, it's likely a duplicate
        if (netChange != null && value === netChange) return false;
        if (end != null && value === end) return false;
      }
      
      return true;
    });
    
    // 6) Add cash control rows at the end (in exact order, level 0, always bold)
    // Prefer QBO-provided rows; otherwise compute from section totals
    let netChangeValue = netChange;
    let beginValue = begin;
    let endValue = end;
    
    // If QBO didn't provide control rows, compute from section totals
    if (netChangeValue == null || beginValue == null || endValue == null) {
      // Find section totals from filteredRows
      const operatingTotal = filteredRows.find(r => r.account_name?.includes("Net cash provided by operating activities"))?.[firstKey] ?? null;
      const investingTotal = filteredRows.find(r => r.account_name?.includes("Net cash used in investing activities"))?.[firstKey] ?? null;
      const financingTotal = filteredRows.find(r => r.account_name?.includes("Net cash provided by financing activities"))?.[firstKey] ?? null;
      
      // Compute net change = operating + investing + financing
      if (netChangeValue == null && operatingTotal != null && investingTotal != null && financingTotal != null) {
        netChangeValue = (operatingTotal as number) + (investingTotal as number) + (financingTotal as number);
      }
      
      // Compute end = begin + change ONLY if begin is found (do not invent begin)
      if (endValue == null && beginValue != null && netChangeValue != null) {
        endValue = (beginValue as number) + (netChangeValue as number);
      }
      // Do NOT compute begin from end - only compute end from begin
    }
    
    // Add control rows with stable unique IDs and explicit labels
    // CRITICAL: Set amount using the actual column key (colKey) so it propagates to values
    const netChangeRowObj: any = {
      account_id: null,
      account_path: netChangeLabel,
      account_name: netChangeLabel, // Use explicit label from matched row
      level: 0,
      isGroup: false,
      isSection: false,
      isTotal: false,
      isControl: true,
      row_key: "cf:net-change", // Stable unique ID
    };
    netChangeRowObj[colKey] = netChangeValue; // REQUIRED: Set using actual column key
    filteredRows.push(netChangeRowObj);
    
    const beginRowObj: any = {
      account_id: null,
      account_path: beginLabel,
      account_name: beginLabel, // Use explicit label from matched row
      level: 0,
      isGroup: false,
      isSection: false,
      isTotal: false,
      isControl: true,
      row_key: "cf:beginning-cash", // Stable unique ID
    };
    beginRowObj[colKey] = beginValue; // REQUIRED: Set using actual column key (extracted from ColData[1])
    filteredRows.push(beginRowObj);
    
    const endRowObj: any = {
      account_id: null,
      account_path: endLabel,
      account_name: endLabel, // Use explicit label from matched row
      level: 0,
      isGroup: false,
      isSection: false,
      isTotal: false,
      isControl: true,
      row_key: "cf:ending-cash", // Stable unique ID
    };
    endRowObj[colKey] = endValue; // REQUIRED: Set using actual column key (extracted from ColData[1])
    filteredRows.push(endRowObj);
    
    // Use filteredRows instead of resultRows
    const finalRows = filteredRows;
    
    // Diagnostic: Log control rows before mapping to responseBody
    console.log("[CF][CONTROL_RAW]", finalRows.filter(r => r.isControl).map(r => ({
      name: r.account_name,
      Total: (r as any).Total,
      colKeyVal: (r as any)[colKey]
    })));

    // Return SeriesResponse shape
    const monthKey = toDate
    
    const responseBody = {
      ok: true,
      orgId,
      from: fromDate,
      to: toDate,
      months: [monthKey],
      columns: dataColumns,
      rows: finalRows.map((row, idx) => {
        // Build values object - ensure Total value is properly serialized
        const values: Record<string, number | null> = {}
        for (const colKey of dataColumns) {
          // Get value from row object: try colKey first, then firstKey (which is 'Total')
          // This ensures control rows with [firstKey] set properly serialize into values[colKey]
          values[colKey] = (row as any)[colKey] ?? (row as any)[firstKey] ?? null
        }
        
        // Use existing row_key if present (for control rows with stable IDs), otherwise generate one
        let row_key: string;
        if ((row as any).row_key) {
          row_key = (row as any).row_key; // Preserve stable IDs for control rows
        } else {
          // Generate guaranteed-unique row_key for other rows
          const base = row.account_path || row.account_name || ""
          const typeTag = row.isControl ? "control" : row.isTotal ? "total" : row.isSection ? "section" : "line"
          const idTag = row.account_id ? `id:${row.account_id}` : "noid"
          const idxTag = `i:${idx}`
          row_key = `cf|${typeTag}|${base}|${idTag}|${idxTag}`
        }
        
        return {
          account_id: row.account_id,
          account_path: row.account_path,
          account_name: row.account_name,
          level: row.level || 0,
          isGroup: row.isGroup || false,
          isSection: row.isSection || false,
          isTotal: row.isTotal || false,
          isControl: row.isControl || false,
          row_key: row_key,
          values,
        }
      }),
      success: true,
    };
    
    // Filter out unlabeled "Total" rows (case/whitespace-insensitive)
    // Keep real control lines (Net increase, Cash at beginning, Cash at end)
    const norm = (s: string = "") => s.toLowerCase().replace(/\s+/g, " ").trim();
    responseBody.rows = responseBody.rows.filter(r => norm(r.account_name) !== "total");
    
    // TEMP: Log API response to check ordering
    console.log("[CF][RESP]", JSON.stringify({
      rowCount: responseBody.rows.length,
      first10Rows: responseBody.rows.slice(0, 10).map(r => ({
        account_name: r.account_name,
        account_path: r.account_path,
        isSection: r.isSection,
        isTotal: r.isTotal,
        isControl: r.isControl,
        value: r.values[dataColumns[0] || 'Total']
      })),
      last10Rows: responseBody.rows.slice(-10).map(r => ({
        account_name: r.account_name,
        account_path: r.account_path,
        isSection: r.isSection,
        isTotal: r.isTotal,
        isControl: r.isControl,
        value: r.values[dataColumns[0] || 'Total']
      }))
    }, null, 2));
    
    console.log("[CF][RETURNING_ROWS]", { rowCount: responseBody.rows.length });
    
    // Diagnostic: Log what API returns for BeginningCash/EndingCash
    const pick = (name: string) => responseBody.rows.filter(r =>
      (r.account_name || "").toLowerCase().includes(name)
    ).map(r => ({
      account_name: r.account_name,
      account_path: r.account_path,
      values: r.values,
      isSection: r.isSection,
      isTotal: r.isTotal,
      isControl: r.isControl
    }));
    console.log("[CF][API_BEGIN_END]", {
      begin: pick("cash at beginning"),
      end: pick("cash at end"),
      totalsNamedTotal: responseBody.rows.filter(r => (r.account_name||"").trim().toLowerCase()==="total")
        .map(r => ({ values: r.values, path: r.account_path }))
    });
    
    // Diagnostic: Log actual values for Cash begin/end
    console.log("[CF][BEGIN_END_VALUES]", responseBody.rows.filter(r =>
      r.account_name?.toLowerCase().includes("cash at")
    ).map(r => ({ name: r.account_name, values: r.values })));
    
    return NextResponse.json(responseBody)
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to fetch Cash Flow report' },
      { status: 500 }
    )
  }
}

