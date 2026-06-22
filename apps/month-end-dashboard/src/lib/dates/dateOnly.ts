/**
 * Date-only utilities (no timezone conversion)
 * Treats all dates as date-only strings "YYYY-MM-DD"
 */

/**
 * Format a date-only ISO string (YYYY-MM-DD) to a display string
 * Parses the string directly without timezone conversion
 * @param iso - Date string in YYYY-MM-DD format
 * @returns Formatted string like "Dec 1, 2025"
 */
export function formatDateOnly(iso: string): string {
  if (!iso || iso.length < 10) return iso

  const [year, month, day] = iso.split('-').map(Number)
  
  // Create date in UTC to avoid timezone shifts
  const dt = new Date(Date.UTC(year, month - 1, day))
  
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(dt)
}

/**
 * Convert a Date object to a date-only ISO string (YYYY-MM-DD)
 * Uses UTC date components to avoid timezone issues
 * @param date - Date object
 * @returns ISO string in YYYY-MM-DD format
 */
export function dateToISOString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Convert an ISO date-only string to a UTC Date object
 * @param iso - Date string in YYYY-MM-DD format
 * @returns Date object in UTC
 */
export function isoToUTCDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

/**
 * Convert an ISO date-only string to a UTC Date object (alias for clarity)
 * Use this when you need to convert YYYY-MM-DD to a Date for Prisma queries
 * @param iso - Date string in YYYY-MM-DD format
 * @returns Date object in UTC (midnight UTC for that date)
 */
export function isoToUTCDateOnly(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/**
 * Get the day before a given date (for beginning balance calculations)
 * @param iso - Date string in YYYY-MM-DD format
 * @returns Previous day as YYYY-MM-DD string
 */
export function priorDay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() - 1)
  return dateToISOString(date)
}

