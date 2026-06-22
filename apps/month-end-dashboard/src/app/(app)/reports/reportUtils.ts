/**
 * Shared utilities for financial reports
 */

/**
 * Export report data to CSV
 */
export async function exportReportToCsv(
  reportName: string,
  headers: string[],
  rows: (string | number)[][]
) {
  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${reportName}_${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

/**
 * Format currency value (GAAP style: negatives in parentheses)
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const num = Number(value)
  if (num < 0) {
    return `(${Math.abs(num).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })})`
  }
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Account type mapping for classification
 */
export function getAccountType(accountName: string, accountType: string | null): 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'unknown' {
  // Use provided account_type if available
  if (accountType) {
    const lower = accountType.toLowerCase()
    if (lower.includes('asset')) return 'asset'
    if (lower.includes('liability')) return 'liability'
    if (lower.includes('equity')) return 'equity'
    if (lower.includes('revenue') || lower.includes('income')) return 'revenue'
    if (lower.includes('expense') || lower.includes('cost')) return 'expense'
  }

  // Fallback to name-based heuristics
  const name = accountName.toLowerCase()
  
  // Assets
  if (name.includes('cash') || name.includes('bank') || name.includes('checking') || 
      name.includes('savings') || name.includes('account receivable') || name.includes('ar ') ||
      name.includes('inventory') || name.includes('prepaid') || name.includes('asset')) {
    return 'asset'
  }
  
  // Liabilities
  if (name.includes('account payable') || name.includes('ap ') || name.includes('payable') ||
      name.includes('loan') || name.includes('debt') || name.includes('liability')) {
    return 'liability'
  }
  
  // Equity
  if (name.includes('equity') || name.includes('capital') || name.includes('retained earnings')) {
    return 'equity'
  }
  
  // Revenue
  if (name.includes('revenue') || name.includes('income') || name.includes('sales')) {
    return 'revenue'
  }
  
  // Expenses
  if (name.includes('expense') || name.includes('cost') || name.includes('depreciation')) {
    return 'expense'
  }
  
  return 'unknown'
}

