export function LoadingCard() {
  return (
    <div className="group relative rounded-3xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/50 p-6 shadow-lg h-[520px] flex flex-col animate-pulse">
      <div className="shrink-0">
        <div className="h-5 w-32 bg-slate-200 rounded mb-2"></div>
        <div className="h-3 w-48 bg-slate-100 rounded"></div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="w-64 h-64 rounded-full bg-slate-100"></div>
      </div>
      <div className="shrink-0 pt-4">
        <div className="flex gap-3">
          <div className="h-3 w-20 bg-slate-100 rounded"></div>
          <div className="h-3 w-20 bg-slate-100 rounded"></div>
          <div className="h-3 w-20 bg-slate-100 rounded"></div>
        </div>
      </div>
    </div>
  )
}

export function LoadingTable() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-10 bg-slate-100 rounded"></div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-16 bg-slate-50 rounded"></div>
      ))}
    </div>
  )
}

export function LoadingStats() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-3xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50/50 p-6 shadow-lg h-[520px]">
          <div className="h-5 w-32 bg-slate-200 rounded mb-2"></div>
          <div className="h-3 w-48 bg-slate-100 rounded mb-6"></div>
          <div className="flex items-center justify-center h-[400px]">
            <div className="w-64 h-64 rounded-full bg-slate-100"></div>
          </div>
        </div>
      ))}
    </div>
  )
}
