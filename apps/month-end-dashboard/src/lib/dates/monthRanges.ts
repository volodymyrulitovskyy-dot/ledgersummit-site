/**
 * Month range utilities
 */

import { dateToISOString } from './dateOnly'

/**
 * Get the last complete month range relative to today
 * @param today - Date to calculate from (defaults to today)
 * @returns Object with fromISO and toISO strings (yyyy-mm-dd format)
 * 
 * Example: If today is Jan 5, 2026, returns:
 * { fromISO: '2025-12-01', toISO: '2025-12-31' }
 */
export function lastFullMonthRange(today: Date = new Date()): {
  fromISO: string
  toISO: string
} {
  // Get previous month using local date math
  const year = today.getFullYear()
  const month = today.getMonth() // 0-indexed (0 = January)

  // Calculate previous month
  let prevYear = year
  let prevMonth = month - 1

  if (prevMonth < 0) {
    prevMonth = 11 // December
    prevYear = year - 1
  }

  // First day of previous month (using local date to avoid timezone issues)
  const fromDate = new Date(prevYear, prevMonth, 1)
  const fromISO = dateToISOString(fromDate)

  // Last day of previous month (day 0 of next month = last day of previous month)
  const toDate = new Date(prevYear, prevMonth + 1, 0)
  const toISO = dateToISOString(toDate)

  return { fromISO, toISO }
}

