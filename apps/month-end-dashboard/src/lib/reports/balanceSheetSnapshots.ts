/**
 * Balance Sheet snapshot utilities
 * Handles fetching and processing BS snapshots (separate from TB)
 */

import { prisma } from '@/lib/db/prisma'
import { isoToUTCDateOnly, priorDay } from '@/lib/dates/dateOnly'

export interface BsLine {
  id: string
  section: 'ASSET' | 'LIABILITY' | 'EQUITY'
  account_name: string
  amount: number
}

export interface BsSnapshot {
  as_of_date: string
  lines: BsLine[]
}

/**
 * Get Balance Sheet snapshot for as-of date (rangeToDate only)
 * Balance Sheet uses as-of balances, not period activity
 */
export async function getBalanceSheetSnapshot(
  orgId: string,
  rangeToDate: string
): Promise<BsSnapshot | null> {
  // Fetch snapshot for as-of date = rangeToDate (ignore rangeFromDate)
  const snapshot = await prisma.bsSnapshot.findFirst({
    where: {
      org_id: orgId,
      as_of_date: isoToUTCDateOnly(rangeToDate),
      source: 'qbo',
    },
    include: {
      bs_lines: {
        where: {
          section: {
            in: ['ASSET', 'LIABILITY', 'EQUITY'], // Strict filter: exclude P&L accounts
          },
        },
        orderBy: { account_name: 'asc' },
      },
    },
  })

  if (!snapshot) {
    return null
  }

  // Filter lines to ensure only BS sections (double-check)
  const filteredLines = snapshot.bs_lines
    .filter((l) => ['ASSET', 'LIABILITY', 'EQUITY'].includes(l.section))
    .map((l) => ({
      id: l.id,
      section: l.section as 'ASSET' | 'LIABILITY' | 'EQUITY',
      account_name: l.account_name,
      amount: Number(l.amount),
    }))

  return {
    as_of_date: rangeToDate,
    lines: filteredLines,
  }
}

/**
 * Convert BS snapshot to display format (single as-of snapshot)
 * Returns accounts with ending amounts only (no beginning/change for single snapshot)
 */
export function formatBsSnapshotForDisplay(
  snapshot: BsSnapshot | null
): Array<{
  section: 'ASSET' | 'LIABILITY' | 'EQUITY'
  account_name: string
  ending: number
}> {
  if (!snapshot) {
    return []
  }

  // Filter to ensure only BS sections (strict filter)
  const filtered = snapshot.lines.filter((l) =>
    ['ASSET', 'LIABILITY', 'EQUITY'].includes(l.section)
  )

  // Sort by section, then by account name
  const sectionOrder = { ASSET: 1, LIABILITY: 2, EQUITY: 3 }
  const sorted = filtered.sort((a, b) => {
    const sectionDiff = sectionOrder[a.section] - sectionOrder[b.section]
    if (sectionDiff !== 0) return sectionDiff
    return a.account_name.localeCompare(b.account_name)
  })

  return sorted.map((l) => ({
    section: l.section,
    account_name: l.account_name,
    ending: l.amount,
  }))
}

/**
 * Calculate Balance Sheet totals and variance from BS lines only
 * Assets must equal Liabilities + Equity (variance should be 0)
 */
export function calculateBsTotals(bsLines: Array<{
  section: 'ASSET' | 'LIABILITY' | 'EQUITY'
  account_name: string
  ending: number
}>) {
  // Filter by section (strict: only ASSET, LIABILITY, EQUITY)
  const assets = bsLines.filter((l) => l.section === 'ASSET')
  const liabilities = bsLines.filter((l) => l.section === 'LIABILITY')
  const equity = bsLines.filter((l) => l.section === 'EQUITY')

  // Calculate totals from ending balances only
  const totalAssets = assets.reduce((sum, l) => sum + l.ending, 0)
  const totalLiabilities = liabilities.reduce((sum, l) => sum + l.ending, 0)
  const totalEquity = equity.reduce((sum, l) => sum + l.ending, 0)
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity
  const variance = totalAssets - totalLiabilitiesAndEquity

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    totalLiabilitiesAndEquity,
    variance,
  }
}

