// Shared header component for all report pages (TB, BS, P&L, CF)

import { type ReactNode } from "react";

type ReportHeaderProps = {
  title: string; // "Trial Balance" / "Balance Sheet" / "Profit & Loss" / "Cash Flow"
  orgName?: string;
  periodLabel: string; // "As of: 2025-11-30" or "From: 2025-11-01 To: 2025-11-30"
  controls?: ReactNode; // Buttons, toggles, search inputs
  statusText: string; // "Balance Sheet loaded ✅ (46 account(s))"
};

export function ReportHeader({ title, orgName, periodLabel, controls, statusText }: ReportHeaderProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/80 shadow-md backdrop-blur p-3.5">
      {/* Row A: Title + Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xl font-semibold tracking-tight text-slate-900">{title}</div>
        {controls && <div className="flex flex-wrap items-center gap-3">{controls}</div>}
      </div>

      {/* Row B: Org/Period line (small) */}
      <div className="mt-2 text-xs text-slate-600">
        {orgName && <span className="font-medium">{orgName}</span>}
        {orgName && periodLabel && <span className="mx-2">•</span>}
        {periodLabel}
      </div>

      {/* Row C: Status */}
      <div className="mt-2 text-xs text-slate-600">{statusText}</div>
    </div>
  );
}

