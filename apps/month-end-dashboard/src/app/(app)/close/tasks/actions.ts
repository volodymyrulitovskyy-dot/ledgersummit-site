'use server'

import { ensureUser } from '@/lib/auth/ensureUser'
import { ensureOrgAccess } from '@/lib/auth/ensureOrgAccess'
import { prisma } from '@/lib/db/prisma'
import { revalidatePath } from 'next/cache'
import { computeDueDateForTask } from '@/lib/dates/workdays'
import { isoToUTCDateOnly } from '@/lib/dates/dateOnly'

interface CreateTaskInput {
  orgId: string
  rangeFromDate: string
  rangeToDate: string
  title: string
  description?: string
  ownerName?: string
  ownerUserId?: string
  dueType: 'fixed' | 'workday'
  dueDate?: string | null
  dueWorkdayN?: number | null
  dueWorkdayAnchor?: 'month_start' | 'month_end' | null
  dueOffsetDays?: number
  priority: 'low' | 'normal' | 'high'
}

export async function createTask(input: CreateTaskInput) {
  const user = await ensureUser()
  await ensureOrgAccess(input.orgId)

  // Parse date range to get year/month for due date computation
  // Use the "from" date to determine the period month for workday calculations
  const [year, month] = input.rangeFromDate.split('-').map(Number)

  // Compute due date
  const computedDueDate = computeDueDateForTask(
    year,
    month,
    input.dueType,
    input.dueDate ? isoToUTCDateOnly(input.dueDate) : null,
    input.dueWorkdayN || null,
    input.dueWorkdayAnchor || null,
    input.dueOffsetDays || 0
  )

  const task = await prisma.closeTask.create({
    data: {
      org_id: input.orgId,
      period_id: null, // No longer using period_id
      range_from_date: isoToUTCDateOnly(input.rangeFromDate),
      range_to_date: isoToUTCDateOnly(input.rangeToDate),
      title: input.title.trim(),
      description: input.description?.trim() || null,
      owner_name: input.ownerName?.trim() || null,
      owner_user_id: input.ownerUserId || null,
      due_type: input.dueType,
      due_date: input.dueType === 'fixed' && input.dueDate ? isoToUTCDateOnly(input.dueDate) : null,
      due_workday_n: input.dueType === 'workday' ? input.dueWorkdayN || null : null,
      due_workday_anchor: input.dueType === 'workday' ? input.dueWorkdayAnchor || null : null,
      due_offset_days: input.dueOffsetDays || 0,
      computed_due_date: computedDueDate,
      priority: input.priority,
      status: 'open',
    },
  })

  revalidatePath('/close')
  return task
}

interface UpdateTaskInput {
  taskId: string
  orgId: string
  title?: string
  description?: string
  ownerName?: string
  ownerUserId?: string
  dueType?: 'fixed' | 'workday'
  dueDate?: string | null
  dueWorkdayN?: number | null
  dueWorkdayAnchor?: 'month_start' | 'month_end' | null
  dueOffsetDays?: number
  priority?: 'low' | 'normal' | 'high'
  status?: 'open' | 'in_progress' | 'blocked' | 'done'
}

