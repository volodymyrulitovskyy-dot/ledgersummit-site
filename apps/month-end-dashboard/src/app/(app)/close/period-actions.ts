'use server'

import { ensureUser } from '@/lib/auth/ensureUser'
import { ensureOrgAccess } from '@/lib/auth/ensureOrgAccess'
import { prisma } from '@/lib/db/prisma'
import { setActivePeriodFromId, setActivePeriodToId } from '@/lib/active'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function setPeriodRangeAction(fromPeriodId: string | null, toPeriodId: string) {
  await ensureUser()

  // Verify to period access
  const toPeriod = await prisma.period.findUnique({
    where: { id: toPeriodId },
    include: { org: true },
  })

  if (!toPeriod) {
    throw new Error('To period not found')
  }

  await ensureOrgAccess(toPeriod.org_id)

  // If from period is provided, verify it
  if (fromPeriodId) {
    const fromPeriod = await prisma.period.findUnique({
      where: { id: fromPeriodId },
      include: { org: true },
    })

    if (!fromPeriod) {
      throw new Error('From period not found')
    }

    // Verify both periods belong to same org
    if (fromPeriod.org_id !== toPeriod.org_id) {
      throw new Error('Periods must belong to the same organization')
    }

    // Validate: To period must be >= From period (by year/month)
    const toDate = new Date(toPeriod.year, toPeriod.month - 1)
    const fromDate = new Date(fromPeriod.year, fromPeriod.month - 1)

    if (toDate < fromDate) {
      throw new Error('To period must be >= From period')
    }

    await setActivePeriodFromId(fromPeriodId)
  } else {
    // If no from period, use to period as from
    await setActivePeriodFromId(toPeriodId)
  }

  await setActivePeriodToId(toPeriodId)

  revalidatePath('/close')
  redirect('/close')
}

