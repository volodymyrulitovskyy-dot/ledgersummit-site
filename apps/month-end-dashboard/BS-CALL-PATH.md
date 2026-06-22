# Balance Sheet Call Path Analysis

## 1. Component Structure

**Active Component:** `src/components/reports/BalanceSheetView.tsx`
- Used by: `src/app/(app)/reports/ReportsClient.tsx` (line 89)
- NOT using: `src/app/(app)/reports/BalanceSheetReport.tsx` (this is used by old ReportsTabs.tsx)

## 2. API Call Path

### Client Side:
1. **ReportsClient.tsx** (line 89)
   ```tsx
   {activeTab === "bs" && <BalanceSheetView />}
   ```

2. **BalanceSheetView.tsx** (line 44-53)
   ```typescript
   async function loadBsAuto() {
     if (!orgId || !from || !to) return;

     console.log("[BS] load start", { orgId, from, to }); // ✅ LOG ADDED

     try {
       setStatus("Loading Balance Sheet...");
       setSeriesData(null);

       const series = await loadBalanceSheetSeries(orgId, from, to); // ← API CALL HERE
       // ...
     }
   }
   ```

3. **api.ts** - `loadBalanceSheetSeries` function (lines 74-111)
   ```typescript
   export async function loadBalanceSheetSeries(
     orgId: string,
     from: string,
     to: string
   ): Promise<SeriesResponse & { ... }> {
     // Use rollforward endpoint for Start/Activity/End view
     const url = `/api/qbo/reports/balance-sheet-rollforward?orgId=${encodeURIComponent(orgId)}&to=${encodeURIComponent(to)}`;
     
     console.log("[BS API Client] fetch URL:", url); // ✅ LOG ADDED
     
     const resp = await fetch(url, {
       method: 'GET',
       headers: { 'Content-Type': 'application/json' },
       credentials: 'include',
       cache: 'no-store',
     });
     
     console.log("[BS API Client] response status:", resp.status, resp.statusText); // ✅ LOG ADDED
     // ...
   }
   ```

### Server Side:
4. **API Route:** `src/app/api/qbo/reports/balance-sheet-rollforward/route.ts`
   ```typescript
   export async function GET(request: NextRequest) {
     const startTime = Date.now()
     
     try {
       await ensureUserApi()

       const { searchParams } = new URL(request.url)
       const orgId = searchParams.get('orgId')
       const to = searchParams.get('to')

       // Calculate from date (prior month end)
       const toDate = new Date(to + 'T00:00:00Z')
       const priorMonthEnd = new Date(toDate)
       priorMonthEnd.setUTCDate(0)
       const from = priorMonthEnd.toISOString().split('T')[0]

       console.log("[BS API] ENTER", { orgId, from, to, ts: new Date().toISOString() }); // ✅ LOG ADDED
       // ...
     }
   }
   ```

## 3. Exact URL Format

**Endpoint:** `GET /api/qbo/reports/balance-sheet-rollforward`

**Query Parameters:**
- `orgId` - Organization ID (required)
- `to` - End date in YYYY-MM-DD format (required)
- Note: `from` is calculated server-side as prior month end

**Example URL:**
```
/api/qbo/reports/balance-sheet-rollforward?orgId=abc123&to=2025-11-30
```

## 4. Log Points Summary

### Client Logs (Browser Console):
- `[BS] load start` - When BalanceSheetView starts loading
- `[BS API Client] fetch URL` - Exact URL being called
- `[BS API Client] response status` - HTTP status code
- `[BS API Client] response data` - Response structure
- `[BS] load success` - On successful load
- `[BS] load error` - On error

### Server Logs (Terminal/Server Console):
- `[BS API] ENTER` - Route entry with params
- `[BS API] before/after ensureOrgAccessApi` - Auth check
- `[BS API] before buildTrialBalanceRollForward` - Before TB call
- `[buildTrialBalanceRollForward] ENTER` - TB function entry
- `[buildTrialBalanceRollForward] before/after getTrialBalanceReport` - TB fetches
- `[BS API] after buildTrialBalanceRollForward` - After TB call
- `[BS API] before/after filter BS accounts` - Filtering step
- `[BS API] before/after build GAAP paths` - Path building
- `[BS API] RETURN` - Final response with timing
- `[BS API] ERROR` - Any errors with stack trace

## 5. Testing Instructions

1. **Open Browser DevTools Console**
2. **Navigate to /reports page and click Balance Sheet tab**
3. **Watch for logs:**
   - Should see `[BS] load start` immediately
   - Should see `[BS API Client] fetch URL` with the exact URL
   - Should see `[BS API Client] response status` (200 if successful)
   - Should see `[BS] load success` with row count

4. **Check Server Console (Terminal running `npm run dev`)**
   - Should see `[BS API] ENTER` when request arrives
   - Should see `[buildTrialBalanceRollForward] ENTER` when TB starts
   - Should see `[BS API] RETURN` when response is sent

5. **If stuck, identify where logs stop:**
   - No `[BS] load start` → Component not mounting/useEffect not running
   - `[BS] load start` but no `[BS API Client] fetch URL` → loadBalanceSheetSeries not being called
   - `[BS API Client] fetch URL` but no `[BS API] ENTER` → Request not reaching server (network issue)
   - `[BS API] ENTER` but no `[BS API] RETURN` → Server hanging (check last log point)

