"use client";

import * as React from "react";

export function CollapsibleSection({
  title,
  defaultOpen = false,
  right,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{title}</span>
          <span className="text-xs text-slate-500">{open ? "Hide" : "Show"}</span>
        </div>
        <div className="flex items-center gap-3">
          {right}
          <span className="text-slate-500 text-sm">{open ? "▾" : "▸"}</span>
        </div>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
