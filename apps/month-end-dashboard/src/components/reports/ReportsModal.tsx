"use client";

import { useState } from "react";
// import { ui } from "@/components/ui";
// Temporary placeholder
const reportUi = { btn: "btn", btnGhost: "btn-ghost", btnPrimary: "btn-primary", linkBtn: "link-btn" };
import { useOrgPeriod } from "@/components/OrgPeriodProvider";
import { TrialBalanceView } from "./TrialBalanceView";
import { BalanceSheetView } from "./BalanceSheetView";
import { PnlView } from "./PnlView";
import { CashFlowView } from "./CashFlowView";

type ReportsModalProps = {
  open: boolean;
  onClose: () => void;
};

type ReportTab = "tb" | "bs" | "pnl" | "cf";

export function ReportsModal({ open, onClose }: ReportsModalProps) {
  const { state } = useOrgPeriod();
  const orgId = state.orgId;
  const orgName = state.orgName;
  const from = state.from;
  const to = state.to;

  const [reportTab, setReportTab] = useState<ReportTab>("tb");

  if (!open) return null;

  const orgLine = `orgId: ${orgId || "—"}${orgName ? ` • ${orgName}` : ""} • Period: ${from || "—"} → ${to || "—"}`;

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center overflow-auto p-4">
      <div className="max-w-6xl w-[calc(100%-2rem)] mx-auto my-10 rounded-3xl border border-slate-200 bg-white shadow-xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Reports</h2>
          <button className={`${reportUi.btn} ${reportUi.btnGhost}`} onClick={onClose}>
            Close
          </button>
        </div>

        {/* Context Row */}
        <div className="px-5 py-2 text-xs text-slate-600 border-b border-slate-100">{orgLine}</div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 p-5 border-b border-slate-200">
          <button
            className={`${reportUi.btn} ${reportTab === "tb" ? reportUi.btnPrimary : reportUi.btnGhost}`}
            onClick={() => setReportTab("tb")}
          >
            Trial Balance
          </button>
          <button
            className={`${reportUi.btn} ${reportTab === "bs" ? reportUi.btnPrimary : reportUi.btnGhost}`}
            onClick={() => setReportTab("bs")}
          >
            Balance Sheet
          </button>
          <button
            className={`${reportUi.btn} ${reportTab === "pnl" ? reportUi.btnPrimary : reportUi.btnGhost}`}
            onClick={() => setReportTab("pnl")}
          >
            P&L
          </button>
          <button
            className={`${reportUi.btn} ${reportTab === "cf" ? reportUi.btnPrimary : reportUi.btnGhost}`}
            onClick={() => setReportTab("cf")}
          >
            Cash Flow
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5">
          {reportTab === "tb" && <TrialBalanceView compact />}
          {reportTab === "bs" && <BalanceSheetView compact />}
          {reportTab === "pnl" && <PnlView compact />}
          {reportTab === "cf" && <CashFlowView compact />}
        </div>
      </div>
    </div>
  );
}

