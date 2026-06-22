/**
 * Balance Sheet path builder - maps QBO AccountType/AccountSubType to GAAP hierarchy
 */

type BSBucket = {
  section: string // ASSETS, LIABILITIES, EQUITY
  subsection: string // Current Assets, Fixed Assets, etc.
  group: string // Bank Accounts, Accounts Receivable, etc.
}

/**
 * Map QBO AccountType and AccountSubType to Balance Sheet hierarchy
 */
export function mapBsBucket(accountType?: string, accountSubType?: string): BSBucket {
  const type = (accountType || '').toUpperCase()
  const subType = (accountSubType || '').toUpperCase()

  // ASSETS
  if (type === 'BANK' || type === 'OTHER_CURRENT_ASSET' || type === 'ACCOUNTS_RECEIVABLE' || 
      type === 'INVENTORY' || type === 'PREPAID_EXPENSE' || type === 'OTHER_ASSET') {
    if (type === 'BANK') {
      return { section: 'ASSETS', subsection: 'Current Assets', group: 'Bank Accounts' }
    }
    if (type === 'ACCOUNTS_RECEIVABLE') {
      return { section: 'ASSETS', subsection: 'Current Assets', group: 'Accounts Receivable' }
    }
    if (type === 'INVENTORY') {
      return { section: 'ASSETS', subsection: 'Current Assets', group: 'Inventory' }
    }
    if (type === 'PREPAID_EXPENSE') {
      return { section: 'ASSETS', subsection: 'Current Assets', group: 'Prepaid Expenses' }
    }
    if (type === 'OTHER_CURRENT_ASSET') {
      return { section: 'ASSETS', subsection: 'Current Assets', group: 'Other Current Assets' }
    }
    // Fixed Assets
    if (type === 'FIXED_ASSET' || subType.includes('FIXED')) {
      return { section: 'ASSETS', subsection: 'Fixed Assets', group: 'Property, Plant & Equipment' }
    }
    // Other Assets
    return { section: 'ASSETS', subsection: 'Other Assets', group: 'Other Assets' }
  }

  // LIABILITIES
  if (type === 'ACCOUNTS_PAYABLE' || type === 'CREDIT_CARD' || type === 'OTHER_CURRENT_LIABILITY' ||
      type === 'LONG_TERM_LIABILITY' || type === 'OTHER_LIABILITY') {
    if (type === 'ACCOUNTS_PAYABLE') {
      return { section: 'LIABILITIES', subsection: 'Current Liabilities', group: 'Accounts Payable' }
    }
    if (type === 'CREDIT_CARD') {
      return { section: 'LIABILITIES', subsection: 'Current Liabilities', group: 'Credit Cards' }
    }
    if (type === 'OTHER_CURRENT_LIABILITY') {
      return { section: 'LIABILITIES', subsection: 'Current Liabilities', group: 'Other Current Liabilities' }
    }
    if (type === 'LONG_TERM_LIABILITY') {
      return { section: 'LIABILITIES', subsection: 'Long Term Liabilities', group: 'Long Term Debt' }
    }
    return { section: 'LIABILITIES', subsection: 'Other Liabilities', group: 'Other Liabilities' }
  }

  // EQUITY
  if (type === 'EQUITY') {
    if (subType.includes('RETAINED') || subType.includes('EARNINGS')) {
      return { section: 'EQUITY', subsection: 'Equity', group: 'Retained Earnings' }
    }
    if (subType.includes('CAPITAL') || subType.includes('STOCK')) {
      return { section: 'EQUITY', subsection: 'Equity', group: 'Capital' }
    }
    return { section: 'EQUITY', subsection: 'Equity', group: 'Equity' }
  }

  // Default fallback
  return { section: 'ASSETS', subsection: 'Other Assets', group: 'Unclassified' }
}

/**
 * Build Balance Sheet path for an account
 * Uses account_type and account_subtype from TB rollforward data
 * REQUIRED mapping rules per user specification
 */
export function bsPathForAccount(acct: {
  account_name: string
  account_type: string
  account_subtype?: string
}): string {
  const leaf = acct.account_name || 'Unknown'
  const accountType = acct.account_type || ''
  const accountSubtype = (acct.account_subtype || '').toUpperCase()

  // ASSETS
  if (accountType === 'ASSET') {
    if (accountSubtype.includes('BANK')) {
      return `ASSETS / Current Assets / Bank Accounts / ${leaf}`
    }
    if (accountSubtype.includes('RECEIVABLE')) {
      return `ASSETS / Current Assets / Accounts Receivable / ${leaf}`
    }
    if (accountSubtype.includes('FIXED')) {
      return `ASSETS / Fixed Assets / ${leaf}`
    }
    // Default to Current Assets for other asset types
    return `ASSETS / Current Assets / ${leaf}`
  }

  // LIABILITIES
  if (accountType === 'LIABILITY') {
    if (accountSubtype.includes('PAYABLE') || accountSubtype.includes('CREDIT')) {
      return `LIABILITIES / Current Liabilities / ${leaf}`
    }
    if (accountSubtype.includes('LONG')) {
      return `LIABILITIES / Long-Term Liabilities / ${leaf}`
    }
    // Default to Current Liabilities
    return `LIABILITIES / Current Liabilities / ${leaf}`
  }

  // EQUITY
  if (accountType === 'EQUITY') {
    return `EQUITY / Equity / ${leaf}`
  }

  // UNCLASSIFIED (should not happen for BS accounts, but safe fallback)
  return `UNCLASSIFIED / ${leaf}`
}

