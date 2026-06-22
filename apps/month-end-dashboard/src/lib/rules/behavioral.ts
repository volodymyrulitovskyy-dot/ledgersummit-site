/**
 * Behavioral rules - validate transaction patterns and timing
 */

import { Rule, RuleResult, RuleExecutionContext } from './types'

/**
 * Rule: Manual JEs over threshold
 * Checks if manual journal entries exceed a threshold amount
 */
export async function evaluateManualJEsOverThreshold(
  rule: Rule,
  context: RuleExecutionContext
): Promise<RuleResult[]> {
  const results: RuleResult[] = []

  if (!context.glDetails) {
    // Can't evaluate without GL detail data
    return results
  }

  const threshold = (rule.config.threshold as number) || 10000
  const accountMatch = rule.config.accountMatch as string | undefined

  // Group GL details by account
  const accountGroups = new Map<string, Array<typeof context.glDetails[0]>>()

  for (const detail of context.glDetails) {
    if (accountMatch && !detail.accountId.includes(accountMatch)) {
      continue
    }

    if (!accountGroups.has(detail.accountId)) {
      accountGroups.set(detail.accountId, [])
    }
    accountGroups.get(detail.accountId)!.push(detail)
  }

  // Check each account
  for (const [accountId, details] of accountGroups.entries()) {
    // Sum manual journal entries
    const manualJEs = details.filter((d) => d.postingType === 'manual')
    const totalManualJE = manualJEs.reduce((sum, d) => sum + Math.abs(d.amount), 0)

    const passed = totalManualJE <= threshold

    // Find account name from TB lines
    const accountLine = context.tbLines.find((l) => l.account_id === accountId)
    const accountName = accountLine?.account_name || accountId

    results.push({
      ruleId: rule.id,
      accountId,
      accountName,
      period: context.period,
      result: passed ? 'pass' : 'fail',
      value: totalManualJE,
      threshold,
      message: passed
        ? `Account "${accountName}" has ${totalManualJE.toLocaleString()} in manual JEs (within threshold)`
        : `Account "${accountName}" has ${totalManualJE.toLocaleString()} in manual JEs (exceeds threshold of ${threshold.toLocaleString()})`,
      metadata: {
        manualJECount: manualJEs.length,
        totalManualJE,
      },
    })
  }

  return results
}

/**
 * Rule: Entries posted after close date
 * Checks if transactions were posted after the period close date
 */
export async function evaluateEntriesPostedAfterCloseDate(
  rule: Rule,
  context: RuleExecutionContext
): Promise<RuleResult[]> {
  const results: RuleResult[] = []

  if (!context.glDetails) {
    // Can't evaluate without GL detail data
    return results
  }

  const closeDate = rule.config.closeDate as string | undefined
  if (!closeDate) {
    // No close date configured - skip
    return results
  }

  const closeDateObj = new Date(closeDate + 'T23:59:59Z')
  const accountMatch = rule.config.accountMatch as string | undefined

  // Find entries posted after close date
  const lateEntries: Array<typeof context.glDetails[0]> = []

  for (const detail of context.glDetails) {
    if (accountMatch && !detail.accountId.includes(accountMatch)) {
      continue
    }

    const entryDate = new Date(detail.date + 'T00:00:00Z')
    if (entryDate > closeDateObj) {
      lateEntries.push(detail)
    }
  }

  // Group by account
  const accountGroups = new Map<string, Array<typeof context.glDetails[0]>>()

  for (const entry of lateEntries) {
    if (!accountGroups.has(entry.accountId)) {
      accountGroups.set(entry.accountId, [])
    }
    accountGroups.get(entry.accountId)!.push(entry)
  }

  // Create results for each account with late entries
  for (const [accountId, entries] of accountGroups.entries()) {
    const totalLateAmount = entries.reduce((sum, e) => sum + Math.abs(e.amount), 0)

    // Find account name from TB lines
    const accountLine = context.tbLines.find((l) => l.account_id === accountId)
    const accountName = accountLine?.account_name || accountId

    results.push({
      ruleId: rule.id,
      accountId,
      accountName,
      period: context.period,
      result: 'fail', // Always fail if entries posted after close
      value: totalLateAmount,
      threshold: 0,
      message: `Account "${accountName}" has ${entries.length} entry/entries totaling ${totalLateAmount.toLocaleString()} posted after close date ${closeDate}`,
      metadata: {
        lateEntryCount: entries.length,
        totalLateAmount,
        closeDate,
        lateDates: entries.map((e) => e.date),
      },
    })
  }

  // If no late entries found, return a pass result
  if (results.length === 0) {
    results.push({
      ruleId: rule.id,
      period: context.period,
      result: 'pass',
      value: 0,
      threshold: 0,
      message: `No entries posted after close date ${closeDate}`,
    })
  }

  return results
}

