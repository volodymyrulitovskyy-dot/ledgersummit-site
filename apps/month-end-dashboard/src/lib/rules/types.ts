/**
 * Rule definition types for the rule engine
 */

export type RuleSeverity = 'info' | 'warning' | 'critical'
export type RuleScope = 'account' | 'group' | 'entity'
export type RuleType = string

export type Rule = {
  id: string
  org_id: string
  name: string
  description?: string
  enabled: boolean
  severity: RuleSeverity
  scope: RuleScope
  ruleType: RuleType
  config: Record<string, any> // Rule-specific configuration
  owner_name?: string
  owner_user_id?: string
  created_at: Date
  updated_at: Date
}

/**
 * Rule execution result
 */
export type RuleResult = {
  ruleId: string
  accountId?: string
  accountName?: string
  period: string // YYYY-MM-DD
  result: 'pass' | 'fail'
  value: number | null
  threshold?: number | null
  message?: string
  metadata?: Record<string, any>
}

/**
 * Rule execution context
 */
export type RuleExecutionContext = {
  orgId: string
  period: string // YYYY-MM-DD
  snapshotId: string
  tbLines: Array<{
    account_id?: string
    account_name: string
    account_number?: string
    balance: number
    debit?: number
    credit?: number
  }>
  priorPeriodLines?: Array<{
    account_id?: string
    account_name: string
    balance: number
  }>
  glDetails?: Array<{
    accountId: string
    date: string
    txnType: string
    amount: number
    postingType: 'manual' | 'system'
  }>
}

/**
 * Rule evaluator function signature
 */
export type RuleEvaluator = (
  rule: Rule,
  context: RuleExecutionContext
) => Promise<RuleResult[]>

