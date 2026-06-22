/**
 * QBO Adapter - Maps QBO JSON to internal model
 * 
 * This ensures UI never depends on QBO JSON shape directly.
 */

import { Account, Period, Entry } from './internal'

/**
 * Convert QBO report row to internal Account model
 */
export function qboRowToAccount(
  qboRow: any,
  accountId?: string
): Account {
  const accountName = qboRow.ColData?.[0]?.value || qboRow.account_name || ''
  const accountNumber = qboRow.ColData?.[0]?.id || accountId || qboRow.account_number || ''
  
  // Extract account type from QBO data if available
  const accountType = qboRow.account_type || 
    qboRow.AccountType || 
    inferAccountType(accountName)

  return {
    id: accountNumber || accountName,
    number: accountNumber || undefined,
    name: accountName,
    type: accountType,
    path: accountName, // Will be enhanced with hierarchy
    isActive: true,
    metadata: {
      qboRaw: qboRow,
    },
  }
}

/**
 * Convert QBO GL detail row to internal Entry model
 */
export function qboGlDetailToEntry(
  qboRow: any,
  accountId: string,
  period: string
): Entry {
  const date = qboRow.date || qboRow.ColData?.[0]?.value || ''
  const docNo = qboRow.docNo || qboRow.ColData?.[2]?.value || ''
  const description = qboRow.memo || qboRow.ColData?.[5]?.value || ''
  const debit = qboRow.debit || parseAmount(qboRow.ColData?.[6]?.value || '0')
  const credit = qboRow.credit || parseAmount(qboRow.ColData?.[7]?.value || '0')
  const amount = debit - credit
  const txnType = qboRow.txnType || qboRow.ColData?.[1]?.value || ''
  
  const entryType: 'manual' | 'system' = 
    txnType?.toLowerCase().includes('journal') || 
    txnType?.toLowerCase().includes('adjustment')
      ? 'manual'
      : 'system'

  return {
    id: `${accountId}-${date}-${docNo}-${qboRow.id || Math.random()}`,
    accountId,
    period,
    date: formatDate(date),
    documentNumber: docNo || undefined,
    description,
    debit,
    credit,
    amount,
    entryType,
    isReversing: qboRow.isReversing || false,
    isBackdated: qboRow.isBackdated || false,
    vendorOrCustomer: qboRow.vendorOrCustomer || qboRow.ColData?.[4]?.value || undefined,
    metadata: {
      qboRaw: qboRow,
      txnType,
    },
  }
}

/**
 * Convert QBO period to internal Period model
 */
export function qboPeriodToPeriod(
  orgId: string,
  year: number,
  month: number,
  status: string = 'open'
): Period {
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0) // Last day of month

  return {
    id: `${orgId}-${year}-${month}`,
    orgId,
    year,
    month,
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
    status: status as 'open' | 'locked' | 'closed',
    metadata: {},
  }
}

/**
 * Helper: Infer account type from account name
 */
function inferAccountType(accountName: string): string {
  const name = accountName.toLowerCase()
  
  if (name.includes('asset') || name.includes('cash') || name.includes('receivable') || name.includes('inventory')) {
    return 'ASSET'
  }
  if (name.includes('liability') || name.includes('payable') || name.includes('debt')) {
    return 'LIABILITY'
  }
  if (name.includes('equity') || name.includes('capital') || name.includes('retained')) {
    return 'EQUITY'
  }
  if (name.includes('revenue') || name.includes('income') || name.includes('sales')) {
    return 'REVENUE'
  }
  if (name.includes('expense') || name.includes('cost')) {
    return 'EXPENSE'
  }
  
  return 'UNKNOWN'
}

/**
 * Helper: Parse amount string
 */
function parseAmount(str: string): number {
  if (!str || str.trim() === '' || str === '—') return 0
  const cleaned = str.replace(/,/g, '').replace(/[()$]/g, '').trim()
  const isNegative = /^\(.*\)$/.test(str.trim())
  const num = Number(cleaned)
  if (!Number.isFinite(num)) return 0
  return isNegative ? -num : num
}

/**
 * Helper: Format date to YYYY-MM-DD
 */
function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match) {
    const [, month, day, year] = match
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  return dateStr
}

