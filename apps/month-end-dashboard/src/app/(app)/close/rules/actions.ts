'use server'

import { ensureUser } from '@/lib/auth/ensureUser'
import { ensureOrgAccess } from '@/lib/auth/ensureOrgAccess'
import { prisma } from '@/lib/db/prisma'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'

type Scope = 'ALL' | 'ACCOUNT_MATCH' | 'ACCOUNT_ID'
type VarianceMode = 'NONE' | 'ABS_DELTA' | 'PCT_DELTA'
type VarianceBasis = 'PRIOR_MONTH' | 'PRIOR_QUARTER' | 'PRIOR_YEAR_SAME_MONTH'

type RuleType = string

interface CreateRuleInput {
  orgId: string
  name: string
  description?: string
  accountMatch?: string
  accountId?: string
  thresholdAbs?: number
  thresholdPos?: number
  thresholdNeg?: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  ownerName?: string
  scope?: Scope
  varianceMode?: VarianceMode
  varianceBasis?: VarianceBasis
  varianceThreshold?: number
  ruleType?: RuleType
  domain?: 'GL' | 'PROJECT_PNL'
  metric?: string
  target?: string
}

const num = (v: unknown) => {
  if (v == null) return null
  if (typeof v === 'number') return v
  if (typeof v === 'string') return Number(v)
  if (typeof v === 'object' && typeof (v as { toNumber?: () => number }).toNumber === 'function') {
    return (v as { toNumber: () => number }).toNumber()
  }
  return Number(v)
}

type RuleLike = {
  threshold_abs?: unknown
  threshold_pos?: unknown
  threshold_neg?: unknown
  variance_threshold?: unknown
} & Record<string, unknown>

function serializeRule(r: RuleLike) {
  return {
    ...r,
    threshold_abs: num(r.threshold_abs),
    threshold_pos: num(r.threshold_pos),
    threshold_neg: num(r.threshold_neg),
    variance_threshold: num(r.variance_threshold),
  }
}

/**
 * Create a new rule
 */
