"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/formatCurrency";
import { REPORT_TABLE_STYLES } from "@/components/ReportTable";
import { useOrgPeriod } from "@/components/OrgPeriodProvider";
import { Button } from "@/components/ui/button";

// Module-level log to prove component loads
console.log("[TB DRILLDOWN] module loaded", new Date().toISOString());

type AccountDrilldownDrawerProps = {
  open: boolean;
  onClose: () => void;
  accountId: string;
  accountName: string;
  reportType: "tb" | "bs" | "pnl" | "cf";
  mode?: "ACTIVITY" | "ASOF";
  from?: string;
  to?: string;
  asOf?: string;
  balance?: number | null; // Ending balance or activity amount
  balanceLabel?: string; // e.g., "Ending Balance" or "Total Activity"
};

type DrilldownLine = {
  txn_date: string;
  txn_type: string;
  doc_no?: string;
  memo?: string;
  name?: string;
  amount: number;
  source: "manual" | "system" | "unknown";
};

/**
 * Helper: Get first day of month from a period string (YYYY-MM-DD)
 */
function firstDayOfMonth(period: string): string {
  const match = period.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (match) {
    const [, year, month] = match;
    return `${year}-${month}-01`;
  }
  // Fallback: try to parse as date
  const date = new Date(period + 'T00:00:00Z');
  if (!isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  }
  return period; // Return as-is if can't parse
}

