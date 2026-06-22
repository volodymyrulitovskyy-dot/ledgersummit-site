/**
 * Workday calculation utilities
 * Assumes workdays are Monday-Friday (ignores holidays for MVP)
 */

export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6 // Sunday = 0, Saturday = 6
}

/**
 * Get the nth workday of a month
 * @param year - Year
 * @param month - Month (1-12)
 * @param n - Nth workday (1 = first workday, 2 = second, etc.)
 * @returns Date object for the nth workday
 */
export function nthWorkdayOfMonth(year: number, month: number, n: number): Date {
  if (n < 1) {
    throw new Error('n must be >= 1')
  }

  const firstDay = new Date(year, month - 1, 1)
  let currentDate = new Date(firstDay)
  let workdayCount = 0

  // Find the nth workday
  while (workdayCount < n) {
    if (!isWeekend(currentDate)) {
      workdayCount++
      if (workdayCount === n) {
        return currentDate
      }
    }
    currentDate.setDate(currentDate.getDate() + 1)

    // Safety check: don't go past the month
    if (currentDate.getMonth() !== month - 1) {
      throw new Error(`Not enough workdays in month. Found ${workdayCount} workdays, needed ${n}`)
    }
  }

  return currentDate
}

/**
 * Get the nth workday from the end of a month
 * @param year - Year
 * @param month - Month (1-12)
 * @param n - Nth from end (1 = last workday, 2 = second-to-last, etc.)
 * @returns Date object for the nth workday from end
 */
export function workdayFromMonthEnd(year: number, month: number, n: number): Date {
  if (n < 1) {
    throw new Error('n must be >= 1')
  }

  // Get last day of month
  const lastDay = new Date(year, month, 0) // Day 0 of next month = last day of current month
  let currentDate = new Date(lastDay)
  let workdayCount = 0

  // Work backwards to find the nth workday from end
  while (workdayCount < n) {
    if (!isWeekend(currentDate)) {
      workdayCount++
      if (workdayCount === n) {
        return currentDate
      }
    }
    currentDate.setDate(currentDate.getDate() - 1)

    // Safety check: don't go past the month
    if (currentDate.getMonth() !== month - 1) {
      throw new Error(`Not enough workdays in month. Found ${workdayCount} workdays from end, needed ${n}`)
    }
  }

  return currentDate
}

/**
 * Compute the due date for a task based on period and due date rules
 * @param periodYear - Year of the period
 * @param periodMonth - Month of the period (1-12)
 * @param dueType - 'fixed' or 'workday'
 * @param dueDate - Fixed date (only used if dueType='fixed')
 * @param dueWorkdayN - Nth workday (only used if dueType='workday')
 * @param anchor - 'month_start' or 'month_end' (only used if dueType='workday')
 * @param offsetDays - Offset in days (can be negative)
 * @returns Computed due date, or null if cannot compute
 */
export function computeDueDateForTask(
  periodYear: number,
  periodMonth: number,
  dueType: 'fixed' | 'workday',
  dueDate: Date | null,
  dueWorkdayN: number | null,
  anchor: 'month_start' | 'month_end' | null,
  offsetDays: number
): Date | null {
  if (dueType === 'fixed') {
    if (!dueDate) {
      return null
    }
    // Apply offset to fixed date
    const result = new Date(dueDate)
    result.setDate(result.getDate() + offsetDays)
    return result
  }

  // dueType === 'workday'
  if (!dueWorkdayN || !anchor) {
    return null
  }

  try {
    let baseDate: Date

    if (anchor === 'month_start') {
      baseDate = nthWorkdayOfMonth(periodYear, periodMonth, dueWorkdayN)
    } else {
      // month_end
      baseDate = workdayFromMonthEnd(periodYear, periodMonth, dueWorkdayN)
    }

    // Apply offset
    const result = new Date(baseDate)
    result.setDate(result.getDate() + offsetDays)
    return result
  } catch (error) {
    console.error('Error computing workday due date:', error)
    return null
  }
}

