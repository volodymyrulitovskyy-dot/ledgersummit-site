import { NextRequest, NextResponse } from 'next/server'
import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { qboFetchForOrg } from '@/lib/qbo/qboFetchForOrg'

/**
 * GET /api/qbo/query
 * 
 * Executes a QBO query (SELECT statement)
 * 
 * Query params:
 * - orgId: Organization ID
 * - query: QBO query string (e.g., "SELECT Id, Name FROM Account MAXRESULTS 1000")
 */
export async function GET(request: NextRequest) {
  try {
    await ensureUserApi()

    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')
    const query = searchParams.get('query')

    if (!orgId || !query) {
      return NextResponse.json(
        { error: 'Missing required query params: orgId, query' },
        { status: 400 }
      )
    }

    await ensureOrgAccessApi(orgId)

    const result = await qboFetchForOrg(orgId, '/query', {
      query,
      minorversion: '65',
    })

    return NextResponse.json({
      ok: true,
      data: result,
    })
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (err.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json(
      { error: err.message || 'Failed to execute QBO query' },
      { status: 500 }
    )
  }
}

