/**
 * Account classification using QBO AccountType from raw JSON
 * Falls back to name-based heuristics if type missing
 */

export type AccountCategory = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cogs' | 'unknown'

export interface TbLineWithRaw {
  id: string
  account_name: string
  account_number: string | null
  account_type: string | null
  debit: number | null
  credit: number | null
  balance: number
  raw: any // JSONB from database
}

/**
 * QBO AccountType mapping to our categories
 * Based on QuickBooks Online AccountType values
 * STRICT: Only specific types allowed for Balance Sheet accounts
 */
const QBO_TYPE_MAP: Record<string, AccountCategory> = {
  // Assets (STRICT: Only these allowed)
  'Bank': 'asset',
  'Accounts Receivable': 'asset',
  'Other Current Asset': 'asset',
  'Fixed Asset': 'asset',
  'Other Asset': 'asset',
  
  // Liabilities
  'Accounts Payable': 'liability',
  'Credit Card': 'liability',
  'Other Current Liability': 'liability',
  'Long Term Liability': 'liability',
  'Other Liability': 'liability',
  
  // Equity
  'Equity': 'equity',
  'Retained Earnings': 'equity',
  
  // Revenue (P&L ONLY - never BS)
  'Income': 'revenue',
  'Other Income': 'revenue',
  
  // Expenses (P&L ONLY - never BS)
  'Expense': 'expense',
  'Other Expense': 'expense',
  'Cost of Goods Sold': 'cogs',
}

/**
 * Valid asset account types (strict whitelist)
 */
const VALID_ASSET_TYPES = new Set([
  'Bank',
  'Accounts Receivable',
  'Other Current Asset',
  'Fixed Asset',
  'Other Asset',
  'asset', // lowercase fallback
])

/**
 * Classify account using QBO AccountType from raw JSON, fallback to name-based
 */
export function classifyAccount(line: TbLineWithRaw): AccountCategory {
  // Try to extract AccountType from raw JSON
  if (line.raw && typeof line.raw === 'object') {
    // QBO Reports API may have AccountType in the row metadata
    const accountType = line.raw.AccountType || line.raw.accountType || line.raw.type
    
    if (accountType && typeof accountType === 'string') {
      const mapped = QBO_TYPE_MAP[accountType]
      if (mapped) {
        return mapped
      }
    }
  }
  
  // Use account_type column if available
  if (line.account_type) {
    const lower = line.account_type.toLowerCase()
    if (lower.includes('asset')) return 'asset'
    if (lower.includes('liability')) return 'liability'
    if (lower.includes('equity')) return 'equity'
    if (lower.includes('revenue') || lower.includes('income')) return 'revenue'
    if (lower.includes('expense')) return 'expense'
    if (lower.includes('cogs') || lower.includes('cost of goods')) return 'cogs'
  }
  
  // Fallback to name-based heuristics (STRICT for assets)
  const name = line.account_name.toLowerCase()
  
  // Assets (STRICT: Only specific patterns allowed - NO expenses/revenue)
  // Explicitly exclude expense/revenue keywords first
  if (name.includes('expense') || name.includes('cost of goods') || name.includes('cogs') ||
      name.includes('revenue') || name.includes('income') || name.includes('sales')) {
    // This is NOT an asset, continue to other checks
  } else if (
    name.includes('cash') || name.includes('bank') || name.includes('checking') || 
    name.includes('savings') || name.includes('account receivable') || name.includes('ar ') ||
    name.includes('inventory') || name.includes('prepaid') || name.includes('asset') ||
    name.includes('property') || name.includes('equipment') || name.includes('vehicle') ||
    name.includes('fixed asset') || name.includes('current asset')) {
    return 'asset'
  }
  
  // Liabilities
  if (name.includes('account payable') || name.includes('ap ') || name.includes('payable') ||
      name.includes('loan') || name.includes('debt') || name.includes('liability') ||
      name.includes('credit card') || name.includes('note payable')) {
    return 'liability'
  }
  
  // Equity
  if (name.includes('equity') || name.includes('capital') || name.includes('retained earnings') ||
      name.includes('owner') || name.includes('stock') || name.includes('shareholder')) {
    return 'equity'
  }
  
  // Revenue
  if (name.includes('revenue') || name.includes('income') || name.includes('sales') ||
      name.includes('fee income') || name.includes('service income')) {
    return 'revenue'
  }
  
  // COGS
  if (name.includes('cost of goods') || name.includes('cogs') || name.includes('cost of sales')) {
    return 'cogs'
  }
  
  // Expenses
  if (name.includes('expense') || name.includes('cost') || name.includes('depreciation') ||
      name.includes('rent') || name.includes('salary') || name.includes('wage') ||
      name.includes('utilities') || name.includes('insurance') || name.includes('tax')) {
    return 'expense'
  }
  
  return 'unknown'
}

/**
 * Check if account belongs to Balance Sheet
 */
export function isBalanceSheetAccount(category: AccountCategory): boolean {
  return category === 'asset' || category === 'liability' || category === 'equity'
}

/**
 * Check if account belongs to P&L
 */
export function isPLAccount(category: AccountCategory): boolean {
  return category === 'revenue' || category === 'expense' || category === 'cogs'
}

