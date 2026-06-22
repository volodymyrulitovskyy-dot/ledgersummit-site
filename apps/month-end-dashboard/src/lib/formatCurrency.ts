/**
 * Currency formatting utilities
 */

/**
 * Format a number as currency (USD)
 * @param value - Number to format (can be null/undefined)
 * @param showZero - If true, show "$0.00" for zero/null values; otherwise show "—"
 * @returns Formatted currency string
 */
export function formatCurrency(value: number | null | undefined, showZero = false): string {
  if (value === null || value === undefined || (value === 0 && !showZero)) {
    return '—'
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Format a number as currency with parentheses for negative values
 * @param value - Number to format
 * @param showZero - If true, show "$0.00" for zero/null values; otherwise show "—"
 * @returns Formatted currency string (e.g., "($1,234.56)" for negative)
 */
export function formatCurrencyWithParens(value: number | null | undefined, showZero = false): string {
  if (value === null || value === undefined || (value === 0 && !showZero)) {
    return '—'
  }
  if (value < 0) {
    return `(${formatCurrency(Math.abs(value), true).replace('$', '')})`
  }
  return formatCurrency(value, true)
}

