import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import { getActiveOrgId, getRangeFromDate, getRangeToDate } from '@/lib/active'
import { ensureOrgAccess } from '@/lib/auth/ensureOrgAccess'
import { requireScreen } from '@/lib/auth/guard'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { ScheduleForm } from '../ScheduleForm'

export default async function NewSchedulePage() {
  await requireScreen('schedules')

  const activeOrgId = await getActiveOrgId()
  if (!activeOrgId) redirect('/org')
  await ensureOrgAccess(activeOrgId)

  const [periodStart, periodEnd] = await Promise.all([getRangeFromDate(), getRangeToDate()])
  const org = await prisma.org.findUnique({ where: { id: activeOrgId }, select: { name: true } })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30">
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <Breadcrumbs items={[{ label: 'Schedules', href: '/schedules' }, { label: 'New' }]} />
        <ScheduleForm
          orgId={activeOrgId}
          orgName={org?.name || null}
          periodStart={periodStart}
          periodEnd={periodEnd}
          mode="create"
        />
      </div>
    </div>
  )
}
