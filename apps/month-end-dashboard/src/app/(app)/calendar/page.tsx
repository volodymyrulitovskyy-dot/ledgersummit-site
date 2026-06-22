import { ensureOrgAccess } from '@/lib/auth/ensureOrgAccess'
import { getActiveOrgId, getRangeFromDate, getRangeToDate } from '@/lib/active'
import { prisma } from '@/lib/db/prisma'
import { CalendarClient } from './CalendarClient'
import { requireScreen } from '@/lib/auth/guard'

export default async function CalendarPage() {
  await requireScreen('calendar')
  const orgId = await getActiveOrgId()
  if (!orgId) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-5xl px-4 py-10 space-y-4">
          <h1 className="text-2xl font-semibold text-slate-900">Calendar</h1>
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            No active org selected.
          </div>
        </div>
      </div>
    )
  }
  await ensureOrgAccess(orgId)

  // Run cookie reads and task query in parallel
  const [rangeFrom, rangeTo, tasksRaw] = await Promise.all([
    getRangeFromDate(),
    getRangeToDate(),
    prisma.closeTask.findMany({
      where: { org_id: orgId },
      orderBy: [{ computed_due_date: 'asc' }, { created_at: 'desc' }],
    }),
  ])
  const toISO = (d: any) => {
    if (!d) return null
    if (d instanceof Date) return d.toISOString()
    const str = String(d)
    return str.includes('T') ? str : `${str}T00:00:00.000Z`
  }
  const tasks = tasksRaw.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    owner_name: t.owner_name,
    status: t.status,
    priority: t.priority,
    due_date: toISO(t.due_date),
    computed_due_date: toISO(t.computed_due_date),
  }))

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-10 space-y-6">
        <CalendarClient
          orgId={orgId}
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
          tasks={tasks}
        />
      </div>
    </div>
  )
}
