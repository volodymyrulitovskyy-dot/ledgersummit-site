'use server'

import { setActivePeriodFromId, setActivePeriodToId } from '@/lib/active'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

/**
 * Auto-select a period as both From and To period
 * Used when there's only one period available
 */
export async function autoSelectOnlyPeriodAction(formData: FormData) {
  const periodId = formData.get('periodId') as string

  if (!periodId) {
    throw new Error('Period ID is required')
  }

  await setActivePeriodFromId(periodId)
  await setActivePeriodToId(periodId)
  revalidatePath('/close')
  redirect('/close')
}