export function AccountDrilldownDrawer({
  open,
  onClose,
  accountId,
  accountName,
  reportType,
  mode,
  from,
  to,
  asOf,
  balance,
  balanceLabel,
}: AccountDrilldownDrawerProps) {
  const { state } = useOrgPeriod();
  const orgId = state.orgId;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<DrilldownLine[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [debitTotal, setDebitTotal] = useState<number>(0);
  const [creditTotal, setCreditTotal] = useState<number>(0);
  const [netChange, setNetChange] = useState<number>(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showOnlyNonZero, setShowOnlyNonZero] = useState(false);
  
  // Notes/Explanation state
  const [notesTab, setNotesTab] = useState<'details' | 'add-note'>('details');
  const [explanation, setExplanation] = useState<any | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState<string | null>(null);
  const [savingExplanation, setSavingExplanation] = useState(false);
  const [explanationText, setExplanationText] = useState("");
  const [commentText, setCommentText] = useState("");

  // Derive explicit from/to dates
  const queryFrom = from || (to ? firstDayOfMonth(to) : undefined);
  const queryTo = to || asOf;

  // Handle ESC key to close drawer
  useEffect(() => {
    if (!open) return;
    
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !accountId || !queryFrom || !queryTo) {
      setLines([]);
      setTotal(0);
      setDebitTotal(0);
      setCreditTotal(0);
      setNetChange(0);
      setError(null);
      return;
    }

    async function loadDrilldown() {
      setLoading(true);
      setError(null);

      try {
        if (!orgId) {
          throw new Error('Organization ID not available');
        }
        
        console.log("[TB DRILLDOWN] txns request", { orgId, accountId, from: queryFrom, to: queryTo });
        
        // Use GET endpoint with query params (calls GeneralLedger report route)
        const url = `/api/qbo/accounts/transactions?orgId=${encodeURIComponent(orgId)}&accountId=${encodeURIComponent(accountId)}&from=${encodeURIComponent(queryFrom)}&to=${encodeURIComponent(queryTo)}`;
        
        // Log URL right before fetch (cannot be skipped)
        console.log("[TB DRILLDOWN] url", url);
        
        const resp = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: "include",
          cache: "no-store",
        });

        if (resp.status === 401) {
          const errorData = await resp.json().catch(() => ({ error: 'Unauthorized' }));
          throw new Error('Unauthorized – please reconnect your QBO connection');
        }

        if (!resp.ok) {
          const errorData = await resp.json().catch(() => ({ error: `Request failed (${resp.status})` }));
          throw new Error(errorData.error || `Request failed (${resp.status})`);
        }

        const data = await resp.json();
        if (data.ok && Array.isArray(data.transactions)) {
          // Map transactions to DrilldownLine format
          // New format: { date, txnType, num, name, memo, split, amount, balance }
          const mappedLines: DrilldownLine[] = data.transactions
            .filter((txn: any) => {
              // Hide rows with invalid date
              if (!txn.date || !/^\d{4}-\d{2}-\d{2}$/.test(txn.date)) {
                return false;
              }
              return true;
            })
            .map((txn: any) => ({
              txn_date: txn.date,
              txn_type: txn.txnType || '—',
              doc_no: txn.num || undefined,
              memo: txn.memo || undefined,
              name: txn.name || undefined,
              amount: txn.amount,
              source: 'unknown', // QBO transactions endpoint doesn't classify source
            }));
          
          setLines(mappedLines);
          // Use API-provided totals
          setDebitTotal(typeof data.debitTotal === 'number' ? data.debitTotal : 0);
          setCreditTotal(typeof data.creditTotal === 'number' ? data.creditTotal : 0);
          setNetChange(typeof data.netChange === 'number' ? data.netChange : 0);
          // For backward compatibility, use netChange as total
          const apiTotal = typeof data.netChange === 'number' ? data.netChange : (typeof data.drilldownTotal === 'number' ? data.drilldownTotal : 0);
          setTotal(apiTotal);
          
          // Store diagnostic info for display
          if (data.count === 0) {
            setError(data.reason || `No transactions found for account ${accountId} in period ${queryFrom} to ${queryTo}`);
          }
        } else {
          throw new Error("Invalid response format");
        }
      } catch (e: any) {
        setError(e?.message || String(e));
        setLines([]);
        setTotal(0);
        setDebitTotal(0);
        setCreditTotal(0);
        setNetChange(0);
      } finally {
        setLoading(false);
      }
    }

    void loadDrilldown();
  }, [open, accountId, queryFrom, queryTo, orgId]);

  // Load explanation when drawer opens or parameters change
  useEffect(() => {
    if (!open || !orgId || !queryTo || !accountId) {
      setExplanation(null);
      setExplanationError(null);
      return;
    }

    async function loadExplanation() {
      setExplanationLoading(true);
      setExplanationError(null);

      try {
        const params = new URLSearchParams({
          orgId,
          period: queryTo,
          accountId,
        });

        const resp = await fetch(`/api/explanations?${params.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });

        if (resp.status === 404) {
          // No explanation exists yet - that's fine
          setExplanation(null);
          setExplanationText("");
          setExplanationError(null);
          return;
        }

        if (!resp.ok) {
          const errorData = await resp.json().catch(() => ({ error: `Request failed (${resp.status})` }));
          throw new Error(errorData.error || `Request failed (${resp.status})`);
        }

        const data = await resp.json();
        if (data.ok && data.explanation) {
          setExplanation({
            id: data.explanation.id,
            org_id: data.explanation.org_id || data.explanation.orgId,
            period: data.explanation.period || queryTo,
            account_id: data.explanation.account_id || data.explanation.accountId,
            rule_id: data.explanation.rule_id || data.explanation.ruleId,
            status: data.explanation.status,
            text: data.explanation.text || data.explanation.summary || "",
            created_at: data.explanation.created_at || data.explanation.createdAt,
            updated_at: data.explanation.updated_at || data.explanation.updatedAt,
            comments: (data.comments || []).map((c: any) => ({
              id: c.id,
              explanation_id: c.explanation_id || c.explanationId,
              author: c.created_by_user_id || c.author || 'Unknown',
              body: c.body || c.text,
              created_at: c.created_at || c.createdAt,
            })),
          });
          setExplanationText(data.explanation.text || data.explanation.summary || "");
        } else {
          setExplanation(null);
          setExplanationText("");
        }
      } catch (e: any) {
        setExplanationError(e?.message || String(e));
      } finally {
        setExplanationLoading(false);
      }
    }

    void loadExplanation();
  }, [open, orgId, queryTo, accountId]);

  // Save explanation
  async function handleSaveExplanation() {
    if (!orgId || !queryTo || !accountId) return;

    setSavingExplanation(true);
    setExplanationError(null);

    try {
      const resp = await fetch("/api/explanations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          orgId,
          periodEnd: queryTo, // Use periodEnd to match API
          period: queryTo, // Also include period for compatibility
          accountId,
          ruleId: null,
          text: explanationText.trim(),
          comment: commentText.trim() || undefined,
        }),
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({ error: `Request failed (${resp.status})` }));
        throw new Error(errorData.error || `Request failed (${resp.status})`);
      }

      const data = await resp.json();
      
      // Re-fetch explanation to get updated data
      const reloadParams = new URLSearchParams({
        orgId,
        period: queryTo,
        accountId,
      });
      const reloadResp = await fetch(`/api/explanations?${reloadParams.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });

      if (reloadResp.ok) {
        const reloadData = await reloadResp.json();
        if (reloadData.ok && reloadData.explanation) {
          setExplanation({
            id: reloadData.explanation.id,
            org_id: reloadData.explanation.org_id || reloadData.explanation.orgId,
            period: reloadData.explanation.period || queryTo,
            account_id: reloadData.explanation.account_id || reloadData.explanation.accountId,
            rule_id: reloadData.explanation.rule_id || reloadData.explanation.ruleId,
            status: reloadData.explanation.status,
            text: reloadData.explanation.text || reloadData.explanation.summary || "",
            created_at: reloadData.explanation.created_at || reloadData.explanation.createdAt,
            updated_at: reloadData.explanation.updated_at || reloadData.explanation.updatedAt,
            comments: (reloadData.comments || []).map((c: any) => ({
              id: c.id,
              explanation_id: c.explanation_id || c.explanationId,
              author: c.created_by_user_id || c.author || 'Unknown',
              body: c.body || c.text,
              created_at: c.created_at || c.createdAt,
            })),
          });
          setExplanationText(reloadData.explanation.text || reloadData.explanation.summary || "");
        }
      }

      // Clear comment text and switch to Details tab
      setCommentText("");
      setNotesTab('details');
    } catch (e: any) {
      setExplanationError(e?.message || String(e));
    } finally {
      setSavingExplanation(false);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-5xl bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900">Account Detail</h2>
            <div className="mt-1 text-sm text-slate-600">
              <div className="font-medium">
                {accountName} • Account ID: {accountId} • {reportType.toUpperCase()}
                {queryFrom && queryTo && ` • ${queryFrom} → ${queryTo}`}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-4 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Close drawer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Balance Context */}
        {balance != null && balanceLabel && (
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-3">
            <div className="text-sm text-slate-600">
              <span className="font-medium">{balanceLabel}:</span>{" "}
              <span className="font-semibold text-slate-900">{formatCurrency(balance)}</span>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="space-y-2 text-center">
                <div className="text-sm text-slate-600">Loading transactions...</div>
                <div className="flex gap-1 justify-center">
                  <div className="w-2 h-2 bg-slate-300 rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-slate-300 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-slate-300 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="text-sm font-medium text-red-800">
                {error.includes('Unauthorized') ? 'Unauthorized – reconnect' : 'Error loading transactions'}
              </div>
              <div className="mt-1 text-xs text-red-600">{error}</div>
            </div>
          )}

          {!loading && !error && lines.length === 0 && (
            <div className="text-center py-12">
              <div className="text-sm text-slate-600 mb-2">No transactions found for this account and period.</div>
              <div className="text-xs text-slate-500 mt-2">
                Filters used: Account ID {accountId}, {queryFrom && queryTo ? `${queryFrom} to ${queryTo}` : 'dates not available'}
              </div>
            </div>
          )}

          {!loading && !error && lines.length > 0 && (() => {
            // Filter lines based on search and showOnlyNonZero
            let filteredLines = lines;
            
            if (searchTerm) {
              const term = searchTerm.toLowerCase();
              filteredLines = filteredLines.filter(line => 
                line.txn_date.toLowerCase().includes(term) ||
                (line.doc_no || '').toLowerCase().includes(term) ||
                (line.name || '').toLowerCase().includes(term) ||
                (line.memo || '').toLowerCase().includes(term) ||
                (line.txn_type || '').toLowerCase().includes(term) ||
                (line.source || '').toLowerCase().includes(term)
              );
            }
            
            if (showOnlyNonZero) {
              filteredLines = filteredLines.filter(line => Math.abs(line.amount) > 0.01);
            }
            
            // Sort lines based on sortKey and sortDir
            const sortedLines = [...filteredLines].sort((a, b) => {
              if (!sortKey || !sortDir) return 0;
              
              let aVal: any;
              let bVal: any;
              
              switch (sortKey) {
                case 'date':
                  aVal = a.txn_date;
                  bVal = b.txn_date;
                  // Sort as date strings (YYYY-MM-DD)
                  return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                case 'amount':
                  aVal = a.amount || 0;
                  bVal = b.amount || 0;
                  return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
                case 'doc_no':
                  aVal = (a.doc_no || '').toLowerCase();
                  bVal = (b.doc_no || '').toLowerCase();
                  return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                case 'name':
                  aVal = (a.name || '').toLowerCase();
                  bVal = (b.name || '').toLowerCase();
                  return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                case 'memo':
                  aVal = (a.memo || '').toLowerCase();
                  bVal = (b.memo || '').toLowerCase();
                  return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                case 'txn_type':
                  aVal = (a.txn_type || '').toLowerCase();
                  bVal = (b.txn_type || '').toLowerCase();
                  return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                case 'source':
                  aVal = (a.source || '').toLowerCase();
                  bVal = (b.source || '').toLowerCase();
                  return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                default:
                  return 0;
              }
            });

            const handleSort = (key: string) => {
              if (sortKey === key) {
                // Toggle: asc -> desc -> null
                if (sortDir === 'asc') {
                  setSortDir('desc');
                } else if (sortDir === 'desc') {
                  setSortKey(null);
                  setSortDir(null);
                }
              } else {
                setSortKey(key);
                setSortDir('asc');
              }
            };

            const SortIndicator = ({ columnKey }: { columnKey: string }) => {
              if (sortKey !== columnKey) return null;
              return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
            };

            const exportToCsv = () => {
              const headers = ['Date', 'Doc #', 'Vendor/Customer', 'Memo', 'Type', 'Amount', 'Source'];
              const rows = sortedLines.map(line => [
                line.txn_date,
                line.doc_no || '',
                line.name || '',
                line.memo || '',
                line.txn_type || '',
                String(line.amount),
                line.source || '',
              ]);
              
              const csvContent = [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
              ].join('\n');
              
              const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
              const link = document.createElement('a');
              const url = URL.createObjectURL(blob);
              link.setAttribute('href', url);
              link.setAttribute('download', `account-${accountId}-${queryFrom}-${queryTo}.csv`);
              link.style.visibility = 'hidden';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            };

            return (
              <div className="space-y-3">
                {/* Search and filters */}
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Search transactions..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={showOnlyNonZero}
                      onChange={(e) => setShowOnlyNonZero(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Show only non-zero
                  </label>
                  <button
                    onClick={exportToCsv}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Export CSV
                  </button>
                </div>

                {/* Table */}
                <div className={REPORT_TABLE_STYLES.container}>
                  <div className="overflow-x-auto">
                    <table className={REPORT_TABLE_STYLES.table}>
                      <thead className={`${REPORT_TABLE_STYLES.thead} sticky top-0 bg-white z-10`}>
                        <tr>
                          <th 
                            className={`${REPORT_TABLE_STYLES.th} min-w-[100px] cursor-pointer hover:bg-slate-50 select-none`}
                            onClick={() => handleSort('date')}
                          >
                            Date<SortIndicator columnKey="date" />
                          </th>
                          <th 
                            className={`${REPORT_TABLE_STYLES.th} min-w-[120px] cursor-pointer hover:bg-slate-50 select-none`}
                            onClick={() => handleSort('doc_no')}
                          >
                            Doc #<SortIndicator columnKey="doc_no" />
                          </th>
                          <th 
                            className={`${REPORT_TABLE_STYLES.th} min-w-[200px] cursor-pointer hover:bg-slate-50 select-none`}
                            onClick={() => handleSort('name')}
                          >
                            Vendor/Customer<SortIndicator columnKey="name" />
                          </th>
                          <th 
                            className={`${REPORT_TABLE_STYLES.th} min-w-[200px] cursor-pointer hover:bg-slate-50 select-none`}
                            onClick={() => handleSort('memo')}
                          >
                            Memo<SortIndicator columnKey="memo" />
                          </th>
                          <th 
                            className={`${REPORT_TABLE_STYLES.th} min-w-[120px] cursor-pointer hover:bg-slate-50 select-none`}
                            onClick={() => handleSort('txn_type')}
                          >
                            Type<SortIndicator columnKey="txn_type" />
                          </th>
                          <th 
                            className={`${REPORT_TABLE_STYLES.thNumeric} min-w-[100px] cursor-pointer hover:bg-slate-50 select-none`}
                            onClick={() => handleSort('amount')}
                          >
                            Amount<SortIndicator columnKey="amount" />
                          </th>
                          <th 
                            className={`${REPORT_TABLE_STYLES.th} min-w-[100px] cursor-pointer hover:bg-slate-50 select-none`}
                            onClick={() => handleSort('source')}
                          >
                            Source<SortIndicator columnKey="source" />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedLines.map((line, i) => (
                          <tr key={i} className={REPORT_TABLE_STYLES.tr}>
                            <td className={`${REPORT_TABLE_STYLES.td} tabular-nums text-xs`}>{line.txn_date}</td>
                            <td className={`${REPORT_TABLE_STYLES.td} tabular-nums text-xs`}>{line.doc_no || "—"}</td>
                            <td className={`${REPORT_TABLE_STYLES.td} text-xs`}>{line.name || "—"}</td>
                            <td className={`${REPORT_TABLE_STYLES.td} text-xs`}>{line.memo || "—"}</td>
                            <td className={`${REPORT_TABLE_STYLES.td} text-xs`}>{line.txn_type || "—"}</td>
                            <td className={`${REPORT_TABLE_STYLES.tdNumeric} tabular-nums text-xs`}>
                              {formatCurrency(line.amount)}
                            </td>
                            <td className={`${REPORT_TABLE_STYLES.td} text-xs`}>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                  line.source === "manual"
                                    ? "bg-blue-100 text-blue-800"
                                    : line.source === "system"
                                    ? "bg-slate-100 text-slate-800"
                                    : "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {line.source}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-300">
                          <td colSpan={5} className={`${REPORT_TABLE_STYLES.td} text-right font-semibold`}>
                            Total:
                          </td>
                          <td className={`${REPORT_TABLE_STYLES.tdNumeric} font-semibold text-slate-900`}>
                            {formatCurrency(total)}
                          </td>
                          <td className={REPORT_TABLE_STYLES.td}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Show all totals and compare to balance */}
                <div className="mt-4 p-3 rounded-lg border border-slate-200 bg-slate-50">
                  <div className="text-sm space-y-1">
                    <div>
                      <span className="font-medium text-slate-700">Debit Total:</span>{" "}
                      <span className="font-semibold text-slate-900">{formatCurrency(debitTotal)}</span>
                      {" • "}
                      <span className="font-medium text-slate-700">Credit Total:</span>{" "}
                      <span className="font-semibold text-slate-900">{formatCurrency(creditTotal)}</span>
                      {" • "}
                      <span className="font-medium text-slate-700">Net Change:</span>{" "}
                      <span className="font-semibold text-slate-900">{formatCurrency(netChange)}</span>
                    </div>
                    {balance != null && (
                      <div>
                        <span className="font-medium text-slate-700">Reported {balanceLabel || "Balance"}:</span>{" "}
                        <span className="font-semibold text-slate-900">{formatCurrency(balance)}</span>
                        {(() => {
                          // Compare debitTotal if balanceLabel suggests debit, otherwise compare netChange
                          const compareValue = balanceLabel?.toLowerCase().includes('debit') ? debitTotal : netChange;
                          const diff = Math.abs(compareValue - balance);
                          if (diff > 0.01) {
                            return (
                              <span className="ml-2 text-xs text-amber-600">
                                (Difference: {formatCurrency(compareValue - balance)})
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Notes/Explanation Section with Tabs */}
        <div className="border-t border-slate-200 px-6 py-4">
          <div className="space-y-4">
            {/* Tab Navigation */}
            <div className="border-b border-slate-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setNotesTab('details')}
                  className={`
                    whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium
                    ${
                      notesTab === 'details'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                    }
                  `}
                >
                  Details
                </button>
                <button
                  onClick={() => setNotesTab('add-note')}
                  className={`
                    whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium
                    ${
                      notesTab === 'add-note'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                    }
                  `}
                >
                  Add note
                </button>
              </nav>
            </div>

            {/* Tab Content */}
            {notesTab === 'details' && (
              <div className="space-y-4">
                {explanationLoading && (
                  <div className="text-sm text-slate-600">Loading notes...</div>
                )}

                {explanationError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <div className="text-sm font-medium text-red-800">Error</div>
                    <div className="mt-1 text-xs text-red-600">{explanationError}</div>
                  </div>
                )}

                {!explanationLoading && !explanation && !explanationError && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
                    <div className="text-sm font-medium text-slate-700 mb-2">No notes yet</div>
                    <div className="text-xs text-slate-600 mb-4">Create a note for this account and period.</div>
                    <Button
                      onClick={() => setNotesTab('add-note')}
                      variant="ghost"
                      className="w-full sm:w-auto"
                    >
                      Add note
                    </Button>
                  </div>
                )}

                {!explanationLoading && explanation && (
                  <div className="space-y-4">
                    {/* Explanation text */}
                    {explanation.text && (
                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Explanation</div>
                        <div className="text-sm text-slate-900 whitespace-pre-wrap">{explanation.text}</div>
                      </div>
                    )}

                    {/* Comments list */}
                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Comments</div>
                      {explanation.comments && explanation.comments.length > 0 ? (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {/* Sort comments newest first */}
                          {[...explanation.comments]
                            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                            .map((comment) => (
                              <div key={comment.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-medium text-slate-900">{comment.author}</span>
                                  <span className="text-xs text-slate-500">
                                    {new Date(comment.created_at).toLocaleString()}
                                  </span>
                                </div>
                                <div className="text-sm text-slate-700 whitespace-pre-wrap">{comment.body}</div>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 italic">No comments yet</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {notesTab === 'add-note' && (
              <div className="space-y-4">
                {/* Explanation text textarea */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-2">Explanation</label>
                  <textarea
                    value={explanationText}
                    onChange={(e) => setExplanationText(e.target.value)}
                    placeholder="Enter explanation text..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    rows={6}
                    disabled={savingExplanation}
                  />
                </div>

                {/* Comment textarea */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-2">Add comment (optional)</label>
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    rows={3}
                    disabled={savingExplanation}
                  />
                </div>

                {/* Error */}
                {explanationError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <div className="text-sm font-medium text-red-800">Error</div>
                    <div className="mt-1 text-xs text-red-600">{explanationError}</div>
                  </div>
                )}

                {/* Save button */}
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveExplanation}
                    disabled={savingExplanation || (!explanationText.trim() && !commentText.trim())}
                    className="flex-1"
                  >
                    {savingExplanation ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setNotesTab('details');
                      setExplanationError(null);
                    }}
                    disabled={savingExplanation}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

