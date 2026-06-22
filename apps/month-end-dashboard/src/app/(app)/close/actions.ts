'use server'

import { ensureUser } from '@/lib/auth/ensureUser'
import { ensureOrgAccess } from '@/lib/auth/ensureOrgAccess'
import { prisma } from '@/lib/db/prisma'
import { setActivePeriodFromId, setActivePeriodToId } from '@/lib/active'
import { revalidatePath } from 'next/cache'

export async function createPeriodAction(orgId: string, year: number, month: number) {
  await ensureUser()
  await ensureOrgAccess(orgId)

  // Check if period already exists
  const existing = await prisma.period.findFirst({
    where: {
      org_id: orgId,
      year,
      month,
    },
  })

  if (existing) {
    throw new Error(`Period ${year}-${String(month).padStart(2, '0')} already exists`)
  }

  const period = await prisma.period.create({
    data: {
      org_id: orgId,
      year,
      month,
      status: 'open',
    },
  })

  // Set active period range (both from and to to the new period)
  await setActivePeriodFromId(period.id)
  await setActivePeriodToId(period.id)

  revalidatePath('/close')
  return period
}

export async function selectPeriodAction(periodId: string) {
  await ensureUser()

  // Verify period exists and user has access to its org
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
}

