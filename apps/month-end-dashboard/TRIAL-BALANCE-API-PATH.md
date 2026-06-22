# Trial Balance API Call Path

## 1. Function Used by TrialBalanceView

**File:** `src/lib/api.ts` (lines 20-35)

```typescript
export async function loadTrialBalance(orgId: string, from: string, to: string): Promise<any> {
  const url = `/api/qbo/reports/trial-balance`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ orgId, fromDate: from, toDate: to }),
  });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({ error: `Request failed (${resp.status})` }));
    throw new Error(error.error || `Request failed (${resp.status})`);
  }
  const data = await resp.json();
  return { tb: data.report }; // Match old format
}
```

**Exact Fetch URL:**
- **Method:** POST
- **Path:** `/api/qbo/reports/trial-balance`
- **Body:** `{ orgId, fromDate: from, toDate: to }`
- **Headers:** `Content-Type: application/json`
- **Options:** `credentials: 'include'`, `cache: 'no-store'`

## 2. How TrialBalanceView Calls It

**File:** `src/components/reports/TrialBalanceView.tsx` (lines 126-151)

```typescript
async function loadTbAuto() {
  if (!orgId || !from || !to) return;

  try {
    setStatus("Loading TB...");
    setRaw(null);

    const fromIso = toIsoDate(from);
    const toIso = toIsoDate(to);

    const json = await loadTrialBalance(orgId, fromIso, toIso);
    setRaw(json);

    const rawRows = json?.tb?.Rows?.Row ?? [];
    const accountsCount = rawRows
      .filter((r: any) => Array.isArray(r?.ColData) && r.ColData.length >= 1)
      .filter((r: any) => {
        const name = String(r.ColData[0]?.value ?? "").trim().toUpperCase();
        return name && name !== "TOTAL";
      }).length;

    setStatus(`TB loaded ✅ (${accountsCount} account(s))`);
  } catch (e: any) {
    setStatus(`Error: ${e?.message || String(e)}`);
  }
}
```

**Trigger:** `useEffect` hook (line 160-163)
```typescript
useEffect(() => {
  void loadTbAuto();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [orgId, from, to, spansMultipleMonths]);
```

## 3. API Route It Hits

**File:** `src/app/api/qbo/reports/trial-balance/route.ts`

```typescript
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

    // Fetch from QBO
    const qboData = await getTrialBalanceReport(orgId, fromDate, toDate)

    // Return raw QBO data - UI will parse using statement tree helpers if needed
    return NextResponse.json({
      success: true,
      orgId,
      fromDate,
      toDate,
      report: qboData,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to fetch Trial Balance report' },
      { status: 500 }
    )
  }
}
```

## 4. Related Functions

**loadTrialBalanceSeries** (lines 37-54 in `api.ts`):
```typescript
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
```

**Note:** `loadTrialBalanceSeries` currently calls `loadTrialBalance` but returns a placeholder SeriesResponse. The multi-month series endpoint is not yet implemented.

## Summary

- **Client Function:** `loadTrialBalance(orgId, from, to)` in `src/lib/api.ts`
- **API Endpoint:** `POST /api/qbo/reports/trial-balance`
- **Request Body:** `{ orgId, fromDate, toDate }`
- **Response:** `{ success: true, orgId, fromDate, toDate, report: qboData }`
- **Client Wrapper:** Returns `{ tb: data.report }` to match old format
- **Used By:** `TrialBalanceView.tsx` via `loadTbAuto()` function

