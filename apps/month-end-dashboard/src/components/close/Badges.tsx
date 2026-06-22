"use client";

function cx(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

export function SeverityBadge({ severity }: { severity: string }) {
  const key = (severity || "").toLowerCase();
  const tone =
    key === "critical"
      ? "bg-red-50 text-red-700 border-red-200"
      : key === "high"
        ? "bg-orange-50 text-orange-700 border-orange-200"
        : "bg-amber-50 text-amber-800 border-amber-200";
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        tone
      )}
    >
      {severity}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const key = (status || "").toLowerCase();
  const tone =
    key === "resolved"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : key.includes("await")
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-red-50 text-red-700 border-red-200";
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        tone
      )}
    >
      {status}
    </span>
  );
}