export async function updateTask(input: UpdateTaskInput) {
  const user = await ensureUser()
  await ensureOrgAccess(input.orgId)

  // Verify task belongs to org
  const existing = await prisma.closeTask.findFirst({
    where: {
      id: input.taskId,
      org_id: input.orgId,
    },
  })

  if (!existing) {
    throw new Error('Task not found')
  }

  const updateData: any = {}
  if (input.title !== undefined) updateData.title = input.title.trim()
  if (input.description !== undefined) updateData.description = input.description?.trim() || null
  if (input.ownerName !== undefined) updateData.owner_name = input.ownerName?.trim() || null
  if (input.ownerUserId !== undefined) updateData.owner_user_id = input.ownerUserId || null
  if (input.priority !== undefined) updateData.priority = input.priority
  if (input.status !== undefined) updateData.status = input.status

  // Handle due date updates
  if (input.dueType !== undefined) {
    updateData.due_type = input.dueType
  }

  const dueType = input.dueType !== undefined ? input.dueType : existing.due_type

  if (dueType === 'fixed') {
    if (input.dueDate !== undefined) {
      updateData.due_date = input.dueDate ? isoToUTCDateOnly(input.dueDate) : null
      updateData.due_workday_n = null
      updateData.due_workday_anchor = null
    }
  } else if (dueType === 'workday') {
    if (input.dueWorkdayN !== undefined) {
      updateData.due_workday_n = input.dueWorkdayN
    }
    if (input.dueWorkdayAnchor !== undefined) {
      updateData.due_workday_anchor = input.dueWorkdayAnchor
    }
    if (input.dueOffsetDays !== undefined) {
      updateData.due_offset_days = input.dueOffsetDays
    }
    updateData.due_date = null
  }

  // Recompute computed_due_date if due-related fields changed
  if (
    input.dueType !== undefined ||
    input.dueDate !== undefined ||
    input.dueWorkdayN !== undefined ||
    input.dueWorkdayAnchor !== undefined ||
    input.dueOffsetDays !== undefined
  ) {
    // Type guard to ensure due_type is properly typed
    const getDueType = (type: string): 'fixed' | 'workday' => {
      if (type === 'fixed' || type === 'workday') return type
      return 'fixed' // fallback
    }

    // Type guard for anchor
    const getAnchor = (anchor: string | null): 'month_start' | 'month_end' | null => {
      if (anchor === 'month_start' || anchor === 'month_end') return anchor
      return null
    }

    const finalDueType = input.dueType !== undefined ? input.dueType : getDueType(existing.due_type)
    const finalDueDate = input.dueDate !== undefined ? (input.dueDate ? isoToUTCDateOnly(input.dueDate) : null) : existing.due_date
    const finalWorkdayN = input.dueWorkdayN !== undefined ? input.dueWorkdayN : existing.due_workday_n
    const finalAnchor = input.dueWorkdayAnchor !== undefined ? input.dueWorkdayAnchor : getAnchor(existing.due_workday_anchor)
    const finalOffset = input.dueOffsetDays !== undefined ? input.dueOffsetDays : existing.due_offset_days

    // Use range_from_date to get year/month for workday calculation
    // Fallback to period if range dates are null (backward compatibility)
    let year: number
    let month: number

    if (existing.range_from_date) {
      // Parse from Date object or ISO string
      const fromDateStr = existing.range_from_date instanceof Date
        ? existing.range_from_date.toISOString().split('T')[0]
        : String(existing.range_from_date).split('T')[0]
      const [y, m] = fromDateStr.split('-').map(Number)
      year = y
      month = m
    } else if (existing.period_id) {
      // Backward compatibility: try to get period
      const period = await prisma.period.findUnique({
        where: { id: existing.period_id },
      })
      if (period) {
        year = period.year
        month = period.month
      } else {
        // Fallback to current month if period not found
        const now = new Date()
        year = now.getFullYear()
        month = now.getMonth() + 1
      }
    } else {
      // Fallback to current month
      const now = new Date()
      year = now.getFullYear()
      month = now.getMonth() + 1
    }

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

  const task = await prisma.closeTask.update({
    where: { id: input.taskId },
    data: updateData,
  })

  revalidatePath('/close')
  return task
}

export async function deleteTask(taskId: string, orgId: string) {
  const user = await ensureUser()
  await ensureOrgAccess(orgId)

  // Verify task belongs to org
  const existing = await prisma.closeTask.findFirst({
    where: {
      id: taskId,
      org_id: orgId,
    },
  })

  if (!existing) {
    throw new Error('Task not found')
  }

  await prisma.closeTask.delete({
    where: { id: taskId },
  })

  revalidatePath('/close')
}

export async function updateTaskStatus(
  taskId: string,
  orgId: string,
  status: 'open' | 'in_progress' | 'blocked' | 'done'
) {
  return updateTask({ taskId, orgId, status })
}

