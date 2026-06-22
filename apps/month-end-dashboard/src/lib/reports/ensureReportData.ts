/**
 * Orchestration function to ensure report data exists
 * Checks for snapshots and auto-fetches from QBO if missing
 */

'use server'

import { headers } from 'next/headers'
import { prisma } from '@/lib/db/prisma'
import { isoToUTCDateOnly } from '@/lib/dates/dateOnly'
import { getUser } from '@/lib/auth/getUser'

export type ReportType = 'trial-balance' | 'balance-sheet' | 'profit-loss' | 'cash-flow'

interface EnsureReportDataParams {
  reportType: ReportType
  orgId: string
  rangeFromDate: string
  rangeToDate: string
}

interface EnsureReportDataResult {
  success: boolean
  fetched: boolean // true if we fetched from QBO, false if data already existed
  error?: string
  snapshotId?: string
}

/**
 * Ensure Trial Balance data exists for the date range
 */
async function ensureTrialBalance(
  orgId: string,
  rangeFromDate: string,
  rangeToDate: string
): Promise<EnsureReportDataResult> {
  // Check if TB snapshot exists
  const existing = await prisma.tbSnapshot.findFirst({
    where: {
      org_id: orgId,
      range_from_date: isoToUTCDateOnly(rangeFromDate),
      range_to_date: isoToUTCDateOnly(rangeToDate),
      source: 'qbo',
    },
  })

  if (existing) {
    return { success: true, fetched: false }
  }

  // Fetch from QBO using API route (server action calls are complex with cookies)
  try {
    // Use absolute URL for server-side fetch
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || 'http://localhost:3013'

    // Forward cookies for server-side fetch
    const headersList = await headers()
    const cookieHeader = headersList.get('cookie')

    const response = await fetch(`${baseUrl}/api/qbo/trial-balance/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader && { 'Cookie': cookieHeader }),
      },
      body: JSON.stringify({
        orgId,
        fromDate: rangeFromDate,
        toDate: rangeToDate,
      }),
      // Important: server-side fetch needs credentials
      cache: 'no-store',
    })

    if (!response.ok) {
      const error = await response.json()
      return { success: false, fetched: false, error: error.error || 'Failed to fetch Trial Balance' }
    }

    const data = await response.json()
    return { success: true, fetched: true, snapshotId: data.snapshotId }
  } catch (err: any) {
    return { success: false, fetched: false, error: err.message || 'Failed to fetch Trial Balance' }
  }
}

/**
 * Ensure Balance Sheet snapshot exists for as-of date
 */
async function ensureBalanceSheet(
  orgId: string,
  rangeToDate: string
): Promise<EnsureReportDataResult> {
  // Check if BS snapshot exists
  const existing = await prisma.bsSnapshot.findFirst({
    where: {
      org_id: orgId,
      as_of_date: isoToUTCDateOnly(rangeToDate),
      source: 'qbo',
    },
  })

  if (existing) {
    return { success: true, fetched: false }
  }

  // Fetch from QBO using API route
  try {
    // Use absolute URL for server-side fetch
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || 'http://localhost:3013'

    // Forward cookies for server-side fetch
    const headersList = await headers()
    const cookieHeader = headersList.get('cookie')

    const response = await fetch(`${baseUrl}/api/qbo/reports/balance-sheet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader && { 'Cookie': cookieHeader }),
      },
      body: JSON.stringify({
        orgId,
        asOfDate: rangeToDate,
      }),
      // Important: server-side fetch needs credentials
      cache: 'no-store',
    })

    if (!response.ok) {
      const error = await response.json()
      return { success: false, fetched: false, error: error.error || 'Failed to fetch Balance Sheet' }
    }

    const data = await response.json()

    // Store BS snapshot
    const user = await getUser()
    if (!user) {
      return { success: false, fetched: false, error: 'Unauthorized' }
    }

    // Delete existing if any
    const existingSnapshot = await prisma.bsSnapshot.findFirst({
      where: {
        org_id: orgId,
        as_of_date: isoToUTCDateOnly(rangeToDate),
        source: 'qbo',
      },
    })

    if (existingSnapshot) {
      await prisma.bsLine.deleteMany({
        where: { snapshot_id: existingSnapshot.id },
      })
      await prisma.bsSnapshot.delete({
        where: { id: existingSnapshot.id },
      })
    }

    // Create new snapshot
    const snapshot = await prisma.bsSnapshot.create({
      data: {
        org_id: orgId,
        as_of_date: isoToUTCDateOnly(rangeToDate),
        source: 'qbo',
        pulled_by_user_id: user.id,
        pulled_at: new Date(),
        raw_json: data.rawResponse || null,
      },
    })

    // Insert lines
    await prisma.bsLine.createMany({
      data: data.lines.map((line: any) => ({
        snapshot_id: snapshot.id,
        section: line.section,
        account_name: line.account_name,
        amount: line.amount,
        raw: line.raw || null,
      })),
    })

    return { success: true, fetched: true, snapshotId: snapshot.id }
  } catch (err: any) {
    return { success: false, fetched: false, error: err.message || 'Failed to fetch Balance Sheet' }
  }
}

/**
 * Main orchestration function
 */
export async function ensureReportData(
  params: EnsureReportDataParams
): Promise<EnsureReportDataResult> {
  const { reportType, orgId, rangeFromDate, rangeToDate } = params

  switch (reportType) {
    case 'trial-balance':
      return ensureTrialBalance(orgId, rangeFromDate, rangeToDate)

    case 'balance-sheet':
      return ensureBalanceSheet(orgId, rangeToDate)

    case 'profit-loss':
      // P&L uses TB data, so ensure TB exists
      return ensureTrialBalance(orgId, rangeFromDate, rangeToDate)

    case 'cash-flow':
      // Cash Flow uses TB data, so ensure TB exists
      return ensureTrialBalance(orgId, rangeFromDate, rangeToDate)

    default:
      return { success: false, fetched: false, error: `Unknown report type: ${reportType}` }
  }
}

