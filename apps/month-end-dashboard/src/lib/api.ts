// Client-side API functions for QBO reports
// Module-level response cache so remounting View components skips network

const _apiCache = new Map<string, { data: any; ts: number }>()
const API_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

function apiCacheGet(key: string): any | undefined {
  const entry = _apiCache.get(key)
  if (!entry) return undefined
  if (Date.now() - entry.ts > API_CACHE_TTL) {
    _apiCache.delete(key)
    return undefined
  }
  return entry.data
}

function apiCacheSet(key: string, data: any): void {
  _apiCache.set(key, { data, ts: Date.now() })
  // Evict stale entries periodically
  if (_apiCache.size > 100) {
    const now = Date.now()
    for (const [k, v] of _apiCache) {
      if (now - v.ts > API_CACHE_TTL) _apiCache.delete(k)
    }
  }
}

/** Clear the client API cache (call when org/period changes) */
export function clearApiCache(): void {
  _apiCache.clear()
}

export type SeriesRow = {
  account_id?: string;
  account_name: string;
  values: Record<string, number>; // colKey -> amount
};

export type SeriesResponse = {
  ok: boolean;
  orgId: string;
  from: string;
  to: string;
  months: string[]; // ["2025-09", "2025-10", ...]
  columns: string[]; // ["start", "2025-09", "2025-10", ..., "end"]
  rows: SeriesRow[];
};

// Trial Balance
export async function loadTrialBalance(orgId: string, from: string, to: string): Promise<any> {
  const ck = `tb|${orgId}|${from}|${to}`
  const cached = apiCacheGet(ck)
  if (cached) return cached

  const url = `/api/qbo/reports/trial-balance`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ orgId, fromDate: from, toDate: to }),
  });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({ error: `Request failed (${resp.status})` }));
    throw new Error(error.error || `Request failed (${resp.status})`);
  }
  const data = await resp.json();
  const result = { tb: data.report, beginning: data.beginning };
  apiCacheSet(ck, result)
  return result
}

export async function loadTrialBalanceSeries(
  orgId: string,
  from: string,
  to: string
): Promise<SeriesResponse> {
  // For now, return single month as series (can enhance later)
  const single = await loadTrialBalance(orgId, from, to);
  // TODO: Implement multi-month series endpoint
  return {
    ok: true,
    orgId,
    from,
    to,
    months: [from],
    columns: ['Total'],
    rows: [],
  };
}

// Balance Sheet
export async function loadBalanceSheet(orgId: string, from: string, to: string): Promise<any> {
  const ck = `bs|${orgId}|${from}|${to}`
  const cached = apiCacheGet(ck)
  if (cached) return cached

  const url = `/api/qbo/reports/balance-sheet`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ orgId, asOfDate: to }),
  });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({ error: `Request failed (${resp.status})` }));
    throw new Error(error.error || `Request failed (${resp.status})`);
  }
  const data = await resp.json();
  const result = { bs: data.report };
  apiCacheSet(ck, result)
  return result
}

