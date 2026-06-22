"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { OrgPeriodProvider, useOrgPeriod } from "@/components/OrgPeriodProvider";
import { BalanceSheetView } from "@/components/reports/BalanceSheetView";
import { perfStart, perfEnd } from "@/lib/perfMarks";

const PnlViewLazy = dynamic(
  () => import("@/components/reports/PnlView").then((m) => m.PnlView),
  { ssr: false, loading: () => <div className="text-sm text-slate-500">Loading P&L…</div> }
);

const CashFlowViewLazy = dynamic(
  () => import("@/components/reports/CashFlowView").then((m) => m.CashFlowView),
  { ssr: false, loading: () => <div className="text-sm text-slate-500">Loading Cash Flow…</div> }
);

const TrialBalanceViewLazy = dynamic(
  () => import("@/components/reports/TrialBalanceView").then((m) => m.TrialBalanceView),
  { ssr: false, loading: () => <div className="text-sm text-slate-500">Loading Trial Balance…</div> }
);

type ReportTab = "tb" | "bs" | "pnl" | "cf";

function ReportsContent({ hasQboConnection }: { hasQboConnection: boolean }) {
  const { state } = useOrgPeriod();
  const [activeTab, setActiveTab] = useState<ReportTab>("bs");

  const switchTab = useCallback((tab: ReportTab) => {
    perfStart(`tab-switch-${tab}`);
    setActiveTab(tab);
    requestAnimationFrame(() => {
      perfEnd(`tab-switch-${tab}`);
    });
  }, []);

  const orgLine = `orgId: ${state.orgId || "—"}${state.orgName ? ` • ${state.orgName}` : ""} • Period: ${state.from || "—"} → ${state.to || "—"}`;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Financial Reports</h1>
          <p className="mt-2 text-sm text-gray-600">{orgLine}</p>
        </div>

        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button onClick={() => switchTab("tb")} className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${activeTab === "tb" ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"}`}>Trial Balance</button>
            <button onClick={() => switchTab("bs")} className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${activeTab === "bs" ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"}`}>Balance Sheet</button>
            <button onClick={() => switchTab("pnl")} className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${activeTab === "pnl" ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"}`}>P&L</button>
            <button onClick={() => switchTab("cf")} className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium ${activeTab === "cf" ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"}`}>Cash Flow</button>
          </nav>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          {!hasQboConnection ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              Connect QuickBooks from Home before opening financial reports. These report tabs load directly from QBO for the active organization.
            </div>
          ) : (
            <>
              {activeTab === "bs" && <BalanceSheetView />}
              {activeTab === "pnl" && <PnlViewLazy />}
              {activeTab === "cf" && <CashFlowViewLazy />}
              {activeTab === "tb" && <TrialBalanceViewLazy />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ReportsClient({ hasQboConnection }: { hasQboConnection: boolean }) {
  return (
    <OrgPeriodProvider>
      <ReportsContent hasQboConnection={hasQboConnection} />
    </OrgPeriodProvider>
  );
}
