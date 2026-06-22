'use server'

import { ensureUser } from '@/lib/auth/ensureUser'
import { ensureOrgAccess } from '@/lib/auth/ensureOrgAccess'
import { prisma } from '@/lib/db/prisma'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { buildAndStoreProjectPnlSnapshot, loadProjectPnlSnapshot, type ProjectPnlSnapshot } from '@/lib/projects/projectPnlSnapshot'
import { ensureProjectSchema } from '@/lib/projects/schema'

type Scope = 'ALL' | 'ACCOUNT_MATCH' | 'ACCOUNT_ID'
type VarianceMode = 'NONE' | 'ABS_DELTA' | 'PCT_DELTA'

const toNumber = (v: any) => {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') return Number(v) || 0
  if (typeof v === 'object' && typeof (v as any).toNumber === 'function') return (v as any).toNumber()
  return Number(v) || 0
}

const normalizeName = (s?: string | null) => (s || '').trim().toLowerCase()
const metricValue = (row: any, metric: string) => {
  if (metric === 'cogs') return toNumber(row.cogsSigned)
  if (metric === 'gross_profit') return toNumber(row.grossProfitSigned)
  if (metric === 'gp_percent') return toNumber(row.gpPercent)
  return toNumber(row.revenueSigned)
}

const SEVERITY_WEIGHT: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
function computeRiskScore(severity: string, deltaAbs: number | null, value: number): number {
  const w = SEVERITY_WEIGHT[severity] ?? 1
  return Math.abs(deltaAbs ?? value) * w
}

function matchesRuleAccount(rule: any, line: any) {
  const scope: Scope = (rule.scope as Scope) || 'ALL'
  if (scope === 'ALL') return true
  if (scope === 'ACCOUNT_ID') {
    return !!rule.account_id && (rule.account_id === line.account_number)
  }
  if (scope === 'ACCOUNT_MATCH') {
    const needle = normalizeName(rule.account_match)
    if (!needle) return false
    return normalizeName(line.account_name).includes(needle)
  }
  return true
}

function shiftMonthClamped(date: Date, monthOffset: number) {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth() + monthOffset
  const d = date.getUTCDate()
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(d, lastDay)))
}

function priorMonthRange(fromDate: Date, toDate: Date) {
  const priorFrom = shiftMonthClamped(fromDate, -1)
  const priorTo = shiftMonthClamped(toDate, -1)
  return { priorFrom, priorTo }
}

function toQboDateString(date: Date) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

async function fetchProjectRules(orgId: string) {
  await ensureProjectSchema()
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT *
    FROM med2.rules
    WHERE org_id = ${orgId}::uuid
      AND enabled = true
      AND COALESCE(domain, 'GL') = 'PROJECT_PNL'
    ORDER BY
      CASE severity
        WHEN 'critical' THEN 4
        WHEN 'high' THEN 3
        WHEN 'medium' THEN 2
        ELSE 1
      END DESC
  `)
  return rows
}

async function fetchExistingProjectExceptions(snapshotId: string) {
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT id, rule_id, entity_key, metric, status, resolved_at, resolved_reason
    FROM med2.exceptions
    WHERE snapshot_id = ${snapshotId}::uuid
      AND COALESCE(domain, 'GL') = 'PROJECT_PNL'
  `)
  const map = new Map<string, any>()
  for (const row of rows) {
    map.set(`${row.rule_id}|${row.entity_key}|${row.metric || ''}`, row)
  }
  return map
}

async function upsertProjectException(input: {
  existingId?: string
  orgId: string
  snapshotId: string
  ruleId: string
  severity: string
  title: string
  details: string
  customerKey: string
  customerName: string
  metric: string
  value: number
  baseline: number | null
  deltaAbs: number | null
  deltaPctDecimal: number | null
  riskScore: number
  status?: string
  resolvedAt?: Date | null
  resolvedReason?: string | null
  ownerName?: string | null
  ownerUserId?: string | null
}) {
  const {
    existingId, orgId, snapshotId, ruleId, severity, title, details,
    customerKey, customerName, metric, value, baseline, deltaAbs, deltaPctDecimal,
    riskScore, status, resolvedAt, resolvedReason, ownerName, ownerUserId,
  } = input
  const variancePct = deltaPctDecimal == null ? null : deltaPctDecimal * 100
  if (existingId) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE med2.exceptions
      SET
        status = ${status || 'open'},
        severity = ${severity},
        title = ${title},
        details = ${details},
        account_name = ${customerName},
        account_number = NULL,
        balance = ${value},
        target_value = ${baseline},
        variance_amount = ${deltaAbs},
        variance_pct = ${variancePct},
        owner_name = ${ownerName ?? null},
        owner_user_id = ${ownerUserId ?? null}::uuid,
        resolved_at = ${resolvedAt ?? null},
        resolved_reason = ${resolvedReason ?? null},
        domain = 'PROJECT_PNL',
        entity_key = ${customerKey},
        entity_name = ${customerName},
        metric = ${metric},
        value_signed = ${value},
        value_abs = ${Math.abs(value)},
        baseline_value = ${baseline},
        delta_abs = ${deltaAbs},
        delta_pct = ${deltaPctDecimal},
        risk_score = ${riskScore}
      WHERE id = ${existingId}::uuid
    `)
    return
  }

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO med2.exceptions (
      org_id, snapshot_id, rule_id, status, severity, title, details,
      account_name, account_number, balance, target_value, variance_amount, variance_pct,
      owner_name, owner_user_id, domain, entity_key, entity_name, metric,
      value_signed, value_abs, baseline_value, delta_abs, delta_pct, risk_score
    ) VALUES (
      ${orgId}::uuid, ${snapshotId}::uuid, ${ruleId}::uuid, ${status || 'open'}, ${severity}, ${title}, ${details},
      ${customerName}, NULL, ${value}, ${baseline}, ${deltaAbs}, ${variancePct},
      ${ownerName ?? null}, ${ownerUserId ?? null}::uuid, 'PROJECT_PNL', ${customerKey}, ${customerName}, ${metric},
      ${value}, ${Math.abs(value)}, ${baseline}, ${deltaAbs}, ${deltaPctDecimal}, ${riskScore}
    )
    ON CONFLICT (snapshot_id, rule_id, domain, entity_key, metric) WHERE domain = 'PROJECT_PNL' DO NOTHING
  `)
}

