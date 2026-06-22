"use client";

console.log("[LOAD] BalanceSheetView");

import { useEffect, useMemo, useState } from "react";
import { loadBalanceSheetSeries, loadBalanceSheetNative, type SeriesResponse } from "@/lib/api";

// Toggle to use native QBO Balance Sheet instead of rollforward
const USE_NATIVE_BS = true;
import { useOrgPeriod } from "@/components/OrgPeriodProvider";
import { buildStatementTree, flattenStatementTree, type StatementRow } from "@/lib/reports/statementTree";
import { StatementTable } from "@/components/StatementTable";
import { ReportHeader } from "@/components/ReportHeader";
import { exportRowsToXlsx } from "@/lib/exportXlsx";
import { exportRowsToCsv } from "@/lib/exportCsv";
import { formatCurrency } from "@/lib/formatCurrency";
import { Button } from "@/components/ui/button";
import { AccountDrilldownDrawer } from "@/components/reports/AccountDrilldownDrawer";

type BalanceSheetViewProps = {
  compact?: boolean;
};

type DrilldownState = {
  accountId: string;
  accountName: string;
  balance?: number | null;
  balanceLabel?: string;
  mode: "ACTIVITY" | "ASOF";
  from?: string;
  to?: string;
  asOf?: string;
};

