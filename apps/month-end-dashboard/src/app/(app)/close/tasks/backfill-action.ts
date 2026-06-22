'use server'

import { ensureUser } from '@/lib/auth/ensureUser'
import { ensureOrgAccess } from '@/lib/auth/ensureOrgAccess'
import { prisma } from '@/lib/db/prisma'
import { revalidatePath } from 'next/cache'
import { isoToUTCDateOnly } from '@/lib/dates/dateOnly'

/**
 * Backfill existing tasks (with null range dates) to the current date range
 */
export async function backfillTasksToRangeAction(
  orgId: string,
  rangeFromDate: string,
  rangeToDate: string
) {
  await ensureUser()
  await ensureOrgAccess(orgId)

  // Update all tasks with null range dates for this org
  const result = await prisma.closeTask.updateMany({
    where: {
      org_id: orgId,
      range_from_date: null,
      range_to_date: null,
    },
    data: {
      range_from_date: isoToUTCDateOnly(rangeFromDate),
      range_to_date: isoToUTCDateOnly(rangeToDate),
    },
  })

  revalidatePath('/close')
  return { updated: result.count }
}

