import { NextRequest, NextResponse } from 'next/server'
import { ensureUser } from '@/lib/auth/ensureUser'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { prisma } from '@/lib/db/prisma'
import { isoToUTCDateOnly } from '@/lib/dates/dateOnly'
import { computeDueDateForTask } from '@/lib/dates/workdays'

function lastSegment(req: Request) {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean)
  return parts[parts.length - 1] || null
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await ensureUser()
    const taskId = lastSegment(req)
    if (!taskId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const body = await req.json()
    const task = await prisma.closeTask.findUnique({
      where: { id: taskId },
    })
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    await ensureOrgAccessApi(task.org_id)

    const updateData: any = {}
    if (body.title !== undefined) updateData.title = String(body.title ?? '').trim()
    if (body.description !== undefined) updateData.description = body.description?.trim() || null
    if (body.ownerName !== undefined) updateData.owner_name = body.ownerName?.trim() || null
    if (body.ownerUserId !== undefined) updateData.owner_user_id = body.ownerUserId || null
    if (body.priority !== undefined) updateData.priority = body.priority
    if (body.status !== undefined) updateData.status = body.status

    const dueType = body.dueType ?? body.due_type
    if (dueType) updateData.due_type = dueType
    const finalDueType = dueType ?? task.due_type
    const dueDateISO = body.dueDate ?? body.due_date
    const dueWorkdayN = body.dueWorkdayN ?? body.due_workday_n
    const dueWorkdayAnchor = body.dueWorkdayAnchor ?? body.due_workday_anchor
    const dueOffsetDays = body.dueOffsetDays ?? body.due_offset_days

    if (finalDueType === 'fixed') {
      if (dueDateISO !== undefined) {
        updateData.due_date = dueDateISO ? isoToUTCDateOnly(dueDateISO) : null
        updateData.due_workday_n = null
        updateData.due_workday_anchor = null
      }
    } else if (finalDueType === 'workday') {
      if (dueWorkdayN !== undefined) updateData.due_workday_n = dueWorkdayN
      if (dueWorkdayAnchor !== undefined) updateData.due_workday_anchor = dueWorkdayAnchor
      if (dueOffsetDays !== undefined) updateData.due_offset_days = dueOffsetDays
      updateData.due_date = null
    }

    // Recompute computed_due_date if due fields changed
    if (
      dueType !== undefined ||
      dueDateISO !== undefined ||
      dueWorkdayN !== undefined ||
      dueWorkdayAnchor !== undefined ||
      dueOffsetDays !== undefined
    ) {
      // derive year/month from range_from_date
      const fromStr =
        task.range_from_date instanceof Date
          ? task.range_from_date.toISOString().split('T')[0]
          : String(task.range_from_date).split('T')[0]
      const [year, month] = fromStr.split('-').map(Number)
      const finalDueDate = dueDateISO !== undefined ? (dueDateISO ? isoToUTCDateOnly(dueDateISO) : null) : task.due_date
      const finalWorkdayN = dueWorkdayN !== undefined ? dueWorkdayN : task.due_workday_n
      const finalAnchor = dueWorkdayAnchor !== undefined ? dueWorkdayAnchor : task.due_workday_anchor
      const finalOffset = dueOffsetDays !== undefined ? dueOffsetDays : task.due_offset_days

      updateData.computed_due_date = computeDueDateForTask(
        year,
        month,
        finalDueType,
        finalDueDate,
        finalWorkdayN,
        finalAnchor,
        finalOffset
      )
    }

    const updated = await prisma.closeTask.update({
      where: { id: taskId },
      data: updateData,
    })

    return NextResponse.json({ success: true, task: updated })
  } catch (error: any) {
    console.error('[TASK_UPDATE_ERROR]', error)
    return NextResponse.json({ error: error.message || 'Failed to update task' }, { status: 500 })
  }
}