export async function loadBalanceSheetNative(
  orgId: string,
  from: string,
  to: string
): Promise<SeriesResponse & { raw?: any; asOfEnd?: string }> {
  const ck = `bsNative|${orgId}|${from}|${to}`
  const cached = apiCacheGet(ck)
  if (cached) return cached

  // Use native QBO Balance Sheet endpoint
  const url = `/api/qbo/reports/balance-sheet-native?orgId=${encodeURIComponent(orgId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  const resp = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    let errJson: any = null;
    try { errJson = text ? JSON.parse(text) : null; } catch { }

    const msg =
      (errJson && (errJson.error || errJson.message)) ||
      (typeof errJson === "string" ? errJson : "") ||
      text ||
      `Request failed (${resp.status})`;

    throw new Error(msg);
  }
  const data = await resp.json();

  // API returns native BS shape with single column
  if (data.ok && data.rows && Array.isArray(data.rows)) {
    const result = {
      ok: data.ok,
      orgId: data.orgId || orgId,
      from: from,
      to: data.asOfEnd || to,
      months: [data.asOfEnd || to],
      columns: data.columns || ['Total'],
      rows: data.rows,
      asOfEnd: data.asOfEnd,
      raw: data.raw,
    };
    apiCacheSet(ck, result)
    return result
  }

  throw new Error('Invalid response format: missing ok, rows, or columns');
}

export async function loadBalanceSheetSeries(
  orgId: string,
  from: string,
  to: string
): Promise<SeriesResponse & { raw?: any; asOfStart?: string; asOfEnd?: string; columnKeys?: string[] }> {
  const ck = `bsSeries|${orgId}|${from}|${to}`
  const cached = apiCacheGet(ck)
  if (cached) return cached

  // Use rollforward endpoint for Start/Activity/End view
  const url = `/api/qbo/reports/balance-sheet-rollforward?orgId=${encodeURIComponent(orgId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  const resp = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    let errJson: any = null;
    try { errJson = text ? JSON.parse(text) : null; } catch { }

    const msg =
      (errJson && (errJson.error || errJson.message)) ||
      (typeof errJson === "string" ? errJson : "") ||
      text ||
      `Request failed (${resp.status})`;

    throw new Error(msg);
  }
  const data = await resp.json();

  // API returns rollforward shape with Start/Activity/End
  if (data.ok && data.rows && Array.isArray(data.rows)) {
    const result = {
      ok: data.ok,
      orgId: data.orgId || orgId,
      from: data.asOfStart || from,
      to: data.asOfEnd || to,
      months: [data.asOfStart, data.asOfEnd], // For reference
      columns: data.columns || ['Start', 'Activity', 'End'],
      rows: data.rows,
      // Include rollforward metadata
      asOfStart: data.asOfStart,
      asOfEnd: data.asOfEnd,
      columnKeys: data.columnKeys || ['Start', 'Activity', 'End'],
    };
    apiCacheSet(ck, result)
    return result
  }

  throw new Error('Invalid response format: missing ok, rows, or columns');
}

// Profit & Loss
export async function loadPnl(orgId: string, from: string, to: string): Promise<any> {
  const ck = `pnl|${orgId}|${from}|${to}`
  const cached = apiCacheGet(ck)
  if (cached) return cached

  const url = `/api/qbo/reports/profit-loss`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ orgId, fromDate: from, toDate: to }),
  });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({ error: `Request failed (${resp.status})` }));
    throw new Error(error.error || `Request failed (${resp.status})`);
  }
  const data = await resp.json();
  const result = { pnl: data.report }; // Match old format
  apiCacheSet(ck, result)
  return result
}

export async function loadPnlSeries(orgId: string, from: string, to: string): Promise<SeriesResponse> {
  const ck = `pnlSeries|${orgId}|${from}|${to}`
  const cached = apiCacheGet(ck)
  if (cached) return cached

  const url = `/api/qbo/reports/profit-loss`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ orgId, fromDate: from, toDate: to }),
  });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({ error: `Request failed (${resp.status})` }));
    throw new Error(error.error || `Request failed (${resp.status})`);
  }
  const data = await resp.json();

  // API now returns SeriesResponse shape directly
  if (data.ok && data.rows && Array.isArray(data.rows)) {
    const result = {
      ok: data.ok,
      orgId: data.orgId || orgId,
      from: data.from || from,
      to: data.to || to,
      months: data.months || [to],
      columns: data.columns || ['Total'],
      rows: data.rows,
    };
    apiCacheSet(ck, result)
    return result
  }

  throw new Error('Invalid response format: missing ok, rows, or columns');
}

// Cash Flow
export async function loadCashFlow(orgId: string, from: string, to: string): Promise<any> {
  const ck = `cf|${orgId}|${from}|${to}`
  const cached = apiCacheGet(ck)
  if (cached) return cached

  const url = `/api/qbo/reports/cash-flow`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ orgId, fromDate: from, toDate: to }),
  });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({ error: `Request failed (${resp.status})` }));
    throw new Error(error.error || `Request failed (${resp.status})`);
  }
  const data = await resp.json();
  const result = { cf: data.report }; // Match old format
  apiCacheSet(ck, result)
  return result
}

export async function loadCashFlowSeries(
  orgId: string,
  from: string,
  to: string
): Promise<SeriesResponse> {
  const ck = `cfSeries|${orgId}|${from}|${to}`
  const cached = apiCacheGet(ck)
  if (cached) return cached

  const url = `/api/qbo/reports/cash-flow`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ orgId, fromDate: from, toDate: to }),
  });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({ error: `Request failed (${resp.status})` }));
    throw new Error(error.error || `Request failed (${resp.status})`);
  }
  const data = await resp.json();

  // API now returns SeriesResponse shape directly
  if (data.ok && data.rows && Array.isArray(data.rows)) {
    const result = {
      ok: data.ok,
      orgId: data.orgId || orgId,
      from: data.from || from,
      to: data.to || to,
      months: data.months || [to],
      columns: data.columns || ['Total'],
      rows: data.rows,
    };
    apiCacheSet(ck, result)
    return result
  }

  throw new Error('Invalid response format: missing ok, rows, or columns');
}

