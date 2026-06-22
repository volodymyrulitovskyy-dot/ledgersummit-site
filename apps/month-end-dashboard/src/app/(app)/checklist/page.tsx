import { ensureOrgAccess } from '@/lib/auth/ensureOrgAccess'
import { getActiveOrgId, getRangeFromDate, getRangeToDate } from '@/lib/active'
import { prisma } from '@/lib/db/prisma'
import { ChecklistClient } from './ChecklistClient'
import { requireScreen } from '@/lib/auth/guard'

export default async function ChecklistPage() {
  await requireScreen('checklist')
  const orgId = await getActiveOrgId()
  if (!orgId) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-5xl px-4 py-10 space-y-4">
          <h1 className="text-2xl font-semibold text-slate-900">Checklist</h1>
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            No active org selected.
          </div>
        </div>
      </div>
    )
  }
  // Run org access check, cookie reads, and task query in parallel
  const [, rangeFrom, rangeTo, rawTasks] = await Promise.all([
    ensureOrgAccess(orgId),
    getRangeFromDate(),
    getRangeToDate(),
    prisma.closeTask.findMany({
      where: { org_id: orgId },
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { created_at: 'desc' }],
    }),
  ])

  // Convert Date fields to strings for client component
  const tasks = rawTasks.map(task => ({
    ...task,
    due_date: task.due_date ? task.due_date.toISOString().split('T')[0] : null,
    computed_due_date: task.computed_due_date ? task.computed_due_date.toISOString().split('T')[0] : null,
  }))

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-10 space-y-6">
        <ChecklistClient orgId={orgId} tasks={tasks} rangeFrom={rangeFrom} rangeTo={rangeTo} />
      </div>
    </div>
  )
}
