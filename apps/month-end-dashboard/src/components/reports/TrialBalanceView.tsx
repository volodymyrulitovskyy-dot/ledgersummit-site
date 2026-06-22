"use client";

import { useEffect, useMemo, useState } from "react";
import { loadTrialBalance, loadTrialBalanceSeries, loadGlDetails, type SeriesResponse } from "@/lib/api";
import { useOrgPeriod } from "@/components/OrgPeriodProvider";
import { ReportHeader } from "@/components/ReportHeader";
import { exportRowsToXlsx } from "@/lib/exportXlsx";
import { exportRowsToCsv } from "@/lib/exportCsv";
import { formatCurrency } from "@/lib/formatCurrency";
import { REPORT_TABLE_STYLES } from "@/components/ReportTable";
import { Button } from "@/components/ui/button";
import { AccountDrilldownDrawer } from "@/components/reports/AccountDrilldownDrawer";
// TODO: Port SeriesTable when needed for multi-month view
function SeriesTable({ data, reportType, from, to }: any) {
  return <div>SeriesTable placeholder (multi-month view coming soon)</div>;
}

type TbRow = {
  accountId?: string;
  accountName?: string;
  accountType?: string;
  beginning?: number | null;
  debit?: number | null;
  credit?: number | null;
  ending?: number | null;
};

function toIsoDate(s: string) {
  const trimmed = (s || "").trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return trimmed;
  const mm = String(m[1]).padStart(2, "0");
  const dd = String(m[2]).padStart(2, "0");
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

function toNumber(v: any): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return formatCurrency(n);
}

type TrialBalanceViewProps = {
  compact?: boolean;
};

// Simple in-memory cache to avoid re-fetching the same org/period during a session
const tbCache = new Map<string, any>();
const tbPromiseCache = new Map<string, Promise<any>>();

