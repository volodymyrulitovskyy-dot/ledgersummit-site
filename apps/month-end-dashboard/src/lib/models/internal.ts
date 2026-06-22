/**
 * Internal ERP-agnostic data model
 * 
 * All QBO adapters map to this model.
 * UI never depends on QBO JSON shape directly.
 */

/**
 * Account - normalized account representation
 */
export type Account = {
  id: string // Internal account ID
  number?: string // Account number (e.g., "1010")
  name: string // Account name
  type: string // Account type (e.g., "ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE")
  parentId?: string // Parent account ID for hierarchy
  path: string // Full path (e.g., "Assets / Current Assets / Checking")
  isActive: boolean
  metadata?: Record<string, any>
}

/**
 * Period - normalized period representation
 */
export type Period = {
  id: string
  orgId: string
  year: number
  month: number
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  status: 'open' | 'locked' | 'closed'
  closeDate?: string // YYYY-MM-DD
  metadata?: Record<string, any>
}

/**
 * Entry - normalized journal entry representation
 */
export type Entry = {
  id: string
  accountId: string
  period: string // YYYY-MM-DD
  date: string // YYYY-MM-DD
  documentNumber?: string
  description: string
  debit: number
  credit: number
  amount: number // Net amount (debit - credit)
  entryType: 'manual' | 'system'
  isReversing: boolean
  isBackdated: boolean
  vendorOrCustomer?: string
  metadata?: Record<string, any>
}

/**
 * Dimension - normalized dimension representation (for multi-dimensional accounting)
 */
export type Dimension = {
  id: string
  name: string
  value: string
  metadata?: Record<string, any>
}

/**
 * Rule - normalized rule representation (already defined in rules/types.ts, but included for completeness)
 */
export type Rule = {
  id: string
  orgId: string
  name: string
  severity: 'info' | 'warning' | 'critical'
  scope: 'account' | 'group' | 'entity'
  ruleType: 'structural' | 'behavioral' | 'statistical' | 'threshold'
  config: Record<string, any>
  enabled: boolean
  metadata?: Record<string, any>
}

/**
 * Exception - normalized exception representation
 */
export type Exception = {
  id: string
  orgId: string
  period: string // YYYY-MM-DD
  ruleId: string
  accountId?: string
  severity: 'info' | 'warning' | 'critical'
  status: 'open' | 'explained' | 'resolved' | 'dismissed'
  message: string
  value?: number
  threshold?: number
  metadata?: Record<string, any>
}

/**
 * Action - normalized action representation (e.g., explanations, approvals)
 */
export type Action = {
  id: string
  orgId: string
  period: string // YYYY-MM-DD
  accountId?: string
  exceptionId?: string
  type: 'explanation' | 'approval' | 'adjustment'
  status: 'open' | 'pending' | 'accepted' | 'rejected'
  author: string
  body?: string
  attachments?: Array<{ id: string; filename: string; url: string }>
  metadata?: Record<string, any>
}

/**
 * Evidence - normalized evidence representation
 */
export type Evidence = {
  id: string
  actionId: string
  type: 'file' | 'link' | 'comment'
  content: string // URL, file path, or comment text
  metadata?: Record<string, any>
}

