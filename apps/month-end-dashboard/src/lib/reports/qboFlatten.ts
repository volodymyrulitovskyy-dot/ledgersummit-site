/**
 * Utilities to flatten QBO nested RowNode structures into flat rows with paths
 * Ported from old app
 */

type QboRowNode = {
  type?: string
  group?: string
  ColData?: Array<{ value?: string; id?: string }>
  Header?: { ColData?: Array<{ value?: string; id?: string }> }
  Summary?: { ColData?: Array<{ value?: string; id?: string }> }
  Rows?: { Row?: QboRowNode[] }
}

export type FlatRow = {
  path: string // Full path like "ASSETS / Current Assets / Checking"
  label: string // Last segment of path
  accountId?: string
  account_name?: string
  values: Record<string, number | null> // Column key -> value
  isGroup: boolean
  originalNode: QboRowNode
}

function toNumber(v: string | null | undefined): number | null {
  if (v == null) return null
  const s = String(v).trim()
  if (!s || s === "—" || s === "-" || s === "") return null
  // Handle QBO format: "(123.45)" for negatives, "$", commas
  const negByParens = /^\(.*\)$/.test(s)
  // Fix: remove $, commas, and parentheses correctly
  // First remove $ and commas, then check for parentheses
  const cleaned = s.replace(/\$/g, '').replace(/,/g, '').replace(/[()]/g, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return negByParens ? -n : n
}

/**
 * Flatten QBO nested RowNode structure into flat rows with paths.
 * Fixed to correctly handle row.type === "Data" vs "Section"
 */
export function flattenQboRows(
  rows: QboRowNode[],
  columns: string[],
  pathPrefix: string[] = [],
  qboColumns?: any[] // Optional: full QBO Columns.Column array for "Total" index mapping
): FlatRow[] {
  const result: FlatRow[] = []
  
  // Find "Total" column index from QBO columns (if provided)
  // totalColIdx is a ColData/Summary.ColData index (includes Account at 0)
  // If "Total" is at index 1 in Columns.Column, it's also index 1 in ColData
  let totalColIdx = 1; // Default: index 1 (Account=0, Total=1)
  if (qboColumns && qboColumns.length > 0) {
    const foundIdx = qboColumns.findIndex((c: any) => (c?.ColTitle || '').toLowerCase() === 'total');
    if (foundIdx >= 0) {
      totalColIdx = foundIdx;
    } else if (qboColumns.length >= 2) {
      totalColIdx = 1; // Fallback: assume Total is at index 1
    }
  }

  function walk(node: QboRowNode, currentPath: string[], currentGroup?: string): { childValues: Record<string, number | null>, childCount: number } {
    const nodeType = node.type || '';
    const isData = nodeType === 'Data';
    const isSection = nodeType === 'Section';
    const hasChildren = Array.isArray(node.Rows?.Row) && node.Rows.Row.length > 0;
    
    // TEMP debug log for Landscaping Services section
    const isLandscapingServices = currentPath.some(p => String(p).toLowerCase().includes('landscaping services'));
    if (isLandscapingServices) {
      const labelFrom = isData 
        ? (node.ColData?.[0]?.value || node.ColData?.[0]?.name || node.ColData?.[0]?.id)
        : (node.Header?.ColData?.[0]?.value || node.Header?.ColData?.[0]?.name || node.Header?.ColData?.[0]?.id);
      console.log("[P&L][LS] node", {
        type: node.type,
        group: node.group,
        labelFrom,
        colData: node.ColData,
        header: node.Header,
        summary: node.Summary,
        currentPath: currentPath.join(' / ')
      });
    }
    
    // Track child values for section reconciliation
    let childValues: Record<string, number | null> = {};
    let childCount = 0;

    if (isData) {
      // For Data rows: label from ColData[0].value, amount from ColData[totalIdx].value
      // Do NOT read Header/Summary for Data rows
      const colData = node.ColData ?? [];
      const accountId = colData[0]?.id;
      
      // Extract label with fallback sources
      const rawLabel = String(colData[0]?.value ?? colData[0]?.Value ?? "").trim();
      const fallbackLabel = colData[0]?.name || colData[0]?.id 
        ? `Unnamed (${colData[0]?.name || colData[0]?.id})` 
        : "";
      let label = rawLabel || fallbackLabel;
      
      // If label is still "", DO NOT return; set label = "Unnamed" and continue
      if (!label) {
        label = "Unnamed";
      }
      
      // Check if row has an amount value
      const valueStr = colData[totalColIdx]?.value ?? colData[totalColIdx]?.Value;
      const hasAmount = valueStr && valueStr !== "—" && valueStr !== "-" && String(valueStr).trim() !== "";
      
      // Only skip if no amount AND no children (empty placeholder row)
      if (!hasAmount && !node.Rows?.Row) {
        // No amount and no children - skip this row
        return { childValues: {}, childCount: 0 };
      }

      const fullPath = [...currentPath, label];
      // Fix: ensure FlatRow.path is unique (append accountId when present)
      const pathStr = accountId 
        ? `${fullPath.join(' / ')} [${accountId}]`
        : fullPath.join(' / ');
      
      // Extract values: use ColData directly (not Header/Summary)
      // For Data rows: ColData[0] = account name, ColData[totalColIdx] = Total column
      // totalColIdx is a ColData index (includes Account at 0)
      const values: Record<string, number | null> = {};
      const firstKey = columns[0] || 'Total';
      
      // Set ONLY values[firstKey] from ColData[totalColIdx]
      if (valueStr === "—" || valueStr === "-" || !valueStr || (typeof valueStr === 'string' && valueStr.trim() === "")) {
        values[firstKey] = null;
      } else {
        const num = toNumber(valueStr);
        values[firstKey] = num;
      }

      // Use parent group if Data row has no group
      const effectiveGroup = node.group || currentGroup;

      // Add this row (never skip Data rows - always create entry)
      result.push({
        path: pathStr,
        label: label,
        accountId,
        account_name: label,
        values,
        isGroup: false, // Data rows are never groups
        originalNode: { ...node, group: effectiveGroup }, // Preserve effective group
      });
      
      // Process children if any (Data rows can have nested children)
      if (node.Rows?.Row) {
        for (const child of node.Rows.Row) {
          const childResult = walk(child, fullPath, effectiveGroup);
          childCount += childResult.childCount;
          // Merge child values
          for (const key of Object.keys(childResult.childValues)) {
            const existing = childValues[key] ?? 0;
            const childVal = childResult.childValues[key] ?? 0;
            childValues[key] = (existing as number) + (childVal as number);
          }
        }
      }

      childCount = childCount || 1;
      // For Data rows, return their own values as child values (for section reconciliation)
      // Merge with child values if children were processed
      if (Object.keys(childValues).length === 0) {
        childValues = { ...values };
      } else {
        // Add this row's value to child values
        const existing = childValues[firstKey] ?? 0;
        const thisVal = values[firstKey] ?? 0;
        childValues[firstKey] = (existing as number) + (thisVal as number);
      }

    } else if (isSection) {
      // For Section rows: label from Header.ColData[0].value, section total from Summary.ColData[totalIdx].value
      const headerCells = node.Header?.ColData || [];
      const label = String(headerCells[0]?.value ?? headerCells[0]?.Value ?? '').trim();
      const accountId = headerCells[0]?.id;

      if (!label) {
        // No label - just process children
        if (node.Rows?.Row) {
          for (const child of node.Rows.Row) {
            const childResult = walk(child, currentPath, node.group || currentGroup);
            childCount += childResult.childCount;
            // Merge child values
            for (const key of Object.keys(childResult.childValues)) {
              const existing = childValues[key] ?? 0;
              const childVal = childResult.childValues[key] ?? 0;
              childValues[key] = (existing as number) + (childVal as number);
            }
          }
        }
        return { childValues, childCount };
      }

      const fullPath = [...currentPath, label];
      const pathStr = fullPath.join(' / ');
      const sectionGroup = node.group || currentGroup;

      // Extract BOTH: section total from Summary AND header own amount from Header
      // For Section rows: Summary.ColData[totalColIdx] = section total (includes header + children)
      //                   Header.ColData[totalColIdx] = section's own postings (not in children)
      const summaryCells = node.Summary?.ColData || [];
      const values: Record<string, number | null> = {};
      const firstKey = columns[0] || 'Total';
      
      // Extract section total from Summary.ColData[totalColIdx] (for display)
      const summaryValueStr = summaryCells[totalColIdx]?.value ?? summaryCells[totalColIdx]?.Value;
      if (summaryValueStr === "—" || summaryValueStr === "-" || !summaryValueStr || (typeof summaryValueStr === 'string' && summaryValueStr.trim() === "")) {
        values[firstKey] = null;
      } else {
        const num = toNumber(summaryValueStr);
        values[firstKey] = num;
      }

      // Extract header own amount from Header.ColData[totalColIdx]
      const headerOwnAmtStr = headerCells[totalColIdx]?.value ?? headerCells[totalColIdx]?.Value;
      const headerOwnAmt = headerOwnAmtStr && headerOwnAmtStr !== "—" && headerOwnAmtStr !== "-" && String(headerOwnAmtStr).trim() !== ""
        ? toNumber(headerOwnAmtStr)
        : null;

      // Add this section row BEFORE walking children (keep order: section header first)
      result.push({
        path: pathStr,
        label,
        accountId,
        account_name: label,
        values,
        isGroup: isSection && hasChildren,
        originalNode: { ...node, group: sectionGroup },
      });

      // Process children (to get their sum for reconciliation)
      // Children will be added to result in their recursive calls, appearing after this section
      if (hasChildren && node.Rows?.Row) {
        for (const child of node.Rows.Row) {
          const childResult = walk(child, fullPath, sectionGroup);
          childCount += childResult.childCount;
          // Sum child values for reconciliation (only firstKey)
          const existing = childValues[firstKey] ?? 0;
          const childVal = childResult.childValues[firstKey] ?? 0;
          childValues[firstKey] = (existing as number) + (childVal as number);
        }
      }

      // If hasChildren AND headerOwnAmt is non-null and abs(headerOwnAmt) > 0.01:
      // Add an extra FlatRow representing the section's own postings
      if (hasChildren && headerOwnAmt != null && Math.abs(headerOwnAmt) > 0.01) {
        const accountLabel = `${label} (account)`;
        const accountPathStr = accountId 
          ? `${pathStr} / ${accountLabel} [${accountId}]`
          : `${pathStr} / ${accountLabel}`;
        
        const accountValues: Record<string, number | null> = {};
        accountValues[firstKey] = headerOwnAmt;

        // Add the section's own postings row immediately after the section row
        result.push({
          path: accountPathStr,
          label: accountLabel,
          accountId,
          account_name: accountLabel,
          values: accountValues,
          isGroup: false,
          originalNode: { ...node, group: sectionGroup, type: 'Data' }, // Mark as Data-like for tree building
        });

        // Include headerOwnAmt in childValues for reconciliation
        const existing = childValues[firstKey] ?? 0;
        childValues[firstKey] = (existing as number) + (headerOwnAmt as number);
      }

      // Reconciliation: compare section Summary.Total vs sum of children (including header own amount)
      // Log only if delta > 0.01 (significant mismatch)
      if (hasChildren && summaryCells.length > 0) {
        const sectionSummaryValue = toNumber(summaryCells[totalColIdx]?.value ?? summaryCells[totalColIdx]?.Value);
        const sumOfChildren = childValues[firstKey] ?? 0;
        
        if (sectionSummaryValue != null && sumOfChildren != null) {
          const delta = Math.abs((sectionSummaryValue as number) - (sumOfChildren as number));
          if (delta > 0.01) {
            console.log("[P&L] section reconcile", {
              group: sectionGroup || 'missing',
              header: label,
              sectionSummary: sectionSummaryValue,
              sumOfChildren: sumOfChildren,
              headerOwnAmt: headerOwnAmt,
              delta: delta.toFixed(2)
            });
          }
        }
      }
    } else {
      // Unknown type - process children only (don't add as row)
      if (node.Rows?.Row) {
        for (const child of node.Rows.Row) {
          const childResult = walk(child, currentPath, node.group || currentGroup);
          childCount += childResult.childCount;
          // Merge child values
          for (const key of Object.keys(childResult.childValues)) {
            const existing = childValues[key] ?? 0;
            const childVal = childResult.childValues[key] ?? 0;
            childValues[key] = (existing as number) + (childVal as number);
          }
        }
      }
    }

    return { childValues, childCount };
  }

  for (const row of rows) {
    walk(row, pathPrefix, row.group);
  }

  return result
}

