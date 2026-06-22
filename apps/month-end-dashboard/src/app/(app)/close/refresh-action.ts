"use server"

import { ensureUser } from '@/lib/auth/ensureUser'
import { ensureOrgAccess } from '@/lib/auth/ensureOrgAccess'
import { prisma } from '@/lib/db/prisma'
import { getTrialBalanceReport } from '@/lib/qbo/reports'
import { parseTrialBalanceReport } from '@/lib/qbo/parseTrialBalanceReport'
import { isoToUTCDateOnly } from '@/lib/dates/dateOnly'
import { buildAndStoreProjectPnlSnapshot } from '@/lib/projects/projectPnlSnapshot'
import { ensureProjectSchema } from '@/lib/projects/schema'

export async function refreshTrialBalanceAction(orgId: string, rangeFromDate: string, rangeToDate: string) {
  await ensureUser()
  await ensureOrgAccess(orgId)
  await ensureProjectSchema()

  const fromDate = isoToUTCDateOnly(rangeFromDate)
  const toDate = isoToUTCDateOnly(rangeToDate)

  const report = await getTrialBalanceReport(orgId, rangeFromDate, rangeToDate)
  const parsed = parseTrialBalanceReport(report)

  // replace existing snapshot for same org/range/source
  await prisma.tbSnapshot.deleteMany({
    where: { org_id: orgId, range_from_date: fromDate, range_to_date: toDate, source: 'qbo' },
  })

  const snapshot = await prisma.tbSnapshot.create({
    data: {
      org_id: orgId,
      range_from_date: fromDate,
      range_to_date: toDate,
      source: 'qbo',
      imported_at: new Date(),
    },
  })

  if (parsed.rows.length) {
    await prisma.tbLine.createMany({
      data: parsed.rows.map((r: { accountId?: string; accountName: string; debit?: number; credit?: number; ending_tb: number }) => ({
        snapshot_id: snapshot.id,
        account_number: r.accountId || null,
        account_name: r.accountName,
        account_type: null,
        debit: r.debit,
        credit: r.credit,
        balance: r.ending_tb,
        // raw field is optional, omit it
      })),
      skipDuplicates: true,
    })
  }

  try {
    await buildAndStoreProjectPnlSnapshot(orgId, snapshot.id, rangeFromDate, rangeToDate)
  } catch (err) {
    console.warn('[PROJECT_PNL] Snapshot build failed during refresh', err)
  }

  return { success: true, snapshotId: snapshot.id, rows: parsed.rows.length }
}
