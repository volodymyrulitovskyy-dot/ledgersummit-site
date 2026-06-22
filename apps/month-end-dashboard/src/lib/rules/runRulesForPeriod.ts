/**
 * Rule execution engine - runs rules against snapshotted period data
 * Results are stored, not recomputed silently
 */

import { prisma } from '@/lib/db/prisma'
import { Rule, RuleResult, RuleExecutionContext } from './types'
import { evaluateBalanceMustBeZero, evaluateBalanceMustReverseMonthly } from './structural'
import { evaluateManualJEsOverThreshold, evaluateEntriesPostedAfterCloseDate } from './behavioral'
import { evaluateScheduleVariance } from './scheduleVariance'

/**
 * Run all enabled rules for a period and store results
 */
export async function runRulesForPeriod(
  orgId: string,
  period: string, // YYYY-MM-DD
  snapshotId: string
): Promise<{ success: boolean; resultsCount: number; errors: string[] }> {
  // Load snapshot
  const snapshot = await prisma.tbSnapshot.findUnique({
    where: { id: snapshotId },
    include: {
      tb_lines: true,
    },
  })

  if (!snapshot || snapshot.org_id !== orgId) {
    throw new Error('Snapshot not found')
  }

  // Load TB lines
  const tbLines = snapshot.tb_lines.map((line) => ({
    account_id: line.account_number || undefined,
    account_name: line.account_name,
    account_number: line.account_number || undefined,
    balance: Number(line.balance),
    debit: line.debit ? Number(line.debit) : undefined,
    credit: line.credit ? Number(line.credit) : undefined,
  }))

  // Load prior period snapshot for comparison (if needed)
  const periodDate = new Date(period + 'T00:00:00Z')
  const year = periodDate.getFullYear()
  const month = periodDate.getMonth() + 1

  // Calculate prior period
  const priorMonth = month === 1 ? 12 : month - 1
  const priorYear = month === 1 ? year - 1 : year

  const priorPeriod = await prisma.period.findFirst({
    where: {
      org_id: orgId,
      year: priorYear,
      month: priorMonth,
    },
  })

  let priorPeriodLines: Array<{ account_id?: string; account_name: string; balance: number }> | undefined

  if (priorPeriod) {
    // Find prior period snapshot
    const priorSnapshot = await prisma.tbSnapshot.findFirst({
      where: {
        org_id: orgId,
        range_to_date: new Date(priorYear, priorMonth - 1, 0), // Last day of prior month
      },
      include: {
        tb_lines: true,
      },
      orderBy: {
        imported_at: 'desc',
      },
    })

    if (priorSnapshot) {
      priorPeriodLines = priorSnapshot.tb_lines.map((line) => ({
        account_id: line.account_number || undefined,
        account_name: line.account_name,
        balance: Number(line.balance),
      }))
    }
  }

  // Load enabled rules
  const rules = await prisma.rule.findMany({
    where: {
      org_id: orgId,
      enabled: true,
    },
  })

  // Build execution context
  const context: RuleExecutionContext = {
    orgId,
    period,
    snapshotId,
    tbLines,
    priorPeriodLines,
    // GL details would be loaded separately if needed for behavioral rules
    glDetails: undefined, // TODO: Load GL details if needed
  }

  const allResults: RuleResult[] = []
  const errors: string[] = []

  // Execute each rule
  for (const rule of rules) {
    try {
      const ruleResults = await evaluateRule(rule, context)
      allResults.push(...ruleResults)
    } catch (error: any) {
      errors.push(`Rule "${rule.name}" failed: ${error.message || String(error)}`)
    }
  }

  // Store results in database
  // First, clear existing results for this period
  await prisma.ruleResult.deleteMany({
    where: {
      org_id: orgId,
      period: new Date(period + 'T00:00:00Z'),
    },
  })

  // Insert new results
  if (allResults.length > 0) {
    await prisma.ruleResult.createMany({
      data: allResults.map((result) => ({
        org_id: orgId,
        rule_id: result.ruleId,
        period: new Date(result.period + 'T00:00:00Z'),
        account_id: result.accountId || null,
        account_name: result.accountName || null,
        result: result.result,
        value: result.value,
        threshold: result.threshold || null,
        message: result.message || null,
        metadata: result.metadata || null,
      })),
    })
  }

  return {
    success: errors.length === 0,
    resultsCount: allResults.length,
    errors,
  }
}

/**
 * Evaluate a single rule based on its type
 */
