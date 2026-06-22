"use client";

console.log("[LOAD] CashFlowView");

import { useEffect, useMemo, useState } from "react";
import { loadCashFlow, loadCashFlowSeries, type SeriesResponse } from "@/lib/api";
import { useOrgPeriod } from "@/components/OrgPeriodProvider";
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

type CashFlowViewProps = {
  compact?: boolean;
};

export function CashFlowView({ compact = false }: CashFlowViewProps) {
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

  async function loadCfAuto() {
    if (!orgId || !from || !to) return;

    try {
      setStatus("Loading Cash Flow...");
      setSeriesData(null);

      const series = await loadCashFlowSeries(orgId, from, to);
      setSeriesData(series);
      
      // Diagnostic: Log what UI receives for BeginningCash/EndingCash
      console.log("[CF][UI_BEGIN_END]", (series?.rows ?? []).filter(r =>
        (r.account_name||"").toLowerCase().includes("cash at")
        || (r.account_name||"").trim().toLowerCase()==="total"
      ).map(r => ({ account_name: r.account_name, values: r.values, account_path: r.account_path })));
      
      setStatus(`Cash Flow loaded ✅ (${series.rows.length} account(s))`);
    } catch (e: any) {
      setStatus(`Error: ${e?.message || String(e)}`);
    }
  }

  useEffect(() => {
    void loadCfAuto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, from, to]);

  // Render API rows directly (no tree build/flatten for Cash Flow)
  // API already provides rows in correct order with level/indent info
  const displayRows = useMemo(() => {
    if (!seriesData || !seriesData.rows) return [];
    
    // Map API rows directly to display format (matching FlattenedStatementRow type)
    return seriesData.rows.map((row: any, idx: number) => {
      const level = row.level || 0;
      const indent = level * 16;
      const isSection = row.isSection || false;
      const isTotal = row.isTotal || false;
      const isControl = row.isControl || false;
      const isGroup = row.isGroup || false;
      
      // Style rules:
      // - isSection => bold header row (no amount or show "—")
      // - isTotal or isControl => bold
      // - else normal
      
      // For control rows, preserve row_key directly (don't rebuild from account_name)
      // For other rows, use row_key from API or fallback
      const rowKey = row.row_key || row.account_id || row.account_path || `row-${idx}`;
      
      return {
        key: rowKey, // Preserve row_key from API (especially for control rows with stable IDs)
        label: row.account_name || '',
        level: level,
        indent: indent,
        isGroup: isGroup,
        isSubtotal: false, // API doesn't use subtotals, only totals
        isTotal: isTotal || isControl, // Both totals and control rows are bold
        accountId: row.account_id,
        values: row.values || {},
      };
    });
  }, [seriesData]);

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
    if (displayRows.length === 0) {
      return <div className="text-sm text-slate-700">No rows to display.</div>;
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
    exportRowsToXlsx(`CashFlow_${from}_${to}`, "Cash Flow", rows);
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
    exportRowsToCsv(`CashFlow_${from}_${to}`, rows, displayColumns.map(c => c.label));
  }

  // Format period label: "From: 2025-11-01 To: 2025-11-30" for Cash Flow
  const periodLabel = from && to ? `From: ${from} To: ${to}` : "—";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <ReportHeader
        title="Cash Flow"
        orgName={orgName}
        periodLabel={periodLabel}
        controls={
          <>
            <Button
              variant="ghost"
              onClick={handleExportExcel}
              disabled={!seriesData}
              title={!seriesData ? "Load the Cash Flow first" : "Export to Excel"}
            >
              Export Excel
            </Button>
            <Button
              variant="ghost"
              onClick={handleExportCsv}
              disabled={!seriesData}
              title={!seriesData ? "Load the Cash Flow first" : "Export to CSV"}
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
          reportType="cf"
          from={from}
          to={to}
          balance={drilldown.balance}
          balanceLabel={drilldown.balanceLabel}
        />
      )}
    </div>
  );
}

