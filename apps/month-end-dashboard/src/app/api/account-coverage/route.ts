import { NextRequest, NextResponse } from 'next/server'
import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { prisma } from '@/lib/db/prisma'

/**
 * GET /api/account-coverage - Get account coverage tracking for org + period
 * 
 * Returns:
 * - Accounts with rules
 * - Accounts without rules
 * - Accounts not reviewed
 * - Coverage heatmap data
 */
export async function GET(request: NextRequest) {
  try {
    await ensureUserApi()

    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')
    const period = searchParams.get('period') // YYYY-MM-DD

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

    // Get latest TB snapshot for this period
    const snapshot = await prisma.tbSnapshot.findFirst({
      where: {
        org_id: orgId,
        range_to_date: {
          lte: periodDate,
          gte: new Date(periodDate.getFullYear(), periodDate.getMonth(), 1),
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
        coverage: {
          accountsWithRules: [],
          accountsWithoutRules: [],
          accountsNotReviewed: [],
          heatmap: [],
        },
      })
    }

    // Get all TB lines
    const tbLines = await prisma.tbLine.findMany({
      where: {
        snapshot_id: snapshot.id,
      },
    })

    // Get all enabled rules
    const rules = await prisma.rule.findMany({
      where: {
        org_id: orgId,
        enabled: true,
      },
    })

    // Build account match sets from rules
    const accountsWithRulesSet = new Set<string>()
    for (const rule of rules) {
      if (rule.account_match) {
        for (const line of tbLines) {
          if (line.account_name.toLowerCase().includes(rule.account_match.toLowerCase())) {
            accountsWithRulesSet.add(line.account_name)
          }
        }
      }
    }

    // Get explanations for this period
    const explanations = await prisma.explanation.findMany({
      where: {
        org_id: orgId,
        period: periodDate,
      },
    })

    const reviewedAccountIds = new Set(
      explanations.map((e) => e.account_id).filter(Boolean)
    )
    const reviewedAccountNames = new Set(
      explanations.map((e) => {
        // Find account name from TB lines if we have account_id
        const explanation = explanations.find((exp) => exp.account_id)
        if (explanation) {
          const line = tbLines.find((l) => l.account_number === explanation.account_id)
          return line?.account_name
        }
        return null
      }).filter(Boolean)
    )

    // Categorize accounts
    const accountsWithRules: Array<{
      accountId?: string
      accountName: string
      status: 'green' | 'yellow' | 'red'
      hasExplanation: boolean
      hasRules: boolean
    }> = []

    const accountsWithoutRules: Array<{
      accountId?: string
      accountName: string
      status: 'green' | 'yellow' | 'red'
    }> = []

    const accountsNotReviewed: Array<{
      accountId?: string
      accountName: string
      hasRules: boolean
    }> = []

    for (const line of tbLines) {
      const accountName = line.account_name
      const accountId = line.account_number || undefined
      const hasRules = accountsWithRulesSet.has(accountName)
      const hasExplanation = reviewedAccountNames.has(accountName) || 
        (accountId && reviewedAccountIds.has(accountId))

      if (hasRules) {
        // Determine status: green (explained), yellow (has rules but not explained), red (has rules, exceptions)
        let status: 'green' | 'yellow' | 'red' = 'yellow'
        if (hasExplanation) {
          status = 'green'
        } else {
          // Check for exceptions
          const hasExceptions = await prisma.exception.findFirst({
            where: {
              org_id: orgId,
              snapshot_id: snapshot.id,
              account_name: accountName,
            },
          })
          if (hasExceptions) {
            status = 'red'
          }
        }

        accountsWithRules.push({
          accountId,
          accountName,
          status,
          hasExplanation,
          hasRules: true,
        })
      } else {
        accountsWithoutRules.push({
          accountId,
          accountName,
          status: hasExplanation ? 'green' : 'yellow',
        })
      }

      if (!hasExplanation) {
        accountsNotReviewed.push({
          accountId,
          accountName,
          hasRules,
        })
      }
    }

    // Build heatmap data (simplified - could be enhanced with more granular data)
    const heatmap = tbLines.map((line) => {
      const accountName = line.account_name
      const accountId = line.account_number || undefined
      const hasRules = accountsWithRulesSet.has(accountName)
      const hasExplanation = reviewedAccountNames.has(accountName) || 
        (accountId && reviewedAccountIds.has(accountId))

      let status: 'green' | 'yellow' | 'red' = 'yellow'
      if (hasRules && hasExplanation) {
        status = 'green'
      } else if (hasRules && !hasExplanation) {
        status = 'red'
      } else {
        status = 'yellow'
      }

      return {
        accountId,
        accountName,
        status,
        hasRules,
        hasExplanation,
        balance: Number(line.balance),
      }
    })

    return NextResponse.json({
      ok: true,
      orgId,
      period,
      coverage: {
        accountsWithRules,
        accountsWithoutRules,
        accountsNotReviewed,
        heatmap,
        summary: {
          totalAccounts: tbLines.length,
          accountsWithRules: accountsWithRules.length,
          accountsWithoutRules: accountsWithoutRules.length,
          accountsNotReviewed: accountsNotReviewed.length,
          accountsReviewed: reviewedAccountNames.size + reviewedAccountIds.size,
        },
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
      { error: err.message || 'Failed to compute account coverage' },
      { status: 500 }
    )
  }
}

