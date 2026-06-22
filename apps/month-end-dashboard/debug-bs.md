# Balance Sheet Debug Evidence Pack

## 1. Fetch URL + Call Site

### loadBalanceSheetSeries function
**File:** `src/lib/api.ts` (lines 74-111)

```typescript
export async function loadBalanceSheetSeries(
  orgId: string,
  from: string,
  to: string
): Promise<SeriesResponse & { raw?: any; asOfStart?: string; asOfEnd?: string; columnKeys?: string[] }> {
  // Use rollforward endpoint for Start/Activity/End view
  const url = `/api/qbo/reports/balance-sheet-rollforward?orgId=${encodeURIComponent(orgId)}&to=${encodeURIComponent(to)}`;
  
  const resp = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
  });
  // ... rest of function
}
```

**Exact URL format:**
- Method: GET
- Path: `/api/qbo/reports/balance-sheet-rollforward`
- Query params: `orgId=<orgId>&to=<to>`
- Note: `from` is NOT passed - it's calculated server-side as prior month end

### React component that calls it
**File:** `src/components/reports/BalanceSheetView.tsx`

**useEffect trigger:**
```typescript
useEffect(() => {
  void loadBsAuto();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [orgId, from, to]);
```

**loadBsAuto function:**
```typescript
async function loadBsAuto() {
  if (!orgId || !from || !to) return;

  try {
    setStatus("Loading Balance Sheet...");
    setSeriesData(null);

    const series = await loadBalanceSheetSeries(orgId, from, to);
    setSeriesData(series);

    setStatus(`Balance Sheet loaded ✅ (${series.rows.length} account(s))`);
  } catch (e: any) {
    setStatus(`Error: ${e?.message || String(e)}`);
  }
}
```

## 2. Client-Side Instrumentation

Added logs in:
- `BalanceSheetView.tsx` - `loadBsAuto()` function
- `api.ts` - `loadBalanceSheetSeries()` function

**Log points:**
- `[BS] load start` - When load begins
- `[BS API Client] fetch URL` - The exact URL being called
- `[BS API Client] response status` - HTTP status code
- `[BS API Client] response data` - Response data structure
- `[BS] load success` - On successful load
- `[BS] load error` - On error

## 3. Server-Side Instrumentation

Added logs in:
- `src/app/api/qbo/reports/balance-sheet-rollforward/route.ts`
- `src/lib/reports/trialBalanceRollForward.ts`

**Log points:**
- `[BS API] ENTER` - Route entry with params
- `[BS API] before/after ensureOrgAccessApi`
- `[BS API] before/after buildTrialBalanceRollForward`
- `[BS API] before/after filter BS accounts`
- `[BS API] before/after build GAAP paths`
- `[BS API] RETURN` - Final response with row count and timing
- `[BS API] ERROR` - Any errors with stack trace

**buildTrialBalanceRollForward logs:**
- `[buildTrialBalanceRollForward] ENTER`
- `[buildTrialBalanceRollForward] before/after getTrialBalanceReport (start/end)`
- `[buildTrialBalanceRollForward] before/after fetch accounts`
- `[buildTrialBalanceRollForward] before/after parseTbRows`
- `[buildTrialBalanceRollForward] RETURN`

## 4. Curl Test Command

To test the endpoint directly (bypassing React):

```bash
# Replace <ORG_ID> with actual org ID
# Replace <TO_DATE> with date like 2025-11-30
curl -s "http://localhost:3013/api/qbo/reports/balance-sheet-rollforward?orgId=<ORG_ID>&to=<TO_DATE>" \
  -H "Cookie: $(cat ~/.cookie-jar 2>/dev/null || echo '')" \
  | head -c 2000
```

**Note:** You'll need to include authentication cookies. Check browser DevTools → Network tab → Copy as cURL to get the full command with cookies.

## 5. Server Console Output

After reloading the Balance Sheet page, check server console for:

1. `[BS API] ENTER` - Confirms request received
2. `[buildTrialBalanceRollForward] ENTER` - Confirms TB rollforward started
3. `[buildTrialBalanceRollForward] after getTrialBalanceReport` - Confirms TB data fetched
4. `[BS API] RETURN` - Confirms response sent
5. Any `[BS API] ERROR` or stack traces

## Expected Flow

1. Client: `[BS] load start` → `[BS API Client] fetch URL`
2. Server: `[BS API] ENTER` → `[buildTrialBalanceRollForward] ENTER`
3. Server: TB fetches complete → `[BS API] RETURN`
4. Client: `[BS API Client] response data` → `[BS] load success`

If stuck, check where the logs stop to identify the hang point.

