import { NextRequest, NextResponse } from 'next/server'
import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { qboFetchForOrg } from '@/lib/qbo/qboFetchForOrg'

/**
 * GET /api/qbo/debug/general-ledger
 * 
 * Dead-simple debug endpoint to isolate QBO GeneralLedger call from parsing/UI
 * 
 * Query params:
 * - orgId: Organization ID
 * - from: Start date (YYYY-MM-DD)
 * - to: End date (YYYY-MM-DD)
 * - accountId: Optional account filter
 * 
 * Response:
 * - On success: { status: 200, keys: string[], firstSectionHeader: string }
 * - On error: { status: number, body: string }
 */
export async function GET(request: NextRequest) {
  try {
    await ensureUserApi()

    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const accountId = searchParams.get('accountId')

    if (!orgId || !from || !to) {
      return NextResponse.json(
        { error: 'Missing required query params: orgId, from, to' },
        { status: 400 }
      )
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD for both from and to' },
        { status: 400 }
      )
    }

    // Verify org access
    await ensureOrgAccessApi(orgId)

    // Build queryParams
    const queryParams: any = {
      start_date: from,
      end_date: to,
      minorversion: '65',
    }
    
    // Only add account if provided
    if (accountId) {
      queryParams.account = accountId
    }

    console.log("[DEBUG GL] calling QBO", { path: '/reports/GeneralLedger', queryParams });

    // Call QBO GeneralLedger
    const glData = await qboFetchForOrg(orgId, '/reports/GeneralLedger', queryParams)

    // Extract keys and first section header
    const keys = Object.keys(glData || {})
    const topRows = glData?.Rows?.Row || []
    const topRowsArray = Array.isArray(topRows) ? topRows : [topRows].filter(Boolean)
    const firstSectionHeader = topRowsArray[0]?.Header?.ColData?.[0]?.value || null

    return NextResponse.json({
      status: 200,
      keys,
      firstSectionHeader,
    })
  } catch (err: any) {
    console.error("[DEBUG GL] error", err);
    
    // Try to extract status and body from error
    const status = err?.response?.status || err?.status || 500
    const body = err?.message || String(err)
    
    return NextResponse.json({
      status,
      body,
    }, { status: 500 })
  }
}

