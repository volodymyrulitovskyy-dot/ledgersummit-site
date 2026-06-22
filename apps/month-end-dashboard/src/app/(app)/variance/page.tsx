import { getActiveOrgId, getRangeFromDate, getRangeToDate } from '@/lib/active'
import { ensureOrgAccess } from '@/lib/auth/ensureOrgAccess'
import { redirect } from 'next/navigation'
import { VarianceClient } from './VarianceClient'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { requireScreen } from '@/lib/auth/guard'

export default async function VariancePage() {
    await requireScreen('variance')

    const activeOrgId = await getActiveOrgId()
    if (!activeOrgId) redirect('/org')
    await ensureOrgAccess(activeOrgId)

    const rangeFromDate = await getRangeFromDate()
    const rangeToDate = await getRangeToDate()

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30">
            <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
                <Breadcrumbs items={[
                    { label: 'Home', href: '/close' },
                    { label: 'Variance Analysis' }
                ]} />

                <div className="bg-gradient-to-br from-blue-50 via-white to-purple-50 rounded-3xl border border-slate-200/60 p-8 shadow-sm">
                    <h1 className="text-3xl font-bold text-slate-900 mb-2">
                        Variance Analysis
                    </h1>
                    <p className="text-lg text-slate-600">
                        Period-over-period account variance tracking and explanations
                    </p>
                </div>

                <VarianceClient
                    orgId={activeOrgId}
                    currentPeriodEnd={rangeToDate}
                />
            </div>
        </div>
    )
}
