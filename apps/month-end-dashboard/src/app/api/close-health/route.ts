import { NextRequest, NextResponse } from 'next/server'
import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { prisma } from '@/lib/db/prisma'

/**
 * GET /api/close-health - Get close health score for org + period
 * 
 * Computes:
 * - % accounts reviewed
 * - Critical exceptions open
 * - Late entries
 * - % explanations accepted
 * - Days since close
 */
export async function GET(request: NextRequest) {
  try {
    await ensureUserApi()

    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')
    const period = searchParams.get('period') // YYYY-MM-DD (end date of period)

    if (!orgId || !period) {
      return NextResponse.json(
        { error: 'Missing required parameters: orgId, period' },
        { status: 400 }
      )
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // Verify org access
    await ensureOrgAccessApi(orgId)

    const periodDate = new Date(period + 'T00:00:00Z')
    const year = periodDate.getFullYear()
    const month = periodDate.getMonth() + 1

    // Find period record
    const periodRecord = await prisma.period.findFirst({
      where: {
        org_id: orgId,
        year,
        month,
      },
    })

    // Get latest TB snapshot for this period
    const snapshot = await prisma.tbSnapshot.findFirst({
      where: {
        org_id: orgId,
        range_to_date: {
          lte: periodDate,
          gte: new Date(year, month - 1, 1), // First day of month
        },
      },
      orderBy: {
        imported_at: 'desc',
      },
    })

    if (!snapshot) {
      return NextResponse.json({
        ok: true,
        orgId,
        period,
        health: {
          accountsReviewedPercent: 0,
          criticalExceptionsOpen: 0,
          lateEntries: 0,
          explanationsAcceptedPercent: 0,
          daysSinceClose: null,
          score: 0,
        },
      })
    }

    // Get TB lines
    const tbLines = await prisma.tbLine.findMany({
      where: {
        snapshot_id: snapshot.id,
      },
    })

    const totalAccounts = tbLines.length

    // Get explanations for this period
    const explanations = await prisma.explanation.findMany({
      where: {
        org_id: orgId,
        period: periodDate,
      },
    })

    // Accounts with explanations (reviewed)
    const reviewedAccountIds = new Set(
      explanations.map((e) => e.account_id).filter(Boolean)
    )
    const accountsReviewed = reviewedAccountIds.size
    const accountsReviewedPercent =
      totalAccounts > 0 ? (accountsReviewed / totalAccounts) * 100 : 0

    // Get critical exceptions
    const criticalExceptions = await prisma.exception.findMany({
      where: {
        org_id: orgId,
        snapshot_id: snapshot.id,
        severity: 'critical',
        status: 'open',
      },
    })
    const criticalExceptionsOpen = criticalExceptions.length

    // Get late entries (entries posted after close date)
    // This would require GL detail data - for now, return 0
    // TODO: Query GL details for entries after period end date
    const lateEntries = 0

    // Get accepted explanations
    const acceptedExplanations = explanations.filter(
      (e) => e.status === 'accepted'
    )
    const explanationsAcceptedPercent =
      explanations.length > 0
        ? (acceptedExplanations.length / explanations.length) * 100
        : 0

    // Calculate days since close
    // If period status is 'closed' or 'locked', use that date
    // Otherwise, use period end date
    let daysSinceClose: number | null = null
    if (periodRecord && (periodRecord.status === 'closed' || periodRecord.status === 'locked')) {
      // Period is closed - calculate days since period end
      const closeDate = periodDate
      const now = new Date()
      const diffTime = now.getTime() - closeDate.getTime()
      daysSinceClose = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    }

    // Calculate overall health score (0-100)
    // Weighted average of:
    // - Accounts reviewed: 30%
    // - Critical exceptions: 30% (inverse - fewer is better)
    // - Explanations accepted: 20%
    // - Late entries: 20% (inverse - fewer is better)
    let score = 0
    score += accountsReviewedPercent * 0.3
    score += Math.max(0, 100 - criticalExceptionsOpen * 10) * 0.3 // -10 points per critical exception
    score += explanationsAcceptedPercent * 0.2
    score += Math.max(0, 100 - lateEntries * 5) * 0.2 // -5 points per late entry
    score = Math.max(0, Math.min(100, score)) // Clamp to 0-100

    return NextResponse.json({
      ok: true,
      orgId,
      period,
      health: {
        accountsReviewedPercent: Math.round(accountsReviewedPercent * 100) / 100,
        accountsReviewed,
        totalAccounts,
        criticalExceptionsOpen,
        lateEntries,
        explanationsAcceptedPercent: Math.round(explanationsAcceptedPercent * 100) / 100,
        explanationsTotal: explanations.length,
        explanationsAccepted: acceptedExplanations.length,
        daysSinceClose,
        score: Math.round(score * 100) / 100,
      },
    })
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (err.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json(
      { error: err.message || 'Failed to compute close health' },
      { status: 500 }
    )
  }
}

