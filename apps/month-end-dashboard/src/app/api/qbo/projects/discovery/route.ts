import { NextRequest, NextResponse } from 'next/server'
import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { discoverProjectData } from '@/lib/qbo/projectDiscovery'

export async function GET(request: NextRequest) {
  try {
    await ensureUserApi()

    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')
    const fromDate = searchParams.get('fromDate')
    const toDate = searchParams.get('toDate')

    if (!orgId || !fromDate || !toDate) {
      return NextResponse.json(
        { error: 'Missing required query params: orgId, fromDate, toDate' },
        { status: 400 }
      )
    }

    await ensureOrgAccessApi(orgId)

    const projectDiscovery = await discoverProjectData(orgId, fromDate, toDate)

    return NextResponse.json({
      ok: true,
      orgId,
      fromDate,
      toDate,
      ...projectDiscovery,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to discover project-related QBO data'
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json(
      { error: message || 'Failed to discover project-related QBO data' },
      { status: 500 }
    )
  }
}
