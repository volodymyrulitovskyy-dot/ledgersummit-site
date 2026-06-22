/**
 * Normalization rules for financial statement values
 * Enforces sign conventions per GAAP
 */

export interface NormalizedLine {
  account_name: string
  account_number: string | null
  category: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cogs'
  normalized_balance: number // Always positive for display
  raw_balance: number // Original balance from TB
}

/**
 * Normalize balance based on account category
 * GAAP conventions:
 * - Assets, Expenses: positive (debit normal)
 * - Liabilities, Equity, Revenue: positive (credit normal)
 * 
 * TB balance = debit - credit
 * For credit-normal accounts, we flip the sign for display
 */
export function normalizeBalance(
  balance: number,
  category: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cogs'
): number {
  // Assets and Expenses: debit normal (positive = debit, negative = credit)
  // Display as-is (positive for assets/expenses)
  if (category === 'asset' || category === 'expense' || category === 'cogs') {
    return Math.abs(balance) // Always positive for display
  }
  
  // Liabilities, Equity, Revenue: credit normal (positive = credit, negative = debit)
  // For display, we want positive values, so flip sign
  if (category === 'liability' || category === 'equity' || category === 'revenue') {
    return Math.abs(balance) // Always positive for display
  }
  
  return Math.abs(balance) // Default: absolute value
}

/**
 * Normalize a TB line for financial statement display
 */
export function normalizeTbLine(
  line: {
    account_name: string
    account_number: string | null
    balance: number
  },
  category: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cogs'
): NormalizedLine {
  return {
    account_name: line.account_name,
    account_number: line.account_number,
    category,
    normalized_balance: normalizeBalance(line.balance, category),
    raw_balance: line.balance,
  }
}

