"use server"

import { prisma } from '@/lib/db/prisma'
import { ensureUser } from '@/lib/auth/ensureUser'
import { ensureOrgAccess } from '@/lib/auth/ensureOrgAccess'
import { revalidatePath } from 'next/cache'

export async function assignDueDateAction(taskId: string, dueDateISO: string) {
  const user = await ensureUser()
  // Fetch org_id for the task to enforce access
  const task = await prisma.closeTask.findUnique({
    where: { id: taskId },
    select: { org_id: true },
  })
  if (!task) throw new Error('Task not found')
  await ensureOrgAccess(task.org_id)

  await prisma.closeTask.update({
    where: { id: taskId },
    data: { computed_due_date: new Date(dueDateISO) },
  })

  revalidatePath('/calendar')
  return { success: true }
}
