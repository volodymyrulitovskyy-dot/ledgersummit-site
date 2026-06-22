'use server'

import { setRangeFromDate, setRangeToDate } from '@/lib/active'
import { lastFullMonthRange } from '@/lib/dates/monthRanges'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { refreshTrialBalanceAction } from './refresh-action'

type ActionResult = { error?: string } | void

export async function setDateRangeAction(
  prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const rangeFrom = formData.get('rangeFrom') as string
  const rangeTo = formData.get('rangeTo') as string

  // Validation
  if (!rangeFrom || !rangeTo) {
    return { error: 'Both From and To dates are required' }
  }

  // Parse dates as date-only (no timezone conversion)
  const fromParts = rangeFrom.split('-').map(Number)
  const toParts = rangeTo.split('-').map(Number)

  const fromDate = new Date(Date.UTC(fromParts[0], fromParts[1] - 1, fromParts[2]))
  const toDate = new Date(Date.UTC(toParts[0], toParts[1] - 1, toParts[2]))

  if (fromDate > toDate) {
    return { error: 'From date must be <= To date' }
  }

  // Set cookies (dates already in YYYY-MM-DD format)
  await setRangeFromDate(rangeFrom)
  await setRangeToDate(rangeTo)

  revalidatePath('/close')
  redirect('/close')
}

/**
 * Combined: set range AND refresh TB from QBO
 */
export async function applyAndRefreshAction(
  prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const orgId = formData.get('orgId') as string
  const rangeFrom = formData.get('rangeFrom') as string
  const rangeTo = formData.get('rangeTo') as string
  if (!orgId || !rangeFrom || !rangeTo) {
    return { error: 'Org, From, and To are required' }
  }

  // reuse validation from above
  const fromParts = rangeFrom.split('-').map(Number)
  const toParts = rangeTo.split('-').map(Number)
  const fromDate = new Date(Date.UTC(fromParts[0], fromParts[1] - 1, fromParts[2]))
  const toDate = new Date(Date.UTC(toParts[0], toParts[1] - 1, toParts[2]))
  if (fromDate > toDate) return { error: 'From date must be <= To date' }

  await setRangeFromDate(rangeFrom)
  await setRangeToDate(rangeTo)

  // Try to refresh from QBO, but don't fail if no connection exists
  try {
    await refreshTrialBalanceAction(orgId, rangeFrom, rangeTo)
  } catch (error: any) {
    // If no QBO connection, that's okay - user can work with existing data
    if (error.message?.includes('No QBO connection')) {
      console.warn('[Date Range] No QBO connection - continuing with existing data')
      // Don't throw - just continue
    } else {
      // Re-throw other errors
      throw error
    }
  }

  revalidatePath('/close')
  redirect('/close')
}

/**
 * Set date range to last full month
 */
export async function setLastFullMonthAction(): Promise<never> {
  const { fromISO, toISO } = lastFullMonthRange()

  await setRangeFromDate(fromISO)
  await setRangeToDate(toISO)

  revalidatePath('/close')
  redirect('/close')
}
