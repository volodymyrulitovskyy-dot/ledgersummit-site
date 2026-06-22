export default function AppLoading() {
    return (
        <div className="min-h-screen bg-slate-50">
            <div className="mx-auto max-w-7xl px-4 py-8 space-y-6 animate-pulse">
                {/* Page header skeleton */}
                <div className="bg-gradient-to-br from-blue-50/50 via-white to-purple-50/50 rounded-3xl border border-slate-200/40 p-8 shadow-sm">
                    <div className="h-8 w-56 bg-slate-200 rounded-lg mb-3" />
                    <div className="h-4 w-80 bg-slate-100 rounded" />
                </div>

                {/* Cards skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm"
                        >
                            <div className="h-4 w-24 bg-slate-100 rounded mb-4" />
                            <div className="h-8 w-16 bg-slate-200 rounded mb-2" />
                            <div className="h-3 w-32 bg-slate-100 rounded" />
                        </div>
                    ))}
                </div>

                {/* Table skeleton */}
                <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm space-y-3">
                    <div className="h-5 w-40 bg-slate-200 rounded mb-4" />
                    <div className="h-10 bg-slate-100 rounded" />
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-14 bg-slate-50 rounded" />
                    ))}
                </div>
            </div>
        </div>
    )
}