async function runProjectChecks(params: {
  orgId: string
  snapshotId: string
  currentFrom: Date
  currentTo: Date
  source: string
  priorSnapshotId?: string | null
  priorFrom: Date
  priorTo: Date
}) {
  const { orgId, snapshotId, currentFrom, currentTo, source, priorSnapshotId, priorFrom, priorTo } = params

  const currentFromISO = toQboDateString(currentFrom)
  const currentToISO = toQboDateString(currentTo)

  let currentPnl = await loadProjectPnlSnapshot(snapshotId)
  if (!currentPnl) {
    currentPnl = await buildAndStoreProjectPnlSnapshot(orgId, snapshotId, currentFromISO, currentToISO)
  }

  console.log('[PROJECT_CHECKS] prior range:', {
    from: toQboDateString(priorFrom),
    to: toQboDateString(priorTo),
  })

  let priorPnl: ProjectPnlSnapshot | null = null
  if (priorSnapshotId) {
    priorPnl = await loadProjectPnlSnapshot(priorSnapshotId)
    if (!priorPnl) {
      priorPnl = await buildAndStoreProjectPnlSnapshot(
        orgId,
        priorSnapshotId,
        toQboDateString(priorFrom),
        toQboDateString(priorTo)
      )
    }
  }
  console.log('[PROJECT_CHECKS] prior rows:', priorPnl?.rows.length ?? 0)
  console.log('[PROJECT_CHECKS] current rows:', currentPnl.rows.length)

  const priorByKey = new Map<string, any>()
  for (const row of priorPnl?.rows || []) priorByKey.set(row.customerKey, row)

  const rules = await fetchProjectRules(orgId)
  const existingMap = await fetchExistingProjectExceptions(snapshotId)

  let created = 0
  let updated = 0
  let rulesEvaluated = 0
  let customersCurrent = 0
  let customersWithBaseline = 0
  let skippedNoBaseline = 0

  for (const rule of rules) {
    rulesEvaluated += 1
    const metric = String(rule.metric || 'revenue').toLowerCase()
    const ruleType = String(rule.rule_type || 'threshold_current').toLowerCase()
    const varianceMode = String(rule.variance_mode || 'NONE') // Fallback for legacy
    const varianceThreshold = rule.variance_threshold != null ? toNumber(rule.variance_threshold) : null
    const thresholdAbs = rule.threshold_abs != null ? toNumber(rule.threshold_abs) : null
    const thresholdPos = rule.threshold_pos != null ? toNumber(rule.threshold_pos) : null
    const thresholdNeg = rule.threshold_neg != null ? toNumber(rule.threshold_neg) : null

    // Special check for Not Specified rules
    const isNotSpecifiedRule =
      String(rule.target || '').toLowerCase() === 'not_specified_ratio' ||
      String(rule.name || '').toLowerCase().includes('not specified revenue')

    const rows = isNotSpecifiedRule
      ? currentPnl.rows.filter((r) => r.isNotSpecified)
      : currentPnl.rows

    for (const row of rows) {
      customersCurrent += 1
      let current = metricValue(row, metric)
      let baseline: number | null = null
      let deltaAbs: number | null = null
      let deltaPct: number | null = null
      let shouldFlag = false
      let reason = ''

      // 1. Not Specified Checks
      if (isNotSpecifiedRule) {
        const denom = Math.abs(currentPnl.totals.totalRevenueSigned)
        const ratio = denom > 0 ? Math.abs(row.revenueSigned) / denom : 0
        current = ratio
        if (thresholdAbs != null && ratio > thresholdAbs) {
          shouldFlag = true
          reason = `Not Specified Revenue ${(ratio * 100).toFixed(2)}% > ${(thresholdAbs * 100).toFixed(2)}%`
        }
      }
      // 2. Standard Checks
      else {
        const prior = priorByKey.get(row.customerKey)
        const priorVal = prior ? metricValue(prior, metric) : null

        // Setup baseline for Variance/MoM rules
        if (ruleType === 'variance_abs' || ruleType === 'variance_pct' || varianceMode !== 'NONE') {
          const val = priorVal ?? 0
          baseline = val
          if (prior) customersWithBaseline += 1

          deltaAbs = current - val
          // Careful with divide by zero for %
          deltaPct = val === 0 ? null : deltaAbs / Math.abs(val)
        } else {
          // For simple threshold checks, baseline is just for reference
          baseline = priorVal
          if (prior) customersWithBaseline += 1
        }

        // --- EVALUATION LOGIC ---

        // A. Ratio Check (e.g. GP %)
        if (ruleType === 'ratio_check' || metric === 'gp_percent') {
          // Usually we check if current < threshold (e.g. GP% < 20%)
          // But let's support both directions based on threshold signs or separate fields?
          // For simplicity: if threshold_abs is set, allow range? 
          // Current assumption from requirements: "GP% < threshold"

          // If metric is gp_percent, current is already the %.
          // If user set threshold_abs = 0.20, check if current < 0.20 ??
          // Actually standard threshold logic usually implies "exceeds magnitude". 
          // But for GP%, we often want to flag LOW margin. 
          // Let's use threshold_neg/pos semantics or just threshold_abs if provided.

          if (metric === 'gp_percent' && thresholdAbs != null) {
            // Check if it drops BELOW threshold? Or is it an absolute check?
            // Let's assume threshold_abs means "Flag if value < X" for GP? No, that's ambiguous.
            // Let's stick to standard:
            // threshold_pos: flag if value > X
            // threshold_neg: flag if value < X

            // If rule is "GP% < 20%", user should set threshold_neg = 0.2 (if logic is value < 20%?) 
            // BUT standard threshold_neg usually checks for negative numbers (value < -0.2).
            // Let's implement specific logic if rule_type is ratio_check.
          }

          if (thresholdAbs != null && Math.abs(current) < thresholdAbs) {
            // "Low Margin" check could map here? 
            // Let's Assume threshold_abs for GP% means "Flag if Abs(%) < X" ? Unlikely.

            // Let's fallback to standard threshold checks below unless special rule type.
          }
        }

        // B. Standard Thresholds (Current Period)
        // Applicable if rule_type = 'threshold_current' OR variance_mode = 'NONE' (legacy)
        if (ruleType === 'threshold_current' || (ruleType === 'std' || varianceMode === 'NONE')) {
          if (thresholdAbs != null && Math.abs(current) > thresholdAbs) {
            shouldFlag = true
            reason = `${metric.toUpperCase()} Abs ${Math.abs(current).toLocaleString()} > ${thresholdAbs.toLocaleString()}`
          }
          if (thresholdPos != null && current > thresholdPos) {
            shouldFlag = true
            reason = `${metric.toUpperCase()} > ${thresholdPos.toLocaleString()}`
          }
          if (thresholdNeg != null && current < thresholdNeg) {
            shouldFlag = true
            reason = `${metric.toUpperCase()} < ${thresholdNeg.toLocaleString()}`
          }
        }

        // C. Variance Checks (MoM)
        if (ruleType === 'variance_abs' || varianceMode === 'ABS_DELTA') {
          const limit = varianceThreshold ?? thresholdAbs
          if (limit != null && deltaAbs != null) {
            if (baseline === 0) {
              // Zero baseline: only flag if current > threshold_abs
              if (thresholdAbs != null && Math.abs(current) > thresholdAbs) {
                shouldFlag = true
                reason = `New activity $${Math.abs(current).toLocaleString()} > $${thresholdAbs.toLocaleString()} (no prior baseline)`
              } else {
                skippedNoBaseline += 1
              }
            } else if (Math.abs(deltaAbs) > limit) {
              shouldFlag = true
              reason = `MoM Δ $${deltaAbs.toLocaleString()} > $${limit.toLocaleString()}`
            }
          }
        }
        if (ruleType === 'variance_pct' || varianceMode === 'PCT_DELTA') {
          const limit = varianceThreshold ?? thresholdAbs
          if (limit != null) {
            if (baseline === 0) {
              skippedNoBaseline += 1
              // Zero baseline: skip % check entirely
            } else if (deltaPct != null && Math.abs(deltaPct) > limit) {
              shouldFlag = true
              reason = `MoM Δ ${(deltaPct * 100).toFixed(1)}% > ${(limit * 100).toFixed(1)}%`
            }
          }
        }

        // D. Special Rule: Revenue < 0
        if (ruleType === 'revenue_items_less_than_zero' || (metric === 'revenue' && rule.name.includes('< 0'))) {
          if (current < 0) {
            shouldFlag = true
            reason = `Revenue is negative: ${current.toLocaleString()}`
          }
        }

        // E. Special Rule: COGS > Revenue
        if (ruleType === 'cogs_greater_than_revenue') {
          // current is whatever metric is selected. Need both.
          const rev = metricValue(row, 'revenue')
          const cogs = metricValue(row, 'cogs')
          // Logic: COGS > Revenue. (Assuming COGS is positive number in this context? 
          // In DB it might be negative signed. `cogsSigned`.
          // Usually Revenue is Positive (Credit), COGS is Negative (Debit).
          // If we compare magnitudes:
          if (Math.abs(cogs) > Math.abs(rev)) {
            shouldFlag = true
            reason = `COGS ($${Math.abs(cogs).toLocaleString()}) > Revenue ($${Math.abs(rev).toLocaleString()})`
          }
        }

        // F. Special Rule: GP % < Threshold
        if (ruleType === 'gp_percent_threshold') {
          const gpPct = metricValue(row, 'gp_percent')
          if (thresholdAbs != null && gpPct < thresholdAbs) {
            shouldFlag = true
            reason = `GP% ${(gpPct * 100).toFixed(1)}% < ${(thresholdAbs * 100).toFixed(1)}%`
          }
        }

        // G. GP < 0 (loss-making)
        if (ruleType === 'gp_negative') {
          const gp = metricValue(row, 'gross_profit')
          if (gp < 0) {
            shouldFlag = true
            reason = `Gross Profit is negative: $${gp.toLocaleString()}`
          }
        }

        // H. Revenue > 0 AND COGS = 0
        if (ruleType === 'revenue_no_cogs') {
          const rev = Math.abs(metricValue(row, 'revenue'))
          const cogs = Math.abs(metricValue(row, 'cogs'))
          if (rev > 0 && cogs === 0) {
            shouldFlag = true
            reason = `Revenue $${rev.toLocaleString()} with zero COGS — possible missing cost allocation`
          }
        }

        // I. COGS > 0 AND Revenue = 0
        if (ruleType === 'cogs_no_revenue') {
          const rev = Math.abs(metricValue(row, 'revenue'))
          const cogs = Math.abs(metricValue(row, 'cogs'))
          if (cogs > 0 && rev === 0) {
            shouldFlag = true
            reason = `COGS $${cogs.toLocaleString()} with zero Revenue — possible unrecognised revenue`
          }
        }

        // J. New / Reactivated Project
        if (ruleType === 'new_reactivated_project') {
          if (!priorByKey.has(row.customerKey) && (Math.abs(metricValue(row, 'revenue')) > 0 || Math.abs(metricValue(row, 'cogs')) > 0)) {
            shouldFlag = true
            reason = `New or reactivated — no activity in prior month`
          }
        }

        // K. Concentration check is handled post-loop (skip per-row)

      } // end standard checks

      if (!shouldFlag) continue

      const sev = String(rule.severity || 'medium')
      const riskScore = computeRiskScore(sev, deltaAbs, current)
      const title = `${rule.name}: ${row.customerName}`
      const details = reason || rule.description || 'Flagged by project rule'
      const key = `${rule.id}|${row.customerKey}|${metric}`
      const existing = existingMap.get(key)

      await upsertProjectException({
        existingId: existing?.id,
        orgId,
        snapshotId,
        ruleId: rule.id,
        severity: sev,
        title,
        details,
        customerKey: row.customerKey,
        customerName: row.customerName,
        metric,
        value: current,
        baseline,
        deltaAbs,
        deltaPctDecimal: deltaPct,
        riskScore,
        status: existing?.status || 'open',
        resolvedAt: existing?.resolved_at || null,
        resolvedReason: existing?.resolved_reason || null,
        ownerName: rule.owner_name || null,
        ownerUserId: rule.owner_user_id || null,
      })

      if (existing?.id) updated += 1
      else created += 1
    }

    // --- POST-LOOP: Concentration check ---
    if (ruleType === 'concentration' && currentPnl.rows.length > 0) {
      const totalRev = Math.abs(currentPnl.totals.totalRevenueSigned)
      if (totalRev > 0) {
        const sorted = [...currentPnl.rows].sort((a, b) => Math.abs(b.revenueSigned) - Math.abs(a.revenueSigned))
        const top3 = sorted.slice(0, 3)
        const top3Rev = top3.reduce((s, r) => s + Math.abs(r.revenueSigned), 0)
        const top3Pct = top3Rev / totalRev
        const limit = thresholdAbs ?? 0.6
        if (top3Pct > limit) {
          const sev = String(rule.severity || 'high')
          const riskScore = computeRiskScore(sev, null, top3Rev)
          const names = top3.map((r) => r.customerName).join(', ')
          const concentrationKey = `${rule.id}|__concentration__|${metric}`
          const existing = existingMap.get(concentrationKey)
          await upsertProjectException({
            existingId: existing?.id,
            orgId,
            snapshotId,
            ruleId: rule.id,
            severity: sev,
            title: `${rule.name}: ${(top3Pct * 100).toFixed(1)}%`,
            details: `Top 3 customers (${names}) represent ${(top3Pct * 100).toFixed(1)}% of revenue (> ${(limit * 100).toFixed(0)}% threshold)`,
            customerKey: '__concentration__',
            customerName: 'Top 3 Customers',
            metric,
            value: top3Pct,
            baseline: null,
            deltaAbs: null,
            deltaPctDecimal: null,
            riskScore,
            status: existing?.status || 'open',
            resolvedAt: existing?.resolved_at || null,
            resolvedReason: existing?.resolved_reason || null,
            ownerName: rule.owner_name || null,
            ownerUserId: rule.owner_user_id || null,
          })
          if (existing?.id) updated += 1
          else created += 1
        }
      }
    }
  }
  console.log('[PROJECT_CHECKS] skippedNoBaseline:', skippedNoBaseline)
  return {
    rulesEvaluated,
    customersCurrent,
    priorSnapshotFound: Boolean(priorSnapshotId && priorPnl),
    customersWithBaseline,
    skippedNoBaseline,
    exceptionsCreated: created,
    exceptionsUpdated: updated,
  }
}

