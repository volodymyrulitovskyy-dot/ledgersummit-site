import { LoadingStats } from '@/components/ui/LoadingStates'

export default function CloseLoading() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30">
            <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
                {/* Header skeleton */}
                <div className="bg-gradient-to-br from-blue-50/50 via-white to-purple-50/50 rounded-3xl border border-slate-200/40 p-8 shadow-sm animate-pulse">
                    <div className="flex items-start justify-between flex-wrap gap-4">
                        <div>
                            <div className="h-8 w-52 bg-slate-200 rounded-lg mb-3" />
                        </div>
                        <div className="h-10 w-64 bg-slate-100 rounded-lg" />
                    </div>
                </div>

                {/* Stats cards skeleton */}
                <LoadingStats />

                {/* Exceptions section skeleton */}
                <div className="space-y-3 animate-pulse">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="h-3 w-16 bg-slate-100 rounded mb-2" />
                                <div className="h-7 w-10 bg-slate-200 rounded mb-1" />
                                <div className="h-3 w-20 bg-slate-100 rounded" />
                            </div>
                        ))}
                    </div>
                    <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm space-y-3">
                        <div className="h-5 w-28 bg-slate-200 rounded" />
                        <div className="h-10 bg-slate-100 rounded" />
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="h-16 bg-slate-50 rounded" />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
