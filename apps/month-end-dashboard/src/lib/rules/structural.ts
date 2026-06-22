/**
 * Structural rules - validate account structure and relationships
 */

import { Rule, RuleResult, RuleExecutionContext } from './types'

/**
 * Rule: Balance must be zero
 * Checks if specified accounts have zero balance
 */
export async function evaluateBalanceMustBeZero(
  rule: Rule,
  context: RuleExecutionContext
): Promise<RuleResult[]> {
  const results: RuleResult[] = []
  const accountMatch = rule.config.accountMatch as string | undefined

  if (!accountMatch) {
    return results
  }

  const matchingLines = context.tbLines.filter((line) =>
    line.account_name.toLowerCase().includes(accountMatch.toLowerCase())
  )

  for (const line of matchingLines) {
    const balance = Number(line.balance)
    const threshold = 0.01 // Allow small rounding differences
    const passed = Math.abs(balance) < threshold

    results.push({
      ruleId: rule.id,
      accountId: line.account_id,
      accountName: line.account_name,
      period: context.period,
      result: passed ? 'pass' : 'fail',
      value: balance,
      threshold: 0,
      message: passed
        ? `Account "${line.account_name}" has zero balance`
        : `Account "${line.account_name}" has non-zero balance: ${balance.toLocaleString()}`,
    })
  }

  return results
}

/**
 * Rule: Balance must reverse monthly
 * Checks if account balance reverses sign between periods
 */
export async function evaluateBalanceMustReverseMonthly(
  rule: Rule,
  context: RuleExecutionContext
): Promise<RuleResult[]> {
  const results: RuleResult[] = []

  if (!context.priorPeriodLines) {
    // Can't evaluate without prior period data
    return results
  }

  const accountMatch = rule.config.accountMatch as string | undefined
  if (!accountMatch) {
    return results
  }

  const currentLines = context.tbLines.filter((line) =>
    line.account_name.toLowerCase().includes(accountMatch.toLowerCase())
  )

  for (const currentLine of currentLines) {
    const priorLine = context.priorPeriodLines.find(
      (p) => p.account_name === currentLine.account_name
    )

    if (!priorLine) {
      // No prior period data - skip
      continue
    }

    const currentBalance = Number(currentLine.balance)
    const priorBalance = Number(priorLine.balance)

    // Check if signs are opposite (one positive, one negative)
    const signsOpposite =
      (currentBalance > 0 && priorBalance < 0) ||
      (currentBalance < 0 && priorBalance > 0)

    const passed = signsOpposite

    results.push({
      ruleId: rule.id,
      accountId: currentLine.account_id,
      accountName: currentLine.account_name,
      period: context.period,
      result: passed ? 'pass' : 'fail',
      value: currentBalance,
      threshold: priorBalance,
      message: passed
        ? `Account "${currentLine.account_name}" reversed from ${priorBalance.toLocaleString()} to ${currentBalance.toLocaleString()}`
        : `Account "${currentLine.account_name}" did not reverse. Prior: ${priorBalance.toLocaleString()}, Current: ${currentBalance.toLocaleString()}`,
      metadata: {
        priorBalance,
        currentBalance,
      },
    })
  }

  return results
}