export function BalanceSheetView({ compact = false }: BalanceSheetViewProps) {
  const { state } = useOrgPeriod();
  const orgId = state.orgId;
  const orgName = state.orgName;
  const from = state.from;
  const to = state.to;

  const [status, setStatus] = useState<string>("—");
  const [seriesData, setSeriesData] = useState<
    (SeriesResponse & { asOfStart?: string; asOfEnd?: string }) | null
  >(null);

  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);

  async function loadBsAuto() {
    if (!orgId || !from || !to) return;

    console.log("[BS VIEW] load triggered", { orgId, from, to });
    console.log("[BS] load start", { orgId, from, to });

    try {
      setStatus("Loading Balance Sheet...");
      setSeriesData(null);

      console.log("[BS] fetch start", { orgId, from, to, useNative: USE_NATIVE_BS });
      const series = USE_NATIVE_BS
        ? await loadBalanceSheetNative(orgId, from, to)
        : await loadBalanceSheetSeries(orgId, from, to);
      
      console.log("[BS UI] received from API", {
        ok: series?.ok,
        rowsCount: series?.rowsCount,
        rowsLen: series?.rows?.length,
        firstRow: series?.rows?.[0],
        asOfStart: (series as any)?.asOfStart,
        asOfEnd: (series as any)?.asOfEnd,
      });

      setSeriesData(series);

      setStatus(`Balance Sheet loaded ✅ (${series.rows.length} account(s))`);
    } catch (e: any) {
      console.error("[BS] load error", e);
      setStatus(`Error: ${e?.message || String(e)}`);
    }
  }

  useEffect(() => {
    void loadBsAuto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, from, to]);

  /**
   * IMPORTANT:
   * For grouping to work (same as P&L), each row.account_name MUST already be a path-like string,
   * e.g. "ASSETS / Current Assets / Bank Accounts / 35 - Checking"
   *
   * We do NOT try to invent grouping in the frontend.
   */
  const statementRows: StatementRow[] = useMemo(() => {
    if (!seriesData || !seriesData.rows) return [];

    return seriesData.rows.map((row: any) => {
      const fullPath = row.account_name || "";
      const pathSegments = fullPath.split(" / ").filter(Boolean);
      const leafName = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : fullPath;

      return {
        account_id: row.account_id || undefined,
        account_path: fullPath,
        account_name: leafName,
        ...row.values,
      };
    });
  }, [seriesData]);

  const statementTree = useMemo(() => {
    if (statementRows.length === 0 || !seriesData) return null;

    return buildStatementTree(statementRows, {
      pathAccessor: (row) => row.account_path || row.account_name || "",
      accountIdAccessor: (row) => row.account_id,
      columnKeys: seriesData.columns,
    });
  }, [statementRows, seriesData]);

  const displayRows = useMemo(() => {
    if (!statementTree || !seriesData) return [];

    return flattenStatementTree(statementTree, {
      includeSubtotals: true,
      includeStatementTotals: true,
      indentPerLevel: 16,
      statementType: "bs",
      columnKeys: seriesData.columns,
    });
  }, [statementTree, seriesData]);

  type ColumnModel = { key: string; label: string };

  const displayColumns: ColumnModel[] = useMemo(() => {
    if (!seriesData) return [{ key: "account", label: "Account" }];

    // Balance Sheet rollforward columns
    // seriesData.columns should be: ["Start", "Activity", "End"]
    // Use columnLabels if available for display, otherwise use column keys
    const columnLabels = (seriesData as any).columnLabels || seriesData.columns
    
    return [
      { key: "account", label: "Account" },
      ...seriesData.columns.map((col, idx) => {
        // Key must match exactly: "Start", "Activity", "End"
        const label = columnLabels[idx] || col
        return { key: col, label }
      }),
    ];
  }, [seriesData]);

  function renderTable() {
    if (statementRows.length === 0) {
      return <div className="text-sm text-slate-700">No Balance Sheet rows returned (0 accounts). Check API response.</div>;
    }
    if (!statementTree) {
      return <div className="text-sm text-slate-700">Building hierarchy...</div>;
    }
    if (displayRows.length === 0) {
      return <div className="text-sm text-slate-700">No display rows generated.</div>;
    }

    return (
      <StatementTable
        rows={displayRows}
        columns={displayColumns}
        formatMoney={(val) => {
          if (val == null || !Number.isFinite(val)) return "—";
          return formatCurrency(val);
        }}
        onCellClick={(params) => {
          if (!params.accountId) return;
          if (!seriesData) return;

          const col = params.columnKey;

          // We need correct drill logic:
          // - Activity: actual period activity = from..to
          // - Start: as-of asOfStart (<= asOfStart)  [drawer uses mode=ASOF, asOf=asOfStart]
          // - End: as-of asOfEnd (<= asOfEnd)        [drawer uses mode=ASOF, asOf=asOfEnd]
          if (col === "Activity") {
            setDrilldown({
              accountId: params.accountId,
              accountName: params.accountName,
              balance: params.value,
              balanceLabel: "Activity (period)",
              mode: "ACTIVITY",
              from,
              to,
            });
            return;
          }

          if (col === "Start") {
            setDrilldown({
              accountId: params.accountId,
              accountName: params.accountName,
              balance: params.value,
              balanceLabel: `Start (as-of ${seriesData.asOfStart || "—"})`,
              mode: "ASOF",
              asOf: seriesData.asOfStart || undefined,
            });
            return;
          }

          if (col === "End") {
            setDrilldown({
              accountId: params.accountId,
              accountName: params.accountName,
              balance: params.value,
              balanceLabel: `End (as-of ${seriesData.asOfEnd || to || "—"})`,
              mode: "ASOF",
              asOf: seriesData.asOfEnd || to || undefined,
            });
            return;
          }

          // Fallback: treat anything else as Activity for safety
          setDrilldown({
            accountId: params.accountId,
            accountName: params.accountName,
            balance: params.value,
            balanceLabel: `Activity (${String(col)})`,
            mode: "ACTIVITY",
            from,
            to,
          });
        }}
      />
    );
  }

  function handleExportExcel() {
    if (!seriesData) return;

    const rows = displayRows
      .filter((r) => !r.isGroup)
      .map((r) => {
        const row: Record<string, any> = { Account: r.label };
        for (const col of displayColumns.slice(1)) {
          const val = (r.values as Record<string, any>)?.[col.key];
          row[col.label] = val ?? 0;
        }
        return row;
      });

    exportRowsToXlsx(`BalanceSheet_${to}`, "Balance Sheet", rows);
  }

  function handleExportCsv() {
    if (!seriesData) return;

    const rows = displayRows
      .filter((r) => !r.isGroup)
      .map((r) => {
        const row: Record<string, any> = { Account: r.label };
        for (const col of displayColumns.slice(1)) {
          const val = (r.values as Record<string, any>)?.[col.key];
          row[col.label] = val ?? 0;
        }
        return row;
      });

    exportRowsToCsv(`BalanceSheet_${to}`, rows, displayColumns.map((c) => c.label));
  }

  const periodLabel =
    seriesData?.asOfStart && seriesData?.asOfEnd
      ? `Start: ${seriesData.asOfStart}, End: ${seriesData.asOfEnd}`
      : from && to
        ? `From: ${from} To: ${to}`
        : "—";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="text-xs opacity-60">BS_RENDERER: BalanceSheetView.tsx v2</div>
      <ReportHeader
        title="Balance Sheet"
        orgName={orgName}
        periodLabel={periodLabel}
        controls={
          <>
            <Button
              variant="ghost"
              onClick={handleExportExcel}
              disabled={!seriesData}
              title={!seriesData ? "Load the Balance Sheet first" : "Export to Excel"}
            >
              Export Excel
            </Button>
            <Button
              variant="ghost"
              onClick={handleExportCsv}
              disabled={!seriesData}
              title={!seriesData ? "Load the Balance Sheet first" : "Export to CSV"}
            >
              Export CSV
            </Button>
          </>
        }
        statusText={status || "—"}
      />

      {seriesData && (
        <div className="rounded-3xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur p-5">
          {renderTable()}
        </div>
      )}

      {drilldown && (
        <AccountDrilldownDrawer
          open={!!drilldown}
          onClose={() => setDrilldown(null)}
          accountId={drilldown.accountId}
          accountName={drilldown.accountName}
          reportType="bs"
          mode={drilldown.mode}
          from={drilldown.from}
          to={drilldown.to}
          asOf={drilldown.asOf}
          balance={drilldown.balance}
          balanceLabel={drilldown.balanceLabel}
        />
      )}
    </div>
  );
}
