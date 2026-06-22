'use server'

import { setActivePeriodToId } from '@/lib/active'
import { ensureUser } from '@/lib/auth/ensureUser'
import { ensureOrgAccess } from '@/lib/auth/ensureOrgAccess'
import { prisma } from '@/lib/db/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function selectPeriodForTasksAction(periodId: string) {
  await ensureUser()

  // Verify period exists and user has access
  const period = await prisma.period.findUnique({
    where: { id: periodId },
    include: { org: true },
  })

  if (!period) {
    throw new Error('Period not found')
  }

  await ensureOrgAccess(period.org_id)
  await setActivePeriodToId(periodId)

  revalidatePath('/close')
  redirect('/close')
}