/**
 * Evaluate rules against TB snapshot and generate exceptions
 */
export async function runChecksAction(orgId: string, snapshotId: string) {
  await ensureUser()
  await ensureOrgAccess(orgId)
  await ensureProjectSchema()

  const snapshot = await prisma.tbSnapshot.findUnique({
    where: { id: snapshotId },
    include: { tb_lines: true },
  })
  if (!snapshot || snapshot.org_id !== orgId) {
    return { error: 'Snapshot not found' }
  }

  const currentFrom = snapshot.range_from_date
  const currentTo = snapshot.range_to_date

  // Prior month range (UTC-safe)
  const { priorFrom, priorTo } = priorMonthRange(currentFrom, currentTo)

  const logPrior = {
    orgId,
    source: snapshot.source,
    priorFrom: priorFrom.toISOString(),
    priorTo: priorTo.toISOString(),
  }
  console.log('[RUN_CHECKS] priorRange', logPrior)

  const priorSnapshot = await prisma.tbSnapshot.findFirst({
    where: {
      org_id: orgId,
      range_from_date: priorFrom,
      range_to_date: priorTo,
      source: snapshot.source,
    },
    include: { tb_lines: true },
    orderBy: { imported_at: 'desc' },
  })
  let priorSnapshotForProject = priorSnapshot || await prisma.tbSnapshot.findFirst({
    where: {
      org_id: orgId,
      range_from_date: priorFrom,
      range_to_date: priorTo,
    },
    orderBy: { imported_at: 'desc' },
  })
  // Fuzzy ±7 day fallback for project prior snapshot (matches GL behaviour)
  if (!priorSnapshotForProject) {
    priorSnapshotForProject = await prisma.tbSnapshot.findFirst({
      where: {
        org_id: orgId,
        source: snapshot.source,
        range_from_date: {
          gte: new Date(priorFrom.getTime() - 7 * 24 * 3600 * 1000),
          lte: new Date(priorFrom.getTime() + 7 * 24 * 3600 * 1000),
        },
        range_to_date: {
          gte: new Date(priorTo.getTime() - 7 * 24 * 3600 * 1000),
          lte: new Date(priorTo.getTime() + 7 * 24 * 3600 * 1000),
        },
      },
      orderBy: { imported_at: 'desc' },
    })
  }
  if (!priorSnapshotForProject) {
    priorSnapshotForProject = await prisma.tbSnapshot.findFirst({
      where: {
        org_id: orgId,
        range_from_date: {
          gte: new Date(priorFrom.getTime() - 7 * 24 * 3600 * 1000),
          lte: new Date(priorFrom.getTime() + 7 * 24 * 3600 * 1000),
        },
        range_to_date: {
          gte: new Date(priorTo.getTime() - 7 * 24 * 3600 * 1000),
          lte: new Date(priorTo.getTime() + 7 * 24 * 3600 * 1000),
        },
      },
      orderBy: { imported_at: 'desc' },
    })
  }

  if (!priorSnapshot) {
    const candidates = await prisma.tbSnapshot.findMany({
      where: {
        org_id: orgId,
        source: snapshot.source,
        range_from_date: {
          gte: new Date(priorFrom.getTime() - 7 * 24 * 3600 * 1000),
          lte: new Date(priorFrom.getTime() + 7 * 24 * 3600 * 1000),
        },
        range_to_date: {
          gte: new Date(priorTo.getTime() - 7 * 24 * 3600 * 1000),
          lte: new Date(priorTo.getTime() + 7 * 24 * 3600 * 1000),
        },
      },
      orderBy: { imported_at: 'desc' },
      take: 5,
      select: { id: true, range_from_date: true, range_to_date: true, source: true, imported_at: true },
    })
    console.log('[RUN_CHECKS] prior candidates (±7d)', candidates)
  }

  const priorLines = priorSnapshot?.tb_lines ?? []
  const priorByAcctNum: Record<string, any> = {}
  const priorByName: Record<string, any> = {}
  for (const line of priorLines) {
    if (line.account_number) priorByAcctNum[line.account_number] = line
    if (line.account_name) priorByName[normalizeName(line.account_name)] = line
  }

  const rules = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT *
    FROM med2.rules
    WHERE org_id = ${orgId}::uuid
      AND enabled = true
      AND COALESCE(domain, 'GL') = 'GL'
  `)

  // Existing exceptions map to preserve status/resolution
  const existing = await prisma.exception.findMany({
    where: { snapshot_id: snapshotId },
    select: {
      id: true,
      rule_id: true,
      account_number: true,
      account_name: true,
      status: true,
      resolved_at: true,
      resolved_reason: true,
    },
  })
  const existingMap = new Map<string, typeof existing[number]>()
  const makeKey = (ruleId: string, line: any) =>
    `${ruleId}|${line.account_number ?? ''}|${normalizeName(line.account_name)}`
  for (const ex of existing) {
    const key = `${ex.rule_id}|${ex.account_number ?? ''}|${normalizeName(ex.account_name)}`
    existingMap.set(key, ex)
  }

  const toCreate: any[] = []
  const toUpdate: { id: string; data: any }[] = []
  const momDebug: any[] = []

  // Track which accounts have already been flagged (for deduplication)
  // Key: normalized account identifier, Value: severity of the rule that flagged it
  const seenAccounts = new Map<string, string>()

  // Severity priority for deduplication: critical > high > medium > low
  const severityPriority: Record<string, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  }

  // Sort rules by severity (highest first) so we process more important rules first
  const sortedRules = [...rules].sort((a, b) => {
    const aPriority = severityPriority[a.severity || 'medium'] || 2
    const bPriority = severityPriority[b.severity || 'medium'] || 2
    return bPriority - aPriority
  })

  for (const rule of sortedRules) {
    // Skip schedule_variance rules - they use a specialized evaluator
    // that only checks accounts with amortization schedules
    if (rule.rule_type === 'schedule_variance') {
      continue
    }

    const scope: Scope = (rule.scope as Scope) || 'ALL'
    const varianceMode: VarianceMode = (rule.variance_mode as VarianceMode) || 'NONE'
    const varianceThreshold = rule.variance_threshold != null ? toNumber(rule.variance_threshold) : null

    const matchedLines = snapshot.tb_lines.filter((line) => matchesRuleAccount(rule, line))

    let createdForRule = 0
    for (const line of matchedLines) {
      const balance = toNumber(line.balance)
      // Calculate period activity (net change) instead of just ending balance
      const debit = toNumber((line as any).debit)
      const credit = toNumber((line as any).credit)
      const activity = debit - credit // Net activity for the period
      let shouldFlag = false
      let reason = ''

      // Threshold checks
      if (rule.threshold_abs != null && Math.abs(balance) > toNumber(rule.threshold_abs)) {
        shouldFlag = true
        reason = `Abs ${Math.abs(balance).toLocaleString()} > ${toNumber(rule.threshold_abs).toLocaleString()}`
      }
      if (rule.threshold_pos != null && balance > toNumber(rule.threshold_pos)) {
        shouldFlag = true
        reason = `Pos ${balance.toLocaleString()} > ${toNumber(rule.threshold_pos).toLocaleString()}`
      }
      if (rule.threshold_neg != null && balance < toNumber(rule.threshold_neg)) {
        shouldFlag = true
        reason = `Neg ${balance.toLocaleString()} < ${toNumber(rule.threshold_neg).toLocaleString()}`
      }

      // Variance checks (MoM)
      if (varianceMode !== 'NONE' && varianceThreshold != null) {
        const priorLine =
          (line.account_number && priorByAcctNum[line.account_number]) ||
          priorByName[normalizeName(line.account_name)] ||
          null
        const priorBalance = priorLine ? toNumber(priorLine.balance) : 0
        const delta = balance - priorBalance
        const pct = priorBalance === 0 ? null : delta / Math.abs(priorBalance)

        if (varianceMode === 'ABS_DELTA' && Math.abs(delta) > varianceThreshold) {
          shouldFlag = true
          reason = `Δ ${delta.toLocaleString()} > ${varianceThreshold.toLocaleString()}`
        }
        if (varianceMode === 'PCT_DELTA' && pct !== null && Math.abs(pct) > varianceThreshold) {
          shouldFlag = true
          reason = `%Δ ${(pct * 100).toFixed(2)}% > ${(varianceThreshold * 100).toFixed(2)}%`
        }

        if (process.env.DEBUG_MOM === '1') {
          const focus = process.env.DEBUG_MOM_ACCOUNT
          const name = normalizeName(line.account_name)
          const shouldLog = !focus || (focus && name.includes(normalizeName(focus)))
          if (shouldLog) {
            momDebug.push({
              rule: { id: rule.id, name: rule.name, mode: varianceMode, threshold: varianceThreshold },
              acct: {
                account_number: line.account_number,
                account_name: line.account_name,
              },
              bal: { current: balance, prior: priorBalance, delta, pctDelta: pct },
              shouldFlag,
            })
          }
        }
      }

      // Calculate variance values for storage - always calculate for variance rules
      let targetValue: number | null = null
      let varianceAmount: number | null = null
      let variancePct: number | null = null

      // For variance rules (MoM), calculate prior period activity as target
      if (varianceMode !== 'NONE') {
        const priorLine =
          (line.account_number && priorByAcctNum[line.account_number]) ||
          priorByName[normalizeName(line.account_name)] ||
          null
        // Use debit - credit for prior period activity
        const priorDebit = priorLine ? toNumber(priorLine.debit) : 0
        const priorCredit = priorLine ? toNumber(priorLine.credit) : 0
        const priorActivity = priorDebit - priorCredit
        targetValue = priorActivity
        varianceAmount = activity - priorActivity
        variancePct = priorActivity !== 0 ? (varianceAmount / Math.abs(priorActivity)) * 100 : null
      }

      if (!shouldFlag) continue

      // Deduplication: skip if this account was already flagged by a higher severity rule
      const accountKey = `${line.account_number ?? ''}|${normalizeName(line.account_name)}`
      if (seenAccounts.has(accountKey)) {
        continue // Account already has an exception from a higher-priority rule
      }
      // Mark this account as seen
      seenAccounts.set(accountKey, rule.severity)

      const title = `${rule.name}: ${line.account_name ?? 'Account'}`
      const details = reason || rule.description || 'Flagged by rule'

      const key = makeKey(rule.id, line)
      const existingEx = existingMap.get(key)
      const baseData = {
        org_id: orgId,
        snapshot_id: snapshotId,
        rule_id: rule.id,
        severity: rule.severity,
        title,
        details,
        account_name: line.account_name,
        account_number: line.account_number ?? null,
        balance: activity, // Show period activity instead of ending balance
        target_value: targetValue,
        variance_amount: varianceAmount,
        variance_pct: variancePct,
        owner_name: rule.owner_name || null,
        owner_user_id: rule.owner_user_id || null,
      }

      if (existingEx) {
        toUpdate.push({
          id: existingEx.id,
          data: {
            ...baseData,
            status: existingEx.status, // preserve status
            resolved_at: existingEx.resolved_at,
            resolved_reason: existingEx.resolved_reason,
          },
        })
      } else {
        toCreate.push({
          ...baseData,
          status: 'open',
        })
        createdForRule += 1
      }
    }

    console.log('[RUN_CHECKS][RULE]', {
      rule: { id: rule.id, name: rule.name },
      matched: matchedLines.length,
      created: createdForRule,
    })
  }

  if (toUpdate.length) {
    await Promise.all(
      toUpdate.map((u) =>
        prisma.exception.update({
          where: { id: u.id },
          data: u.data,
        })
      )
    )
  }

  // Handle schedule_variance rules separately - only for accounts with amortization schedules
  const scheduleVarianceRules = rules.filter((r) => r.rule_type === 'schedule_variance')
  if (scheduleVarianceRules.length > 0) {
    // Delete ALL existing exceptions for schedule_variance rules (they may be stale)
    const scheduleVarianceRuleIds = scheduleVarianceRules.map((r) => r.id)
    await prisma.exception.deleteMany({
      where: {
        snapshot_id: snapshotId,
        rule_id: { in: scheduleVarianceRuleIds },
      },
    })

    const periodFrom = snapshot.range_from_date
    const periodTo = snapshot.range_to_date

    // Fetch schedules with amortization for this period
    const schedules = await prisma.schedule.findMany({
      where: {
        orgId: orgId,
        periodStart: { lte: periodTo },
        periodEnd: { gte: periodFrom },
        deletedAt: null,
        // Only schedules with amortization configured
        OR: [
          { amortAutoGenerated: true },
          { amortMethod: 'STRAIGHT_LINE' },
        ],
      },
      include: {
        lines: {
          where: {
            isAutoGenerated: true,
            generatedSource: 'AMORTIZATION',
            lineDate: { gte: periodFrom, lte: periodTo },
          },
        },
      },
    })

    for (const rule of scheduleVarianceRules) {
      const tolerance = toNumber(rule.threshold_abs) || 1.0
      const accountMatch = rule.account_match ? normalizeName(rule.account_match) : null

      for (const schedule of schedules) {
        // Optional account filter
        if (accountMatch && !normalizeName(schedule.glAccountName).includes(accountMatch)) {
          continue
        }

        // Calculate expected amortization from lines or monthly amount
        const expectedFromLines = schedule.lines.reduce((sum, line) => sum + Math.abs(toNumber(line.amount)), 0)
        const expectedAmount = expectedFromLines > 0 ? expectedFromLines : Math.abs(toNumber(schedule.amortMonthlyAmount))

        if (expectedAmount === 0) continue

        // Actual = period TB activity (debit - credit) for the schedule account
        const matchLine =
          snapshot.tb_lines.find((l) => (l.account_number || '') === (schedule.glAccountId || '')) ||
          snapshot.tb_lines.find((l) => normalizeName(l.account_name) === normalizeName(schedule.glAccountName || '')) ||
          null
        const netActivity = matchLine
          ? toNumber(matchLine.debit) - toNumber(matchLine.credit)
          : 0
        const actualAmount = Math.abs(netActivity)
        const variance = Math.abs(expectedAmount - actualAmount)

        if (variance > tolerance) {
          const title = `${rule.name}: ${schedule.glAccountName ?? schedule.name}`
          const details = `Expected: $${expectedAmount.toFixed(2)}, Actual: $${actualAmount.toFixed(2)}, Variance: $${variance.toFixed(2)} > $${tolerance.toFixed(2)}`

          // Calculate variance percent
          const variancePct = expectedAmount !== 0
            ? ((netActivity - expectedAmount) / Math.abs(expectedAmount)) * 100
            : null

          const key = `${rule.id}|${schedule.glAccountId ?? ''}|${normalizeName(schedule.glAccountName)}`
          const baseData = {
            org_id: orgId,
            snapshot_id: snapshotId,
            rule_id: rule.id,
            severity: rule.severity,
            title,
            details,
            account_name: schedule.glAccountName,
            account_number: schedule.glAccountId ?? null,
            balance: netActivity, // Actual activity for the period
            target_value: expectedAmount, // Expected from schedule
            variance_amount: netActivity - expectedAmount, // Dollar variance
            variance_pct: variancePct, // Percent variance
            owner_name: rule.owner_name || null,
            owner_user_id: rule.owner_user_id || null,
          }

          // Schedule variance exceptions were deleted above, so always create new ones
          toCreate.push({
            ...baseData,
            status: 'open',
          })
        }
      }

      console.log('[RUN_CHECKS][SCHEDULE_VARIANCE]', {
        rule: { id: rule.id, name: rule.name },
        schedulesChecked: schedules.length,
      })
    }
  }

  if (toCreate.length) {
    await prisma.exception.createMany({
      data: toCreate,
      skipDuplicates: true,
    })
  }

  const projectResult = await runProjectChecks({
    orgId,
    snapshotId,
    currentFrom,
    currentTo,
    source: snapshot.source,
    priorSnapshotId: priorSnapshotForProject?.id ?? null,
    priorFrom,
    priorTo,
  })

  revalidatePath('/close')
  revalidatePath('/projects')

  return {
    success: true,
    created: toCreate.length + projectResult.exceptionsCreated,
    updated: toUpdate.length + projectResult.exceptionsUpdated,
    momDebug: process.env.DEBUG_MOM === '1' ? momDebug.slice(0, 50) : undefined,
  }
}

export async function runProjectChecksOnlyAction(orgId: string, snapshotId: string) {
  await ensureUser()
  await ensureOrgAccess(orgId)
  await ensureProjectSchema()

  const snapshot = await prisma.tbSnapshot.findUnique({ where: { id: snapshotId } })
  if (!snapshot || snapshot.org_id !== orgId) return { error: 'Snapshot not found' }

  const { priorFrom, priorTo } = priorMonthRange(snapshot.range_from_date, snapshot.range_to_date)
  let priorSnapshot = await prisma.tbSnapshot.findFirst({
    where: {
      org_id: orgId,
      range_from_date: priorFrom,
      range_to_date: priorTo,
      source: snapshot.source,
    },
    orderBy: { imported_at: 'desc' },
  })
  if (!priorSnapshot) {
    priorSnapshot = await prisma.tbSnapshot.findFirst({
      where: {
        org_id: orgId,
        range_from_date: priorFrom,
        range_to_date: priorTo,
      },
      orderBy: { imported_at: 'desc' },
    })
  }
  // Fuzzy ±7 day fallback (matches GL behaviour)
  if (!priorSnapshot) {
    priorSnapshot = await prisma.tbSnapshot.findFirst({
      where: {
        org_id: orgId,
        source: snapshot.source,
        range_from_date: {
          gte: new Date(priorFrom.getTime() - 7 * 24 * 3600 * 1000),
          lte: new Date(priorFrom.getTime() + 7 * 24 * 3600 * 1000),
        },
        range_to_date: {
          gte: new Date(priorTo.getTime() - 7 * 24 * 3600 * 1000),
          lte: new Date(priorTo.getTime() + 7 * 24 * 3600 * 1000),
        },
      },
      orderBy: { imported_at: 'desc' },
    })
  }
  if (!priorSnapshot) {
    priorSnapshot = await prisma.tbSnapshot.findFirst({
      where: {
        org_id: orgId,
        range_from_date: {
          gte: new Date(priorFrom.getTime() - 7 * 24 * 3600 * 1000),
          lte: new Date(priorFrom.getTime() + 7 * 24 * 3600 * 1000),
        },
        range_to_date: {
          gte: new Date(priorTo.getTime() - 7 * 24 * 3600 * 1000),
          lte: new Date(priorTo.getTime() + 7 * 24 * 3600 * 1000),
        },
      },
      orderBy: { imported_at: 'desc' },
    })
  }

  const stats = await runProjectChecks({
    orgId,
    snapshotId,
    currentFrom: snapshot.range_from_date,
    currentTo: snapshot.range_to_date,
    source: snapshot.source,
    priorSnapshotId: priorSnapshot?.id ?? null,
    priorFrom,
    priorTo,
  })

  revalidatePath('/projects')
  revalidatePath('/close')
  return { success: true, ...stats }
}

/**
 * Update exception status
 */
export async function updateExceptionStatusAction(
  exceptionId: string,
  orgId: string,
  status: 'open' | 'awaiting_explanation' | 'resolved' | 'dismissed'
) {
  await ensureUser()
  await ensureOrgAccess(orgId)

  await prisma.exception.update({
    where: { id: exceptionId },
    data: { status },
  })

  revalidatePath('/close')
  return { success: true }
}