export async function createRuleAction(input: CreateRuleInput) {
  await ensureUser()
  await ensureOrgAccess(input.orgId)
  const domain = input.domain ?? 'GL'
  const metric = input.metric ?? null
  if (domain === 'PROJECT_PNL' && !metric) {
    throw new Error('Metric is required for PROJECT_PNL rules')
  }

  const inserted = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    INSERT INTO med2.rules (
      org_id, name, description, enabled, rule_type, target, scope,
      account_match, threshold_abs, threshold_pos, threshold_neg,
      severity, owner_name, variance_mode, variance_basis, variance_threshold,
      domain, metric, account_id
    ) VALUES (
      ${input.orgId}::uuid,
      ${input.name.trim()},
      ${input.description?.trim() || null},
      true,
      ${input.ruleType ?? 'threshold'},
      ${input.target ?? (domain === 'PROJECT_PNL' ? 'project_pnl' : 'tb_account')},
      ${input.scope ?? 'ALL'},
      ${input.accountMatch?.trim() || null},
      ${input.thresholdAbs ?? null},
      ${input.thresholdPos ?? null},
      ${input.thresholdNeg ?? null},
      ${input.severity},
      ${input.ownerName?.trim() || null},
      ${input.varianceMode ?? 'NONE'},
      ${input.varianceMode === 'NONE' ? null : input.varianceBasis ?? 'PRIOR_MONTH'},
      ${input.varianceMode === 'NONE' ? null : input.varianceThreshold ?? null},
      ${domain},
      ${metric},
      ${input.accountId ?? null}::uuid
    )
    RETURNING *
  `)
  const rule = inserted[0]
  if (!rule) throw new Error('Failed to create rule')

  revalidatePath('/close')
  revalidatePath('/projects')
  return { success: true, rule: serializeRule(rule) }
}

interface UpdateRuleInput {
  ruleId: string
  orgId: string
  name?: string
  description?: string
  enabled?: boolean
  accountMatch?: string
  accountId?: string
  thresholdAbs?: number
  thresholdPos?: number
  thresholdNeg?: number
  severity?: 'low' | 'medium' | 'high' | 'critical'
  ownerName?: string
  scope?: Scope
  varianceMode?: VarianceMode
  varianceBasis?: VarianceBasis
  varianceThreshold?: number
  domain?: 'GL' | 'PROJECT_PNL'
  metric?: 'revenue' | 'cogs' | 'gross_profit' | null
  target?: string
}

/**
 * Update a rule
 */
export async function updateRuleAction(input: UpdateRuleInput) {
  await ensureUser()
  await ensureOrgAccess(input.orgId)
  const existingRows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT domain, metric
    FROM med2.rules
    WHERE id = ${input.ruleId}::uuid
      AND org_id = ${input.orgId}::uuid
    LIMIT 1
  `)
  const existingRule = existingRows[0]
  if (!existingRule) throw new Error('Rule not found')
  if (String(existingRule.domain || 'GL') === 'PROJECT_PNL' && existingRule.metric == null && input.metric === undefined) {
    throw new Error('Metric is required for PROJECT_PNL rules')
  }

  const updateData: Record<string, unknown> = {}
  if (input.name !== undefined) updateData.name = input.name.trim()
  if (input.description !== undefined) updateData.description = input.description?.trim() || null
  if (input.enabled !== undefined) updateData.enabled = input.enabled
  if (input.accountMatch !== undefined) updateData.account_match = input.accountMatch?.trim() || null
  if (input.thresholdAbs !== undefined) updateData.threshold_abs = input.thresholdAbs ?? null
  if (input.thresholdPos !== undefined) updateData.threshold_pos = input.thresholdPos ?? null
  if (input.thresholdNeg !== undefined) updateData.threshold_neg = input.thresholdNeg ?? null
  if (input.severity !== undefined) updateData.severity = input.severity
  if (input.ownerName !== undefined) updateData.owner_name = input.ownerName?.trim() || null
  if (input.scope !== undefined) updateData.scope = input.scope
  if (input.varianceMode !== undefined) updateData.variance_mode = input.varianceMode
  if (input.varianceBasis !== undefined) updateData.variance_basis = input.varianceBasis
  if (input.varianceThreshold !== undefined) updateData.variance_threshold = input.varianceThreshold ?? null
  if (input.domain !== undefined) updateData.domain = input.domain
  if (input.metric !== undefined) updateData.metric = input.metric
  if (input.target !== undefined) updateData.target = input.target

  const nextDomain = ((updateData.domain as string | undefined) ?? String(existingRule.domain || 'GL')) as string
  const nextMetric = (updateData.metric as string | null | undefined) ?? (existingRule.metric as string | null | undefined)
  if (nextDomain === 'PROJECT_PNL' && !nextMetric) {
    throw new Error('Metric is required for PROJECT_PNL rules')
  }

  const updatedRows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    UPDATE med2.rules
    SET
      name = COALESCE(${updateData.name ?? null}, name),
      description = COALESCE(${updateData.description ?? null}, description),
      enabled = COALESCE(${updateData.enabled ?? null}, enabled),
      account_match = COALESCE(${updateData.account_match ?? null}, account_match),
      threshold_abs = COALESCE(${updateData.threshold_abs ?? null}, threshold_abs),
      threshold_pos = COALESCE(${updateData.threshold_pos ?? null}, threshold_pos),
      threshold_neg = COALESCE(${updateData.threshold_neg ?? null}, threshold_neg),
      severity = COALESCE(${updateData.severity ?? null}, severity),
      owner_name = COALESCE(${updateData.owner_name ?? null}, owner_name),
      scope = COALESCE(${updateData.scope ?? null}, scope),
      variance_mode = COALESCE(${updateData.variance_mode ?? null}, variance_mode),
      variance_basis = COALESCE(${updateData.variance_basis ?? null}, variance_basis),
      variance_threshold = COALESCE(${updateData.variance_threshold ?? null}, variance_threshold),
      domain = COALESCE(${updateData.domain ?? null}, domain),
      metric = COALESCE(${updateData.metric ?? null}, metric),
      target = COALESCE(${updateData.target ?? null}, target),
      updated_at = now()
    WHERE id = ${input.ruleId}::uuid
      AND org_id = ${input.orgId}::uuid
    RETURNING *
  `)
  const rule = updatedRows[0]
  if (!rule) throw new Error('Rule not found')

  revalidatePath('/close')
  revalidatePath('/projects')
  return { success: true, rule: serializeRule(rule) }
}

/**
 * Delete a rule
 */
export async function deleteRuleAction(ruleId: string, orgId: string) {
  await ensureUser()
  await ensureOrgAccess(orgId)

  await prisma.rule.delete({
    where: { id: ruleId },
  })

  revalidatePath('/close')
  revalidatePath('/projects')
  return { success: true }
}

/**
 * Toggle rule enabled status
 */
export async function toggleRuleAction(ruleId: string, orgId: string, enabled: boolean) {
  await ensureUser()
  await ensureOrgAccess(orgId)

  await prisma.rule.update({
    where: { id: ruleId },
    data: { enabled },
  })

  revalidatePath('/close')
  revalidatePath('/projects')
  return { success: true }
}
