/**
 * Cleanup script to delete bad Balance Sheet snapshot for as_of_date=2025-11-30
 * 
 * After running this, the next time the Balance Sheet is viewed for that date,
 * it will automatically re-fetch with the fixed parser.
 * 
 * Usage:
 *   npx tsx scripts/cleanup-bad-bs-snapshot.ts <orgId>
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function cleanupBadSnapshot(orgId: string, asOfDate: string = '2025-11-30') {
  console.log(`[Cleanup] Looking for BS snapshot: orgId=${orgId.substring(0, 8)}..., asOfDate=${asOfDate}`)

  const snapshot = await prisma.bsSnapshot.findFirst({
    where: {
      org_id: orgId,
      as_of_date: asOfDate,
      source: 'qbo',
    },
  })

  if (!snapshot) {
    console.log(`[Cleanup] No snapshot found for as_of_date=${asOfDate}`)
    return
  }

  console.log(`[Cleanup] Found snapshot: id=${snapshot.id}`)
  console.log(`[Cleanup] Deleting ${snapshot.id} lines...`)

  // Delete lines first
  const deletedLines = await prisma.bsLine.deleteMany({
    where: { snapshot_id: snapshot.id },
  })
  console.log(`[Cleanup] Deleted ${deletedLines.count} lines`)

  // Delete snapshot
  await prisma.bsSnapshot.delete({
    where: { id: snapshot.id },
  })
  console.log(`[Cleanup] Deleted snapshot ${snapshot.id}`)
  console.log(`[Cleanup] Done! Next time Balance Sheet is viewed for ${asOfDate}, it will re-fetch with fixed parser.`)
}

async function main() {
  const orgId = process.argv[2]
  const asOfDate = process.argv[3] || '2025-11-30'

  if (!orgId) {
    console.error('Usage: npx tsx scripts/cleanup-bad-bs-snapshot.ts <orgId> [asOfDate]')
    console.error('Example: npx tsx scripts/cleanup-bad-bs-snapshot.ts abc123def456 2025-11-30')
    process.exit(1)
  }

  try {
    await cleanupBadSnapshot(orgId, asOfDate)
  } catch (error) {
    console.error('[Cleanup] Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

