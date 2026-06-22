import { NextRequest, NextResponse } from 'next/server'
import { ensureUser } from '@/lib/auth/ensureUser'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { prisma } from '@/lib/db/prisma'
import { isoToUTCDateOnly } from '@/lib/dates/dateOnly'
import { computeDueDateForTask } from '@/lib/dates/workdays'

export async function POST(req: NextRequest) {
  try {
    const user = await ensureUser()
    const body = await req.json()
    const orgId = body.orgId as string | undefined
    if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 })
    await ensureOrgAccessApi(orgId)

    const title = String(body.title ?? '').trim()
    if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 })

    const rangeFromDate = body.rangeFromDate ?? body.range_from_date ?? new Date().toISOString().slice(0, 10)
    const rangeToDate = body.rangeToDate ?? body.range_to_date ?? new Date().toISOString().slice(0, 10)

    const [year, month] = rangeFromDate.split('-').map(Number)
    const dueType = (body.dueType ?? body.due_type ?? 'fixed') as 'fixed' | 'workday'
    const dueDateISO = body.dueDate ?? body.due_date ?? null
    const dueWorkdayN = body.dueWorkdayN ?? body.due_workday_n ?? null
    const dueWorkdayAnchor = body.dueWorkdayAnchor ?? body.due_workday_anchor ?? null
    const dueOffsetDays = body.dueOffsetDays ?? body.due_offset_days ?? 0

    const computedDueDate = computeDueDateForTask(
      year,
      month,
      dueType,
      dueDateISO ? isoToUTCDateOnly(dueDateISO) : null,
      dueWorkdayN,
      dueWorkdayAnchor,
      dueOffsetDays
    )

    const task = await prisma.closeTask.create({
      data: {
        org_id: orgId,
        period_id: undefined,
        range_from_date: isoToUTCDateOnly(rangeFromDate),
        range_to_date: isoToUTCDateOnly(rangeToDate),
        title,
        description: body.description?.trim() || undefined,
        owner_name: body.ownerName?.trim() || undefined,
        owner_user_id: body.ownerUserId || undefined,
        due_type: dueType,
        due_date: dueType === 'fixed' && dueDateISO ? isoToUTCDateOnly(dueDateISO) : undefined,
        due_workday_n: dueType === 'workday' ? dueWorkdayN : undefined,
        due_workday_anchor: dueType === 'workday' ? dueWorkdayAnchor : undefined,
        due_offset_days: dueOffsetDays,
        computed_due_date: computedDueDate,
        priority: body.priority ?? 'normal',
        status: body.status ?? 'open',
      },
    })

    return NextResponse.json({ success: true, task })
  } catch (error: any) {
    console.error('[TASK_CREATE_ERROR]', error)
    return NextResponse.json({ error: error.message || 'Failed to create task' }, { status: 500 })
  }
}