export function TrialBalanceView({ compact = false }: TrialBalanceViewProps) {
  const { state } = useOrgPeriod();
  const orgId = state.orgId;
  const orgName = state.orgName;
  const from = state.from;
  const to = state.to;

  const [status, setStatus] = useState<string>("—");
  const [query, setQuery] = useState("");
  const [raw, setRaw] = useState<any>(null);
  const [drilldown, setDrilldown] = useState<{
    accountId: string;
    accountName: string;
    balance?: number | null;
    balanceLabel?: string;
  } | null>(null);

  // Canonical rows from API: tb?.Rows?.Row ?? []
  const rawRows = useMemo(() => {
    if (!raw?.tb) return [];
    return raw.tb.Rows?.Row ?? [];
  }, [raw]);

  // Beginning balances returned from API (parsed TB as-of prior day)
  const beginningMap = useMemo(() => {
    const map = new Map<string, number>();
    const rows = raw?.beginning?.rows ?? [];
    for (const r of rows) {
      const keyId = (r?.accountId || "").trim();
      const keyName = (r?.accountName || "").trim();
      const val = typeof r?.ending_tb === "number" ? r.ending_tb : 0;
      if (keyId) {
        map.set(keyId, val);
      }
      if (keyName && !map.has(keyName)) {
        map.set(keyName, val);
      }
    }
    return map;
  }, [raw?.beginning?.rows]);

  // Build column index map from QBO Columns.Column using titles
  const columnMap = useMemo(() => {
    const cols = raw?.tb?.Columns?.Column ?? [];
    const map: Record<string, number> = {};
    
    for (let i = 0; i < cols.length; i++) {
      const title = String(cols[i]?.ColTitle ?? '').trim().toUpperCase();
      // Map common column title variations
      if (title.includes('BEGINNING') || title === 'BEGINNING BALANCE' || title === 'BEGINNING') {
        map['beginning'] = i;
      } else if (title.includes('DEBIT')) {
        map['debit'] = i;
      } else if (title.includes('CREDIT')) {
        map['credit'] = i;
      } else if (title.includes('ENDING') || title === 'ENDING BALANCE' || title === 'ENDING') {
        map['ending'] = i;
      }
    }
    
    // Log column mapping for debugging
    if (cols.length > 0) {
      console.log("[QBO:TB] column map built from titles", {
        columns: cols.map((c: any, i: number) => ({ index: i, title: c?.ColTitle })),
        map
      });
    }
    
    return map;
  }, [raw?.tb?.Columns?.Column]);

  // Helper function to get column index by name (with fallback)
  const getColIndex = (name: 'beginning' | 'debit' | 'credit' | 'ending', fallback: number): number => {
    return columnMap[name] ?? fallback;
  };

  // Compute accounts directly from rawRows using column title mapping (not hard-coded indexes)
  const accounts = useMemo(() => {
    if (rawRows.length === 0) return [];
    
    // Column 0 is always Account ID/Name
    const accountNameIdx = 0;
    const debitIdx = getColIndex('debit', 1); // Fallback to 1 if not found
    const creditIdx = getColIndex('credit', 2); // Fallback to 2 if not found
    const beginningIdx = getColIndex('beginning', 3); // Fallback to 3 if not found
    const endingIdx = getColIndex('ending', 4); // Fallback to 4 if not found
    
    const mappedRows = rawRows
      .filter((r: any) => Array.isArray(r?.ColData) && r.ColData.length >= 1)
      .map((r: any) => ({
        accountId: r.ColData[accountNameIdx]?.id ?? "",
        accountName: String(r.ColData[accountNameIdx]?.value ?? "").trim(),
        // Normalize numeric values once so we can derive ending = beginning + debit - credit
        ...(() => {
          const idKey = (r.ColData[accountNameIdx]?.id || "").trim();
          const nameKey = String(r.ColData[accountNameIdx]?.value ?? "").trim();
          const beginningVal =
            (idKey && beginningMap.has(idKey))
              ? beginningMap.get(idKey)
              : (nameKey && beginningMap.has(nameKey))
                ? beginningMap.get(nameKey)
                : toNumber(r.ColData[beginningIdx]?.value ?? "");
          const debitVal = toNumber(r.ColData[debitIdx]?.value ?? "");
          const creditVal = toNumber(r.ColData[creditIdx]?.value ?? "");
          const endingVal = (beginningVal ?? 0) + (debitVal ?? 0) - (creditVal ?? 0);
          return {
            beginning: beginningVal,
            debit: debitVal,
            credit: creditVal,
            ending: endingVal,
          };
        })(),
      }));
    
    // Log first row for debugging (before filtering out TOTALS)
    if (mappedRows.length > 0) {
      console.log("[TB:UI:ROW0]", {
        beginning: mappedRows[0].beginning,
        debit: mappedRows[0].debit,
        credit: mappedRows[0].credit,
        ending: mappedRows[0].ending,
        columnMap: columnMap,
        indices: { beginningIdx, debitIdx, creditIdx, endingIdx }
      });
    }
    
    const accountsList = mappedRows.filter((a: any) => a.accountName && a.accountName.toUpperCase() !== "TOTAL");
    
    return accountsList;
  }, [rawRows, columnMap, beginningMap]);

  // Filtered accounts based on search query
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => {
      const hay = `${a.accountId ?? ""} ${a.accountName ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [accounts, query]);

  // Compute totals from filtered accounts
  const totals = useMemo(() => {
    const totalBeginning = filtered.reduce((sum, a) => sum + (toNumber(a.beginning) ?? 0), 0);
    const totalDebit = filtered.reduce((sum, a) => sum + (toNumber(a.debit) ?? 0), 0);
    const totalCredit = filtered.reduce((sum, a) => sum + (toNumber(a.credit) ?? 0), 0);
    const totalEnding = filtered.reduce((sum, a) => sum + (toNumber(a.ending) ?? 0), 0);
    const balance = totalDebit - totalCredit;
    return { totalBeginning, totalDebit, totalCredit, totalEnding, balance };
  }, [filtered]);

  // Check if range spans multiple months
  const spansMultipleMonths = useMemo(() => {
    if (!from || !to) return false;
    const fromDate = new Date(from + "T00:00:00Z");
    const toDate = new Date(to + "T00:00:00Z");
    const fromMonth = fromDate.getUTCFullYear() * 12 + fromDate.getUTCMonth();
    const toMonth = toDate.getUTCFullYear() * 12 + toDate.getUTCMonth();
    return toMonth > fromMonth;
  }, [from, to]);

  async function loadTbAuto() {
    if (!orgId || !from || !to) return;

    try {
      setStatus("Loading TB...");
      setRaw(null);

      const fromIso = toIsoDate(from);
      const toIso = toIsoDate(to);

      const cacheKey = `${orgId}|${fromIso}|${toIso}`;
      if (tbCache.has(cacheKey)) {
        setRaw(tbCache.get(cacheKey));
        setStatus("TB loaded (cached) ✅");
        return;
      }

      const inflight = tbPromiseCache.get(cacheKey) || loadTrialBalance(orgId, fromIso, toIso);
      tbPromiseCache.set(cacheKey, inflight);

      const json = await inflight;
      tbCache.set(cacheKey, json);
      tbPromiseCache.delete(cacheKey);

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

  function priorDay(dateISO: string): string {
    const d = new Date(dateISO + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().split("T")[0];
  }

  // Auto-load on mount and whenever org/period changes
  useEffect(() => {
    void loadTbAuto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, from, to, spansMultipleMonths]);

  // Export functions
  function handleExportTbExcel() {
    const rows = filtered.map((a) => ({
      "Account ID": a.accountId || "",
      "Account Name": a.accountName || "",
      Beginning: toNumber(a.beginning) ?? 0,
      Debit: toNumber(a.debit) ?? 0,
      Credit: toNumber(a.credit) ?? 0,
      Ending: toNumber(a.ending) ?? 0,
    }));
    exportRowsToXlsx(`TrialBalance_${from}_${to}`, "Trial Balance", rows);
  }

  function handleExportTbCsv() {
    const rows = filtered.map((a) => ({
      "Account ID": a.accountId || "",
      "Account Name": a.accountName || "",
      Beginning: toNumber(a.beginning) ?? 0,
      Debit: toNumber(a.debit) ?? 0,
      Credit: toNumber(a.credit) ?? 0,
      Ending: toNumber(a.ending) ?? 0,
    }));
    exportRowsToCsv(`TrialBalance_${from}_${to}`, rows, ["Account ID", "Account Name", "Beginning", "Debit", "Credit", "Ending"]);
  }

  // Export GL Details
  async function handleExportGlDetails() {
    if (!orgId || !from || !to) {
      alert("Please select an organization and period first.");
      return;
    }

    try {
      setStatus("Loading GL Details for export...");
      const glDetails = await loadGlDetails(orgId, from, to);
      if (glDetails?.ok && glDetails.transactions && glDetails.transactions.length > 0) {
        exportRowsToXlsx(`GL_Details_${orgId}_${from}_${to}.xlsx`, "GL Details", glDetails.transactions);
        setStatus("GL Details exported ✅");
      } else {
        alert("GL details export not available yet or no data returned.");
        setStatus("GL Details export failed or no data.");
      }
    } catch (error: any) {
      alert(`Error fetching GL details: ${error?.message || String(error)}`);
      setStatus(`Error exporting GL Details: ${error?.message || String(error)}`);
    }
  }

  const inputCls =
    "mt-2 h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-4 focus:ring-blue-200";

  // Format period label: "From: 2025-11-01 To: 2025-11-30" for Trial Balance
  const periodLabel = from && to ? `From: ${from} To: ${to}` : "—";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <ReportHeader
        title="Trial Balance"
        orgName={orgName}
        periodLabel={periodLabel}
        controls={
          <>
            {!compact && (
              <div className="min-w-[280px]">
                <label className="block text-xs font-extrabold uppercase tracking-[.14em] text-slate-500">
                  Search accounts
                </label>
                <input
                  className={inputCls}
                  placeholder="Type account id or name…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="mt-2 text-xs text-slate-600">
                  Showing <span className="font-semibold text-slate-900">{filtered.length}</span> of{" "}
                  <span className="font-semibold text-slate-900">{accounts.length}</span> account(s)
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={handleExportTbExcel}
                disabled={!raw}
                title={!raw ? "Load the TB first" : "Export to Excel"}
              >
                Export Excel
              </Button>
              <Button
                variant="ghost"
                onClick={handleExportTbCsv}
                disabled={!raw}
                title={!raw ? "Load the TB first" : "Export to CSV"}
              >
                Export CSV
              </Button>
              <Button
                variant="ghost"
                onClick={handleExportGlDetails}
                disabled={!orgId || !from || !to}
                title="Export GL Details to Excel"
              >
                Export GL Details
              </Button>
            </div>
          </>
        }
        statusText={status || "—"}
      />

      {raw && (
        <div className="rounded-3xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur p-5">
          {accounts.length === 0 ? (
            <div className="text-sm text-slate-600">No balances returned for this period.</div>
          ) : (
            <div className={REPORT_TABLE_STYLES.container}>
              <table className={REPORT_TABLE_STYLES.table}>
                <thead className={REPORT_TABLE_STYLES.thead}>
                  <tr>
                    <th className={`${REPORT_TABLE_STYLES.th} min-w-[140px]`}>Account ID</th>
                    <th className={`${REPORT_TABLE_STYLES.th} min-w-[360px]`}>Account Name</th>
                    <th className={`${REPORT_TABLE_STYLES.thNumeric} min-w-[140px]`}>Beginning</th>
                    <th className={`${REPORT_TABLE_STYLES.thNumeric} min-w-[140px]`}>Debit</th>
                    <th className={`${REPORT_TABLE_STYLES.thNumeric} min-w-[140px]`}>Credit</th>
                    <th className={`${REPORT_TABLE_STYLES.thNumeric} min-w-[140px]`}>Ending</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a, i) => (
                    <tr key={a.accountId || `${a.accountName}-${i}`} className={REPORT_TABLE_STYLES.tr}>
                      <td className={`${REPORT_TABLE_STYLES.td} tabular-nums`}>{a.accountId || "—"}</td>
                      <td className={REPORT_TABLE_STYLES.tdAccount}>{a.accountName || "—"}</td>
                      <td
                        className={`${REPORT_TABLE_STYLES.tdNumeric} ${a.accountId ? 'cursor-pointer hover:bg-blue-50' : ''}`}
                        onClick={
                          a.accountId
                            ? () => {
                                setDrilldown({
                                  accountId: a.accountId!,
                                  accountName: a.accountName || '',
                                  balance: toNumber(a.beginning),
                                  balanceLabel: 'Beginning Balance',
                                });
                              }
                            : undefined
                        }
                        title={a.accountId ? `Click to view GL detail for ${a.accountName}` : undefined}
                      >
                        {fmt(toNumber(a.beginning))}
                      </td>
                      <td
                        className={`${REPORT_TABLE_STYLES.tdNumeric} ${a.accountId ? 'cursor-pointer hover:bg-blue-50' : ''}`}
                        onClick={
                          a.accountId
                            ? () => {
                                setDrilldown({
                                  accountId: a.accountId!,
                                  accountName: a.accountName || '',
                                  balance: toNumber(a.debit),
                                  balanceLabel: 'Debit',
                                });
                              }
                            : undefined
                        }
                        title={a.accountId ? `Click to view GL detail for ${a.accountName}` : undefined}
                      >
                        {fmt(toNumber(a.debit))}
                      </td>
                      <td
                        className={`${REPORT_TABLE_STYLES.tdNumeric} ${a.accountId ? 'cursor-pointer hover:bg-blue-50' : ''}`}
                        onClick={
                          a.accountId
                            ? () => {
                                setDrilldown({
                                  accountId: a.accountId!,
                                  accountName: a.accountName || '',
                                  balance: toNumber(a.credit),
                                  balanceLabel: 'Credit',
                                });
                              }
                            : undefined
                        }
                        title={a.accountId ? `Click to view GL detail for ${a.accountName}` : undefined}
                      >
                        {fmt(toNumber(a.credit))}
                      </td>
                      <td
                        className={`${REPORT_TABLE_STYLES.tdNumeric} ${a.accountId ? 'cursor-pointer hover:bg-blue-50' : ''}`}
                        onClick={
                          a.accountId
                            ? () => {
                                setDrilldown({
                                  accountId: a.accountId!,
                                  accountName: a.accountName || '',
                                  balance: toNumber(a.ending),
                                  balanceLabel: 'Ending Balance',
                                });
                              }
                            : undefined
                        }
                        title={a.accountId ? `Click to view GL detail for ${a.accountName}` : undefined}
                      >
                        {fmt(toNumber(a.ending))}
                      </td>
                    </tr>
                  ))}
                  {/* Total row */}
                  <tr className={`${REPORT_TABLE_STYLES.trTotal} border-t-2`}>
                    <td className={REPORT_TABLE_STYLES.td} colSpan={2}>
                      <span className="font-bold">TOTAL</span>
                    </td>
                    <td className={REPORT_TABLE_STYLES.tdTotal}>{fmt(totals.totalBeginning)}</td>
                    <td className={REPORT_TABLE_STYLES.tdTotal}>{fmt(totals.totalDebit)}</td>
                    <td className={REPORT_TABLE_STYLES.tdTotal}>{fmt(totals.totalCredit)}</td>
                    <td className={REPORT_TABLE_STYLES.tdTotal}>{fmt(totals.totalEnding)}</td>
                  </tr>
                  {/* Balance check row */}
                  <tr className={Math.abs(totals.balance) < 0.01 ? "bg-green-50" : "bg-red-50"}>
                    <td className={REPORT_TABLE_STYLES.td} colSpan={2}>
                      <span className="text-xs font-semibold">Balance Check (Debits - Credits):</span>
                    </td>
                    <td className={REPORT_TABLE_STYLES.td} colSpan={4}>
                      <span className={`text-xs font-bold ${Math.abs(totals.balance) < 0.01 ? "text-green-700" : "text-red-700"}`}>
                        {fmt(totals.balance)} {Math.abs(totals.balance) < 0.01 ? "✅ Balanced" : "⚠️ Not Balanced"}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Drill-down Drawer */}
      {drilldown && (
        <AccountDrilldownDrawer
          open={!!drilldown}
          onClose={() => setDrilldown(null)}
          accountId={drilldown.accountId}
          accountName={drilldown.accountName}
          reportType="tb"
          from={from}
          to={to}
          balance={drilldown.balance}
          balanceLabel={drilldown.balanceLabel}
        />
      )}
    </div>
  );
}