// GL Details (for Trial Balance export)
export async function loadGlDetails(orgId: string, from: string, to: string): Promise<any> {
  // Placeholder - implement when GL endpoint is available
  return { ok: false, transactions: [] };
}

// Build Balance Sheet from Trial Balance (client-side)
export async function buildBalanceSheetFromTrialBalance(
  orgId: string,
  from: string,
  to: string
): Promise<SeriesResponse & { asOfStart: string; asOfEnd: string; rowsCount: number }> {
  console.log("[BS BUILDER] ENTER", { orgId, from, to });

  // Compute asOfStart = priorDay(from)
  const fromDate = new Date(from + 'T00:00:00Z')
  const priorDayDate = new Date(fromDate)
  priorDayDate.setUTCDate(priorDayDate.getUTCDate() - 1)
  const asOfStart = priorDayDate.toISOString().split('T')[0]
  const asOfEnd = to

  // Fetch two Trial Balance reports
  const startTb = await loadTrialBalance(orgId, asOfStart, asOfStart)
  const endTb = await loadTrialBalance(orgId, to, to)

  // Helper to parse QBO amount string
  const parseAmount = (str: string): number => {
    if (!str || str.trim() === '' || str === '—') return 0
    const cleaned = str.replace(/,/g, '').replace(/[()$]/g, '').trim()
    const isNegative = /^\(.*\)$/.test(str.trim())
    const num = Number(cleaned) || 0
    return isNegative ? -num : num
  }

  // Parse TB rows recursively into Map<accountId, { balance, name }>
  const parseTbRows = (tbData: any): Map<string, { balance: number; name: string }> => {
    const balanceMap = new Map<string, { balance: number; name: string }>()

    const extractRows = (rows: any[]): void => {
      if (!rows) return

      for (const row of rows) {
        if (row.ColData && row.ColData.length >= 4) {
          const accountId = row.ColData[0]?.id
          const accountName = row.ColData[0]?.value?.trim()

          if (accountId && accountName) {
            let balance = 0
            if (row.ColData.length >= 5 && row.ColData[4]?.value) {
              // Use balance column if present
              balance = parseAmount(row.ColData[4].value)
            } else if (row.ColData.length >= 4) {
              // Compute from debit/credit
              const debitStr = row.ColData[2]?.value || '0'
              const creditStr = row.ColData[3]?.value || '0'
              const debit = parseAmount(debitStr)
              const credit = parseAmount(creditStr)
              balance = debit - credit
            }

            balanceMap.set(accountId, { balance, name: accountName })
          }
        }

        // Recurse into nested rows
        if (row.Rows?.Row) {
          extractRows(Array.isArray(row.Rows.Row) ? row.Rows.Row : [row.Rows.Row])
        }
      }
    }

    if (tbData?.tb?.Rows?.Row) {
      const rows = Array.isArray(tbData.tb.Rows.Row) ? tbData.tb.Rows.Row : [tbData.tb.Rows.Row]
      extractRows(rows)
    }

    return balanceMap
  }

  const startMap = parseTbRows(startTb)
  const endMap = parseTbRows(endTb)

  console.log("[BS BUILDER] TB parsed", {
    startAccounts: startMap.size,
    endAccounts: endMap.size,
  });

  // Build rows directly from TB maps
  const allAccountIds = new Set([...startMap.keys(), ...endMap.keys()])
  const rows: SeriesRow[] = []

  for (const accountId of Array.from(allAccountIds).sort()) {
    const startData = startMap.get(accountId)
    const endData = endMap.get(accountId)

    const Start = startData?.balance ?? 0
    const End = endData?.balance ?? 0
    const Activity = End - Start

    // Optional noise filter
    if (Start === 0 && End === 0) continue

    const name = endData?.name ?? startData?.name ?? accountId

    rows.push({
      account_id: accountId,
      account_name: `FLAT / ${name}`,
      values: {
        Start,
        Activity,
        End,
      },
    })
  }

  console.log("[BS BUILDER] BS rows built", { rows: rows.length });

  return {
    ok: true,
    orgId,
    from: asOfStart,
    to: asOfEnd,
    months: [asOfStart, asOfEnd],
    columns: ['Start', 'Activity', 'End'],
    rows,
    asOfStart,
    asOfEnd,
    rowsCount: rows.length,
  }
}

