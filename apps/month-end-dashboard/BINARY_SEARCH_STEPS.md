# Binary Search Steps for /reports Compilation Hang

## ✅ Completed Setup

1. **Fixed package.json**: Changed `"dev": "next dev -p 3013"` to `"dev": "next dev"` (port passed via CLI)
2. **Added console.log to all components**:
   - `[LOAD] BalanceSheetView`
   - `[LOAD] PnlView`
   - `[LOAD] CashFlowView`
   - `[LOAD] TrialBalanceView`
3. **Commented out AccountDrilldownDrawer** in TrialBalanceView (temporarily)
4. **All report imports commented out** in ReportsClient.tsx

## Current State: STEP 1 - BalanceSheetView Only

**File**: `src/app/(app)/reports/ReportsClient.tsx`
- Only `BalanceSheetView` is imported and rendered
- Other tabs show placeholder message

## Testing Steps

### STEP 1: Test BalanceSheetView (CURRENT)
```bash
npm run dev -- -p 3013
```
1. Open `/reports`
2. Check browser console for `[LOAD] BalanceSheetView`
3. If it compiles and loads → proceed to STEP 2
4. If it hangs → BalanceSheetView import chain is the problem

### STEP 2: Add PnlView
Uncomment in `ReportsClient.tsx`:
```typescript
import { PnlView } from "@/components/reports/PnlView";
```
And in render:
```typescript
{activeTab === "pnl" && <PnlView />}
```
Restart dev server and test.

### STEP 3: Add CashFlowView
Uncomment in `ReportsClient.tsx`:
```typescript
import { CashFlowView } from "@/components/reports/CashFlowView";
```
And in render:
```typescript
{activeTab === "cf" && <CashFlowView />}
```
Restart dev server and test.

### STEP 4: Add TrialBalanceView (LAST)
Uncomment in `ReportsClient.tsx`:
```typescript
import dynamic from "next/dynamic";
const TrialBalanceViewLazy = dynamic(
  () => import("@/components/reports/TrialBalanceView").then(m => m.TrialBalanceView),
  { ssr: false, loading: () => <div className="text-sm text-slate-500">Loading Trial Balance…</div> }
);
```
And in render:
```typescript
{activeTab === "tb" && <TrialBalanceViewLazy />}
```
Restart dev server and test.

## If TrialBalanceView Causes Hang

The export functions already use dynamic imports, but if it still hangs:

1. **Check console.log**: Last `[LOAD]` message before hang shows which module is problematic
2. **AccountDrilldownDrawer is already commented out** - re-enable it last if TB works without it
3. **Check other static imports in TrialBalanceView**:
   - `formatCurrency` from `@/lib/formatCurrency`
   - `ReportHeader` from `@/components/ReportHeader`
   - `REPORT_TABLE_STYLES` from `@/components/ReportTable`

## Notes

- AccountDrilldownDrawer is temporarily disabled in TrialBalanceView
- Export functions (exportXlsx, exportCsv) already use dynamic imports
- All components have `[LOAD]` console.log statements for tracking

