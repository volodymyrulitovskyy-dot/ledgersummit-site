/**
 * CSV export utilities
 */

/**
 * Escape a CSV field value (handles quotes and commas)
 */
function escapeCsvField(value: any): string {
  if (value === null || value === undefined) {
    return ''
  }
  const str = String(value)
  // If contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Convert an array of objects to CSV string
 * @param rows - Array of objects where keys are column names
 * @param columns - Optional array of column keys in desired order (if not provided, uses all keys from first row)
 * @returns CSV string
 */
export function rowsToCsv(rows: Record<string, any>[], columns?: string[]): string {
  if (!rows || rows.length === 0) {
    return ''
  }

  // Determine columns if not provided
  const cols = columns || Object.keys(rows[0] || {})

  // Build CSV
  const lines: string[] = []

  // Header row
  lines.push(cols.map(escapeCsvField).join(','))

  // Data rows
  for (const row of rows) {
    lines.push(cols.map((col) => escapeCsvField(row[col])).join(','))
  }

  return lines.join('\n')
}

/**
 * Download CSV file
 * @param filename - Name of the file (without .csv extension)
 * @param csvContent - CSV string content
 */
export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Export rows to CSV file
 * @param filename - Name of the file (without .csv extension)
 * @param rows - Array of objects where keys are column names
 * @param columns - Optional array of column keys in desired order
 */
export function exportRowsToCsv(
  filename: string,
  rows: Record<string, any>[],
  columns?: string[]
): void {
  const csvContent = rowsToCsv(rows, columns)
  downloadCsv(filename, csvContent)
}

