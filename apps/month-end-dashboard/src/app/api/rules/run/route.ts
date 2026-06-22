import { NextRequest, NextResponse } from 'next/server'
import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { runRulesForPeriod } from '@/lib/rules/runRulesForPeriod'

/**
 * POST /api/rules/run - Run rules for a period and store results
 */
export async function POST(request: NextRequest) {
  try {
    await ensureUserApi()

    const body = await request.json()
    const { orgId, period, snapshotId } = body

    if (!orgId || !period || !snapshotId) {
      return NextResponse.json(
        { error: 'Missing required fields: orgId, period, snapshotId' },
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

    // Run rules
    const result = await runRulesForPeriod(orgId, period, snapshotId)

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (err.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json(
      { error: err.message || 'Failed to run rules' },
      { status: 500 }
    )
  }
}

