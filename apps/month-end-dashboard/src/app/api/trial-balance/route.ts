import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { dateToISOString, isoToUTCDateOnly } from '@/lib/dates/dateOnly'
import { fetchTrialBalanceAccounts } from '@/lib/tb/trialBalanceAccounts'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const orgId = searchParams.get('orgId') || searchParams.get('org_id')
    const periodStart =
      searchParams.get('periodStart') ||
      searchParams.get('period_start') ||
      searchParams.get('from') ||
      searchParams.get('fromDate')
    const periodEnd =
      searchParams.get('periodEnd') ||
      searchParams.get('period_end') ||
      searchParams.get('to') ||
      searchParams.get('toDate')

    if (!orgId || !periodEnd) {
      return NextResponse.json(
        { error: 'orgId and periodEnd (YYYY-MM-DD) are required' },
        { status: 400 }
      )
    }

    await ensureOrgAccessApi(orgId)

    let fromDate = periodStart || ''
    const toDate = periodEnd

    // Infer start date from existing snapshot if missing (backward compatibility for callers that only send period_end)
    if (!fromDate) {
      const snapshot = await prisma.tbSnapshot.findFirst({
        where: {
          org_id: orgId,
          range_to_date: isoToUTCDateOnly(toDate),
        },
        orderBy: { imported_at: 'desc' },
      })
      if (snapshot?.range_from_date) {
        fromDate = dateToISOString(snapshot.range_from_date)
      }
    }

    if (!fromDate) {
      fromDate = toDate
    }

    const { accounts } = await fetchTrialBalanceAccounts(orgId, fromDate, toDate)

    const shaped = accounts.map((a) => ({
      accountId: a.accountId,
      accountName: a.accountName,
      accountNumber: a.accountNumber || '',
      beginning: a.beginning,
      debit: a.debit,
      credit: a.credit,
      ending: a.ending,
      // Legacy keys for existing consumers (e.g., Reconciliations)
      account_name: a.accountName,
      account_number: a.accountNumber || '',
      balance: a.ending,
    }))

    return NextResponse.json({ accounts: shaped })
  } catch (error: any) {
    console.error('Error fetching trial balance accounts:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
