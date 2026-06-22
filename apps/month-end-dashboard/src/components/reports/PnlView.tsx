"use client";

console.log("[LOAD] PnlView");

import { useEffect, useMemo, useState } from "react";
import { loadPnl, loadPnlSeries, type SeriesResponse } from "@/lib/api";
import { useOrgPeriod } from "@/components/OrgPeriodProvider";
import { flattenQboRows } from "@/lib/reports/qboFlatten";
import { buildStatementTree, flattenStatementTree, type StatementRow } from "@/lib/reports/statementTree";
import { StatementTable } from "@/components/StatementTable";
import { ReportHeader } from "@/components/ReportHeader";
import { exportRowsToXlsx } from "@/lib/exportXlsx";
import { exportRowsToCsv } from "@/lib/exportCsv";
import { formatCurrency } from "@/lib/formatCurrency";
import { Button } from "@/components/ui/button";
import { AccountDrilldownDrawer } from "@/components/reports/AccountDrilldownDrawer";

type Col = { ColTitle?: string; ColType?: string; MetaData?: any[] };
type RowNode = {
  type?: string;
  group?: string;
  ColData?: any[];
  Header?: { ColData?: any[] };
  Summary?: { ColData?: any[] };
  Rows?: { Row?: RowNode[] };
};

type PnlViewProps = {
  compact?: boolean;
};

export function PnlView({ compact = false }: PnlViewProps) {
  const { state } = useOrgPeriod();
  const orgId = state.orgId;
  const orgName = state.orgName;
  const from = state.from;
  const to = state.to;

  const [status, setStatus] = useState<string>("—");
  const [seriesData, setSeriesData] = useState<SeriesResponse | null>(null);
  const [drilldown, setDrilldown] = useState<{
    accountId: string;
    accountName: string;
    balance?: number | null;
    balanceLabel?: string;
  } | null>(null);

  // Build statement rows from series data
  const statementRows: StatementRow[] = useMemo(() => {
    if (!seriesData || !seriesData.rows) return [];
    return seriesData.rows.map((row) => {
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
      includeStatementTotals: false,
      indentPerLevel: 16,
      statementType: "pnl",
      columnKeys: seriesData.columns,
    });
  }, [statementTree, seriesData]);

  type ColumnModel = { key: string; label: string };

  const displayColumns: ColumnModel[] = useMemo(() => {
    if (!seriesData) return [{ key: "account", label: "Account" }];
    
    return [
      { key: "account", label: "Account" },
      ...seriesData.columns.map((col) => {
        if (col === "start") return { key: "start", label: "Start" };
        if (col === "end") return { key: "end", label: "End" };
        // For single month, use "Total"
        if (seriesData.columns.length === 1) {
          return { key: col, label: "Total" };
        }
        // For multi-month, format as "Nov 2025"
        const [year, month] = col.split("-");
        const monthNum = parseInt(month, 10);
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return { key: col, label: `${monthNames[monthNum - 1]} ${year}` };
      }),
    ];
  }, [seriesData]);


  function renderTable() {
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
          if (params.accountId) {
            setDrilldown({
              accountId: params.accountId,
              accountName: params.accountName,
              balance: params.value,
              balanceLabel: `Activity (${params.columnKey})`,
            });
          }
        }}
      />
    );
  }

  async function loadPnlAuto() {
    if (!orgId || !from || !to) return;

    try {
      setStatus("Loading P&L...");
      setSeriesData(null);

      const series = await loadPnlSeries(orgId, from, to);
      setSeriesData(series);
      
      setStatus(`P&L loaded ✅ (${series.rows.length} account(s))`);
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    }
  }

  useEffect(() => {
    void loadPnlAuto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, from, to]);

  // Export functions
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
    exportRowsToXlsx(`ProfitLoss_${from}_${to}`, "Profit & Loss", rows);
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
    exportRowsToCsv(`ProfitLoss_${from}_${to}`, rows, displayColumns.map(c => c.label));
  }

  // Format period label: "From: 2025-11-01 To: 2025-11-30" for P&L
  const periodLabel = from && to ? `From: ${from} To: ${to}` : "—";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <ReportHeader
        title="Profit & Loss"
        orgName={orgName}
        periodLabel={periodLabel}
        controls={
          <>
            <Button
              variant="ghost"
              onClick={handleExportExcel}
              disabled={!seriesData}
              title={!seriesData ? "Load the P&L first" : "Export to Excel"}
            >
              Export Excel
            </Button>
            <Button
              variant="ghost"
              onClick={handleExportCsv}
              disabled={!seriesData}
              title={!seriesData ? "Load the P&L first" : "Export to CSV"}
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

      {/* Drill-down Drawer */}
      {drilldown && (
        <AccountDrilldownDrawer
          open={!!drilldown}
          onClose={() => setDrilldown(null)}
          accountId={drilldown.accountId}
          accountName={drilldown.accountName}
          reportType="pnl"
          from={from}
          to={to}
          balance={drilldown.balance}
          balanceLabel={drilldown.balanceLabel}
        />
      )}
    </div>
  );
}

