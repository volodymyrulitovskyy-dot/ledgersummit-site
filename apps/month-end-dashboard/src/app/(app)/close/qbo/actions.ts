'use server'

import { ensureUser } from '@/lib/auth/ensureUser'
import { ensureOrgAccess } from '@/lib/auth/ensureOrgAccess'
import { getActiveOrgId, getRangeFromDate, getRangeToDate } from '@/lib/active'
import { prisma } from '@/lib/db/prisma'
import { revalidatePath } from 'next/cache'
import { isoToUTCDateOnly } from '@/lib/dates/dateOnly'
import { fetchQboTrialBalance, parseQboTrialBalance } from '@/lib/qbo/api'
import { getQboConnectionInfo } from '@/lib/qbo/tokens'

/**
 * Refresh Trial Balance from QuickBooks Online
 */
export async function refreshTbFromQboAction() {
  const user = await ensureUser()
  const orgId = await getActiveOrgId()

  if (!orgId) {
    return { error: 'No active organization selected' }
  }

  await ensureOrgAccess(orgId)

  const rangeFromDate = await getRangeFromDate()
  const rangeToDate = await getRangeToDate()

  if (!rangeFromDate || !rangeToDate) {
    return { error: 'Please select a date range first' }
  }

  // Check QBO connection
  const connection = await getQboConnectionInfo(orgId)
  if (!connection) {
    return { error: 'QuickBooks Online is not connected. Please connect first.' }
  }

  try {
    // Fetch TB from QBO
    const qboData = await fetchQboTrialBalance(
      orgId,
      connection.realm_id,
      rangeFromDate,
      rangeToDate
    )

    // Parse into normalized lines
    const lines = parseQboTrialBalance(qboData)

    if (lines.length === 0) {
      return { error: 'No trial balance data returned from QuickBooks' }
    }

    // Find or create snapshot
    const existingSnapshot = await prisma.tbSnapshot.findFirst({
      where: {
        org_id: orgId,
        range_from_date: isoToUTCDateOnly(rangeFromDate),
        range_to_date: isoToUTCDateOnly(rangeToDate),
        source: 'qbo',
      },
    })

    const snapshot = existingSnapshot
      ? await prisma.tbSnapshot.update({
        where: { id: existingSnapshot.id },
        data: {
          imported_by_user_id: user.id,
          imported_at: new Date(),
        },
      })
      : await prisma.tbSnapshot.create({
        data: {
          org_id: orgId,
          range_from_date: isoToUTCDateOnly(rangeFromDate),
          range_to_date: isoToUTCDateOnly(rangeToDate),
          source: 'qbo',
          imported_by_user_id: user.id,
          imported_at: new Date(),
        },
      })

    // Delete existing lines and insert new ones
    await prisma.tbLine.deleteMany({
      where: { snapshot_id: snapshot.id },
    })

    await prisma.tbLine.createMany({
      data: lines.map(line => ({
        snapshot_id: snapshot.id,
        account_number: line.account_number || null,
        account_name: line.account_name,
        account_type: line.account_type || null,
        debit: line.debit || null,
        credit: line.credit || null,
        balance: line.balance,
        currency: null,
        // raw field is optional, so we can omit it instead of passing null
      })),
    })

    revalidatePath('/close')
    return { success: true, rowsImported: lines.length }
  } catch (error: any) {
    console.error('Failed to refresh TB from QBO:', error)
    return { error: error.message || 'Failed to refresh trial balance from QuickBooks' }
  }
}

/**
 * Export Trial Balance to CSV
 */
export async function exportTbToCsvAction() {
  const orgId = await getActiveOrgId()

  if (!orgId) {
    return { error: 'No active organization selected' }
  }

  const rangeFromDate = await getRangeFromDate()
  const rangeToDate = await getRangeToDate()

  if (!rangeFromDate || !rangeToDate) {
    return { error: 'Please select a date range first' }
  }

  // Get snapshot (prefer QBO, fallback to manual)
  const snapshot = await prisma.tbSnapshot.findFirst({
    where: {
      org_id: orgId,
      range_from_date: isoToUTCDateOnly(rangeFromDate),
      range_to_date: isoToUTCDateOnly(rangeToDate),
    },
    include: {
      tb_lines: {
        orderBy: { account_name: 'asc' },
      },
    },
  })

  if (!snapshot || snapshot.tb_lines.length === 0) {
    return { error: 'No trial balance data found for this date range' }
  }

  // Generate CSV
  const headers = ['Account Name', 'Account Number', 'Debit', 'Credit', 'Balance']
  const rows = snapshot.tb_lines.map(line => [
    line.account_name,
    line.account_number || '',
    line.debit?.toString() || '',
    line.credit?.toString() || '',
    line.balance.toString(),
  ])

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')),
  ].join('\n')

  return { csv, filename: `trial_balance_${rangeFromDate}_${rangeToDate}.csv` }
}

