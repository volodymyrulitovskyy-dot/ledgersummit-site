import { NextRequest, NextResponse } from 'next/server'
import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { prisma } from '@/lib/db/prisma'
import { isoToUTCDateOnly } from '@/lib/dates/dateOnly'
import { getQboClient } from '@/lib/qbo/client'
import { discoverProjectData, type DiscoveryResponse } from '@/lib/qbo/projectDiscovery'
import { buildAndStoreProjectPnlSnapshot } from '@/lib/projects/projectPnlSnapshot'
import { ensureProjectSchema } from '@/lib/projects/schema'
type TbCol = { value?: string }
type TbRow = {
  ColData?: TbCol[]
  Rows?: { Row?: TbRow[] }
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Probe failed'
}

export async function POST(request: NextRequest) {
  try {
    await ensureProjectSchema()
    console.log('[QBO TB] step 1: handler entered')

    let user
    try {
      user = await ensureUserApi()
      console.log('[QBO TB] step 1.1: user authenticated')
    } catch (err: unknown) {
      if (getErrorMessage(err) === 'UNAUTHORIZED') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      throw err
    }

    const body = (await request.json()) as { orgId?: string; fromDate?: string; toDate?: string }
    console.log('[QBO TB] step 2: parsed body', { bodyKeys: Object.keys(body || {}) })
    const { orgId, fromDate, toDate } = body

    if (!orgId || !fromDate || !toDate) {
      return NextResponse.json(
        { error: 'Missing required fields: orgId, fromDate, toDate' },
        { status: 400 }
      )
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // Verify org access
    try {
      await ensureOrgAccessApi(orgId)
      console.log('[QBO TB] step 2.1: org access verified')
    } catch (err: unknown) {
      const message = getErrorMessage(err)
      if (message === 'UNAUTHORIZED') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      if (message === 'FORBIDDEN') {
        return NextResponse.json({ error: 'Forbidden - no access to this organization' }, { status: 403 })
      }
      throw err
    }

    console.log('[QBO TB Refresh] Starting refresh:', {
      orgId: orgId.substring(0, 8) + '...',
      fromDate,
      toDate,
    })

    // Get valid access token and connection info
    console.log('[QBO TB] step 3: getting QBO tokens')
    const client = await getQboClient(orgId)
    console.log('[QBO TB] step 3: got QBO tokens', {
      hasAccessToken: !!client.access_token,
      realmId: client.realm_id,
      baseUrl: client.baseUrl,
    })

    // Fetch Trial Balance from QBO
    const url = `${client.baseUrl}/v3/company/${client.realm_id}/reports/TrialBalance?start_date=${fromDate}&end_date=${toDate}&minorversion=65`

    console.log('[QBO TB Refresh] Fetching from QBO:', {
      url: url.replace(client.realm_id, '***'),
      realmId: client.realm_id,
    })

    console.log('[QBO TB] step 4: fetching TrialBalance')
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${client.access_token}`,
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[QBO TB Refresh] QBO API error:', {
        status: response.status,
        error: errorText,
      })
      return NextResponse.json(
        { error: `QBO API error: ${response.status} ${errorText}` },
        { status: response.status }
      )
    }

    const qboData = await response.json()
    console.log('[QBO TB] step 4: fetched TrialBalance', {
      hasRows: !!qboData.Rows,
      rowCount: qboData.Rows?.Row?.length || 0,
    })

    // Log raw QBO structure
    console.log('[QBO TB] Rows keys:', Object.keys(qboData?.Rows || {}))
    console.log('[QBO TB] First row:', JSON.stringify(qboData?.Rows?.Row?.[0], null, 2))

    // Recursive row extractor
    function extractRows(rows: TbRow[], out: TbRow[] = []): TbRow[] {
      for (const row of rows ?? []) {
        if (row.ColData && row.ColData.length) {
          out.push(row)
        }
        if (row.Rows?.Row) {
          extractRows(row.Rows.Row, out)
        }
      }
      return out
    }

    // Parse into normalized lines
    console.log('[QBO TB] step 5: parsing rows')
    const rawRows = (qboData?.Rows?.Row ?? []) as TbRow[]
    const accountRows = extractRows(rawRows)
    console.log('[QBO TB] extracted rows:', accountRows.length)

    if (accountRows.length === 0) {
      console.error('[QBO TB Refresh] TB parsing failed. Raw rows:', {
        hasRows: !!qboData.Rows,
        topLevelRowCount: rawRows.length,
        sampleRow: rawRows[0],
        fullResponse: JSON.stringify(qboData, null, 2).substring(0, 1000),
      })
      return NextResponse.json(
        { error: 'TB parsing failed - no account lines extracted' },
        { status: 500 }
      )
    }

    // Map ColData correctly: Typical TB column order is [name, debit, credit]
    const lines = accountRows.map((row: TbRow) => {
      const colData = row.ColData || []
      if (colData.length < 3) {
        return null // Skip rows without enough columns
      }

      // Typical format: [name, debit, credit]
      const [name, debitCol, creditCol] = colData

      const accountName = name?.value?.trim()
      if (!accountName) {
        return null
      }

      const debit = Number(debitCol?.value?.replace(/,/g, '') || 0)
      const credit = Number(creditCol?.value?.replace(/,/g, '') || 0)
      const net = debit - credit

      return {
        account_name: accountName,
        account_number: undefined, // Not in typical format
        account_type: undefined,
        debit: debit !== 0 ? debit : undefined,
        credit: credit !== 0 ? credit : undefined,
        balance: net, // Use net (debit - credit) as balance
      }
    }).filter((line): line is NonNullable<typeof line> => line !== null)

    console.log('[QBO TB] step 5: parsed rows', { lineCount: lines.length })

    console.log('[QBO TB Refresh] Parsed lines:', { count: lines.length })

    // Find existing snapshot (idempotency: delete and recreate)
    console.log('[QBO TB] step 6: writing snapshots')
    const existingSnapshot = await prisma.tbSnapshot.findFirst({
      where: {
        org_id: orgId,
        range_from_date: isoToUTCDateOnly(fromDate),
        range_to_date: isoToUTCDateOnly(toDate),
        source: 'qbo',
      },
    })

    if (existingSnapshot) {
      console.log('[QBO TB Refresh] Deleting existing snapshot:', existingSnapshot.id)
      // Delete existing lines first (cascade will handle it, but explicit is clearer)
      await prisma.tbLine.deleteMany({
        where: { snapshot_id: existingSnapshot.id },
      })
      await prisma.tbSnapshot.delete({
        where: { id: existingSnapshot.id },
      })
    }

    // Create new snapshot
    const snapshot = await prisma.tbSnapshot.create({
      data: {
        org_id: orgId,
        range_from_date: isoToUTCDateOnly(fromDate),
        range_to_date: isoToUTCDateOnly(toDate),
        source: 'qbo',
        imported_by_user_id: user.id,
        imported_at: new Date(),
      },
    })

    console.log('[QBO TB] step 6: wrote snapshot', { snapshotId: snapshot.id })

    // Insert lines
    console.log('[QBO TB] step 7: writing lines')
    await prisma.tbLine.createMany({
      data: lines.map(line => ({
        snapshot_id: snapshot.id,
        account_number: line.account_number || undefined,
        account_name: line.account_name,
        account_type: line.account_type || undefined,
        debit: line.debit || undefined,
        credit: line.credit || undefined,
        balance: line.balance,
        currency: undefined,
        raw: undefined,
      })),
    })

    console.log('[QBO TB] step 7: wrote lines', { lineCount: lines.length })
    console.log('[QBO TB Refresh] Success:', {
      snapshotId: snapshot.id,
      lineCount: lines.length,
    })

    let projectDiscovery: DiscoveryResponse | null = null
    let projectDiscoveryWarning: string | null = null
    try {
      await buildAndStoreProjectPnlSnapshot(orgId, snapshot.id, fromDate, toDate)
      projectDiscovery = await discoverProjectData(orgId, fromDate, toDate)
    } catch (err: unknown) {
      projectDiscoveryWarning = getErrorMessage(err)
      console.warn('[QBO TB Refresh] project discovery failed', projectDiscoveryWarning)
    }

    return NextResponse.json({
      success: true,
      snapshotId: snapshot.id,
      lineCount: lines.length,
      projectDiscovery,
      projectDiscoveryWarning,
    })
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err))
    console.error('[QBO TB Refresh] Fatal error:', err)
    console.error('[QBO TB Refresh] Error stack:', error.stack)
    return NextResponse.json(
      { error: 'TB refresh failed', details: String(err), stack: error.stack },
      { status: 500 }
    )
  }
}
