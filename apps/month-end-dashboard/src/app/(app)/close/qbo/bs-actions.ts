'use server'

import { ensureUser } from '@/lib/auth/ensureUser'
import { getActiveOrgId } from '@/lib/active'
import { ensureOrgAccess } from '@/lib/auth/ensureOrgAccess'
import { prisma } from '@/lib/db/prisma'
import { isoToUTCDateOnly } from '@/lib/dates/dateOnly'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'

/**
 * Fetch Balance Sheet from QBO and store as snapshot
 */
export async function fetchBsFromQboAction(asOfDate: string) {
  const user = await ensureUser()
  const orgId = await getActiveOrgId()
  
  if (!orgId) {
    return { error: 'No organization selected' }
  }

  await ensureOrgAccess(orgId)

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    return { error: 'Invalid date format. Use YYYY-MM-DD' }
  }

  try {
    // Call QBO API endpoint (server-side, use headers to get host)
    const headersList = await headers()
    const host = headersList.get('host') || 'localhost:3013'
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
    const baseUrl = `${protocol}://${host}`
    
    const response = await fetch(`${baseUrl}/api/qbo/reports/balance-sheet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orgId,
        asOfDate,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      return { error: error.error || 'Failed to fetch Balance Sheet from QBO' }
    }

    const data = await response.json()

    // Find or create snapshot (use findFirst with composite where clause)
    const existingSnapshot = await prisma.bsSnapshot.findFirst({
      where: {
        org_id: orgId,
        as_of_date: isoToUTCDateOnly(asOfDate),
        source: 'qbo',
      },
    })

    if (existingSnapshot) {
      // Delete existing lines
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
        as_of_date: isoToUTCDateOnly(asOfDate),
        source: 'qbo',
        pulled_by_user_id: user.id,
        pulled_at: new Date(),
        raw_json: data.rawResponse || data.raw || null,
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

    revalidatePath('/reports')
    revalidatePath('/close')

    return { success: true, snapshotId: snapshot.id, lineCount: data.lines.length }
  } catch (err: any) {
    console.error('[BS Fetch] Error:', err)
    return { error: err.message || 'Failed to fetch Balance Sheet' }
  }
}