async function evaluateRule(
  rule: any, // Prisma Rule type
  context: RuleExecutionContext
): Promise<RuleResult[]> {
  // Convert Prisma rule to our Rule type
  const ruleType = (rule.rule_type || 'threshold') as 'structural' | 'behavioral' | 'statistical' | 'threshold' | 'schedule_variance'
  const config: Record<string, any> = {
    accountMatch: rule.account_match || undefined,
    threshold: rule.threshold_abs ? Number(rule.threshold_abs) : undefined,
    thresholdPos: rule.threshold_pos ? Number(rule.threshold_pos) : undefined,
    thresholdNeg: rule.threshold_neg ? Number(rule.threshold_neg) : undefined,
    closeDate: undefined, // Would come from period config
    // Schedule variance tolerance (uses threshold_abs as fallback)
    scheduleVarianceTolerance: rule.threshold_abs ? Number(rule.threshold_abs) : undefined,
  }

  const ruleObj: Rule = {
    id: rule.id,
    org_id: rule.org_id,
    name: rule.name,
    description: rule.description || undefined,
    enabled: rule.enabled,
    severity: (rule.severity as 'info' | 'warning' | 'critical') || 'warning',
    scope: (rule.target === 'tb_account' ? 'account' : 'entity') as 'account' | 'group' | 'entity',
    ruleType: ruleType,
    config,
    owner_name: rule.owner_name || undefined,
    owner_user_id: rule.owner_user_id || undefined,
    created_at: rule.created_at,
    updated_at: rule.updated_at,
  }

  // Route to appropriate evaluator based on rule type
  switch (ruleType) {
    case 'structural':
      return evaluateStructuralRule(ruleObj, context)
    case 'behavioral':
      return evaluateBehavioralRule(ruleObj, context)
    case 'statistical':
      // TODO: Implement statistical rules
      return []
    case 'threshold':
      // Use existing threshold logic (legacy)
      return evaluateThresholdRule(ruleObj, context)
    case 'schedule_variance':
      return evaluateScheduleVariance(ruleObj, context)
    default:
      return []
  }
}

/**
 * Evaluate structural rules
 */
async function evaluateStructuralRule(
  rule: Rule,
  context: RuleExecutionContext
): Promise<RuleResult[]> {
  // Determine which structural rule based on rule name or config
  const ruleName = rule.name.toLowerCase()

  if (ruleName.includes('zero') || ruleName.includes('must be zero')) {
    return evaluateBalanceMustBeZero(rule, context)
  }

  if (ruleName.includes('reverse') || ruleName.includes('reversing')) {
    return evaluateBalanceMustReverseMonthly(rule, context)
  }

  // Default: try balance must be zero
  return evaluateBalanceMustBeZero(rule, context)
}

/**
 * Evaluate behavioral rules
 */
async function evaluateBehavioralRule(
  rule: Rule,
  context: RuleExecutionContext
): Promise<RuleResult[]> {
  const ruleName = rule.name.toLowerCase()

  if (ruleName.includes('manual') || ruleName.includes('je')) {
    return evaluateManualJEsOverThreshold(rule, context)
  }

  if (ruleName.includes('close') || ruleName.includes('after close')) {
    return evaluateEntriesPostedAfterCloseDate(rule, context)
  }

  // Default: try manual JEs
  return evaluateManualJEsOverThreshold(rule, context)
}

/**
 * Evaluate threshold rules (legacy)
 */
async function evaluateThresholdRule(
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
    let passed = true
    let threshold: number | undefined
    let message = ''

    // Check thresholds
    if (rule.config.threshold !== undefined) {
      threshold = rule.config.threshold
      if (Math.abs(balance) > threshold) {
        passed = false
        message = `Account "${line.account_name}" has balance |${balance.toLocaleString()}| > ${threshold.toLocaleString()}`
      }
    }

    if (rule.config.thresholdPos !== undefined) {
      threshold = rule.config.thresholdPos
      if (balance > threshold) {
        passed = false
        message = `Account "${line.account_name}" has balance ${balance.toLocaleString()} > ${threshold.toLocaleString()}`
      }
    }

    if (rule.config.thresholdNeg !== undefined) {
      threshold = rule.config.thresholdNeg
      if (balance < threshold) {
        passed = false
        message = `Account "${line.account_name}" has balance ${balance.toLocaleString()} < ${threshold.toLocaleString()}`
      }
    }

    if (!passed) {
      results.push({
        ruleId: rule.id,
        accountId: line.account_id,
        accountName: line.account_name,
        period: context.period,
        result: 'fail',
        value: balance,
        threshold,
        message,
      })
    } else {
      results.push({
        ruleId: rule.id,
        accountId: line.account_id,
        accountName: line.account_name,
        period: context.period,
        result: 'pass',
        value: balance,
        threshold,
        message: `Account "${line.account_name}" within threshold`,
      })
    }
  }

  return results
}

