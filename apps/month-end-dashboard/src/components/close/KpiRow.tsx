"use client"

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  )
}

export function KpiRow({
  total,
  criticalOpen,
  awaiting,
  progressLabel,
}: {
  total: number
  criticalOpen: number
  awaiting: number
  progressLabel: string
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card label="Total Exceptions" value={total} />
      <Card label="Critical Open" value={criticalOpen} />
      <Card label="Awaiting Explanation" value={awaiting} />
      <Card label="Close Progress" value={progressLabel} />
    </div>
  )
}
