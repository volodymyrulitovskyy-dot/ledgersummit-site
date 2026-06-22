/**
 * Trial Balance roll-forward utilities
 * Computes Beginning | Activity | Ending from TB snapshots
 */

import { prisma } from '@/lib/db/prisma'
import { isoToUTCDateOnly, priorDay } from '@/lib/dates/dateOnly'
import { classifyAccount } from './accountClassification'
import type { TbLineWithRaw } from './financialStatements'
import { getTrialBalanceReport } from '@/lib/qbo/reports'
import { qboFetchForOrg } from '@/lib/qbo/qboFetchForOrg'

export interface TbRollForwardLine {
  account_name: string
  account_number: string | null
  beginning: number
  activity: number // ending - beginning (not recomputed from debits/credits)
  ending: number
  category: string
}

/**
 * Get Trial Balance roll-forward (Beginning | Activity | Ending)
 * Uses two TB snapshots: prior day and end date
 */
export async function getTrialBalanceRollForward(
  orgId: string,
  rangeFromDate: string,
  rangeToDate: string
): Promise<{
  beginSnapshot: { as_of_date: string; lines: Array<{ account_name: string; account_number: string | null; balance: number; category: string }> } | null
  endSnapshot: { as_of_date: string; lines: Array<{ account_name: string; account_number: string | null; balance: number; category: string }> } | null
  rollForwardLines: TbRollForwardLine[]
  totalBeginning: number
  totalActivity: number
  totalEnding: number
}> {
  // Beginning = day before rangeFromDate
  const asOfBegin = priorDay(rangeFromDate)
  const asOfEnd = rangeToDate

  // Fetch both TB snapshots
  // Beginning: Find snapshot that ends on the prior day (as-of date)
  // Ending: Find snapshot for the current period range
  const [beginSnapshot, endSnapshot] = await Promise.all([
    prisma.tbSnapshot.findFirst({
      where: {
        org_id: orgId,
        range_to_date: isoToUTCDateOnly(asOfBegin),
        source: 'qbo',
      },
      include: {
        tb_lines: {
          orderBy: { account_name: 'asc' },
        },
      },
      orderBy: {
        imported_at: 'desc', // Get most recent if multiple
      },
    }),
    prisma.tbSnapshot.findFirst({
      where: {
        org_id: orgId,
        range_from_date: isoToUTCDateOnly(rangeFromDate),
        range_to_date: isoToUTCDateOnly(rangeToDate),
        source: 'qbo',
      },
      include: {
        tb_lines: {
          orderBy: { account_name: 'asc' },
        },
      },
    }),
  ])

  // Serialize and classify lines
  const beginLines = beginSnapshot
    ? beginSnapshot.tb_lines.map((l) => {
        const line: TbLineWithRaw = {
          id: l.id,
          account_name: l.account_name,
          account_number: l.account_number,
          account_type: l.account_type,
          debit: l.debit ? Number(l.debit) : null,
          credit: l.credit ? Number(l.credit) : null,
          balance: Number(l.balance),
          raw: l.raw,
        }
        return {
          account_name: l.account_name,
          account_number: l.account_number,
          balance: Number(l.balance),
          category: classifyAccount(line),
        }
      })
    : []

  const endLines = endSnapshot
    ? endSnapshot.tb_lines.map((l) => {
        const line: TbLineWithRaw = {
          id: l.id,
          account_name: l.account_name,
          account_number: l.account_number,
          account_type: l.account_type,
          debit: l.debit ? Number(l.debit) : null,
          credit: l.credit ? Number(l.credit) : null,
          balance: Number(l.balance),
          raw: l.raw,
        }
        return {
          account_name: l.account_name,
          account_number: l.account_number,
          balance: Number(l.balance),
          category: classifyAccount(line),
        }
      })
    : []

  // Create maps for quick lookup
  const beginMap = new Map<string, { balance: number; account_number: string | null }>()
  const endMap = new Map<string, { balance: number; account_number: string | null; category: string }>()

  for (const line of beginLines) {
    beginMap.set(line.account_name, { balance: line.balance, account_number: line.account_number })
  }

  for (const line of endLines) {
    endMap.set(line.account_name, { balance: line.balance, account_number: line.account_number, category: line.category })
  }

  // Merge: compute activity = ending - beginning
  const rollForwardLines: TbRollForwardLine[] = []

  // Process all accounts from end snapshot
  for (const [accountName, endData] of endMap.entries()) {
    const beginData = beginMap.get(accountName)
    const beginning = beginData?.balance || 0
    const ending = endData.balance
    const activity = ending - beginning // Activity = ending - beginning (not from debits/credits)

    rollForwardLines.push({
      account_name: accountName,
      account_number: endData.account_number,
      beginning,
      activity,
      ending,
      category: endData.category,
    })
  }

  // Add accounts that exist only in begin snapshot (with zero ending)
  for (const [accountName, beginData] of beginMap.entries()) {
    if (!endMap.has(accountName)) {
      rollForwardLines.push({
        account_name: accountName,
        account_number: beginData.account_number,
        beginning: beginData.balance,
        activity: -beginData.balance, // Activity = 0 - beginning
        ending: 0,
        category: 'unknown',
      })
    }
  }

  // Sort by account name
  rollForwardLines.sort((a, b) => a.account_name.localeCompare(b.account_name))

  // Calculate totals
  const totalBeginning = rollForwardLines.reduce((sum, l) => sum + l.beginning, 0)
  const totalActivity = rollForwardLines.reduce((sum, l) => sum + l.activity, 0)
  const totalEnding = rollForwardLines.reduce((sum, l) => sum + l.ending, 0)

  return {
    beginSnapshot: beginSnapshot
      ? {
          as_of_date: asOfBegin,
          lines: beginLines.map((l) => ({
            account_name: l.account_name,
            account_number: l.account_number,
            balance: l.balance,
            category: l.category,
          })),
        }
      : null,
    endSnapshot: endSnapshot
      ? {
          as_of_date: asOfEnd,
          lines: endLines.map((l) => ({
            account_name: l.account_name,
            account_number: l.account_number,
            balance: l.balance,
            category: l.category,
          })),
        }
      : null,
    rollForwardLines,
    totalBeginning,
    totalActivity,
    totalEnding,
  }
}

/**
 * Build Trial Balance roll-forward directly from QBO (not from snapshots)
 * Returns rows with account_id, account_name, account_type, account_subtype, Start, Activity, End
 */
export async function buildTrialBalanceRollForward(params: {
  orgId: string
  from: string // YYYY-MM-DD (period start)
  to: string // YYYY-MM-DD (period end)
}): Promise<{
  asOfStart: string
  asOfEnd: string
  rows: Array<{
    account_id: string
    account_name: string
    account_type: string
    account_subtype?: string
    Start: number
    Activity: number
    End: number
  }>
}> {
  const { orgId, from, to } = params

  // Calculate asOfStart = prior day of from (e.g., if from=2025-11-01, asOfStart=2025-10-31)
  const fromDate = new Date(from + 'T00:00:00Z')
  const priorDayDate = new Date(fromDate)
  priorDayDate.setUTCDate(priorDayDate.getUTCDate() - 1)
  const asOfStart = priorDayDate.toISOString().split('T')[0]
  const asOfEnd = to

  console.log('[buildTrialBalanceRollForward] ENTER', { orgId, from, to, asOfStart, asOfEnd, ts: new Date().toISOString() })

  // Fetch TB as-of asOfStart (Start) - use single date for as-of snapshot
  console.log('[buildTrialBalanceRollForward] before getTrialBalanceReport (start)', { asOfStart })
  const startTbData = await getTrialBalanceReport(orgId, asOfStart, asOfStart)
  console.log('[buildTrialBalanceRollForward] after getTrialBalanceReport (start)', { hasData: !!startTbData })
  
  // Fetch TB as-of asOfEnd (End) - use period range (from..to) for ending balance
  console.log('[buildTrialBalanceRollForward] before getTrialBalanceReport (end)', { from, to })
  const endTbData = await getTrialBalanceReport(orgId, from, to)
  console.log('[buildTrialBalanceRollForward] after getTrialBalanceReport (end)', { hasData: !!endTbData })

  if (!startTbData || !endTbData) {
    console.error('[buildTrialBalanceRollForward] ERROR: Missing TB data', { hasStart: !!startTbData, hasEnd: !!endTbData })
    throw new Error('Failed to fetch Trial Balance data')
  }

  // Fetch accounts list to get account_id, AccountType, AccountSubType
  console.log('[buildTrialBalanceRollForward] before fetch accounts')
  const accountsData = await qboFetchForOrg(orgId, '/query', {
    query: 'SELECT Id, Name, AccountType, AccountSubType, FullyQualifiedName FROM Account MAXRESULTS 1000',
    minorversion: '65',
  })
  console.log('[buildTrialBalanceRollForward] after fetch accounts', {
    accountCount: accountsData?.QueryResponse?.Account
      ? (Array.isArray(accountsData.QueryResponse.Account)
          ? accountsData.QueryResponse.Account.length
          : 1)
      : 0,
  })

  // Build account map: accountName -> { accountId, accountType, accountSubType }
  const accountMap = new Map<string, { accountId: string; accountType: string; accountSubType?: string }>()
  if (accountsData?.QueryResponse?.Account) {
    const accounts = Array.isArray(accountsData.QueryResponse.Account)
      ? accountsData.QueryResponse.Account
      : [accountsData.QueryResponse.Account]
    
    for (const acct of accounts) {
      const accountId = acct.Id
      const accountName = acct.Name || acct.FullyQualifiedName || ''
      if (accountId && accountName) {
        accountMap.set(accountName, {
          accountId,
          accountType: acct.AccountType || '',
          accountSubType: acct.AccountSubType,
        })
      }
    }
  }

  // Helper to parse QBO amount string
  const parseAmount = (str: string): number => {
    if (!str || str.trim() === '' || str === '—') return 0
    const cleaned = str.replace(/,/g, '').replace(/[()$]/g, '').trim()
    const isNegative = /^\(.*\)$/.test(str.trim())
    const num = Number(cleaned) || 0
    return isNegative ? -num : num
  }

  // Parse TB rows from QBO response
  const parseTbRows = (tbData: any): Map<string, number> => {
    const balanceMap = new Map<string, number>()
    
    const extractRows = (rows: any[]): void => {
      if (!rows) return
      
      for (const row of rows) {
        if (row.ColData && row.ColData.length >= 4) {
          // QBO Trial Balance format:
          // ColData[0] = Account name
          // ColData[1] = Account number (optional)
          // ColData[2] = Debit
          // ColData[3] = Credit
          // ColData[4] = Balance (if present, otherwise compute from debit/credit)
          const accountName = row.ColData[0]?.value?.trim()
          
          if (accountName) {
            let balance = 0
            if (row.ColData.length >= 5 && row.ColData[4]?.value) {
              // Use balance column if present
              const balanceStr = row.ColData[4].value
              const cleaned = balanceStr.replace(/,/g, '').replace(/[()$]/g, '').trim()
              const isNegative = /^\(.*\)$/.test(balanceStr.trim())
              balance = Number(cleaned) || 0
              balance = isNegative ? -balance : balance
            } else if (row.ColData.length >= 4) {
              // Compute from debit/credit
              const debitStr = row.ColData[2]?.value || '0'
              const creditStr = row.ColData[3]?.value || '0'
              const debit = parseAmount(debitStr)
              const credit = parseAmount(creditStr)
              balance = debit - credit
            }
            
            balanceMap.set(accountName, balance)
          }
        }
        
        // Recurse into nested rows
        if (row.Rows?.Row) {
          extractRows(Array.isArray(row.Rows.Row) ? row.Rows.Row : [row.Rows.Row])
        }
      }
    }

    if (tbData?.Rows?.Row) {
      const rows = Array.isArray(tbData.Rows.Row) ? tbData.Rows.Row : [tbData.Rows.Row]
      extractRows(rows)
    }

    return balanceMap
  }

  console.log('[buildTrialBalanceRollForward] before parseTbRows')
  const startBalances = parseTbRows(startTbData)
  const endBalances = parseTbRows(endTbData)
  console.log('[buildTrialBalanceRollForward] after parseTbRows', {
    startBalancesCount: startBalances.size,
    endBalancesCount: endBalances.size,
  })

  // Map QBO AccountType to our account_type (ASSET, LIABILITY, EQUITY)
  const mapAccountType = (qboType: string): string => {
    const type = (qboType || '').toUpperCase()
    
    // Assets
    if (type === 'BANK' || type === 'ACCOUNTS RECEIVABLE' || type === 'OTHER CURRENT ASSET' ||
        type === 'INVENTORY' || type === 'PREPAID EXPENSE' || type === 'FIXED ASSET' || type === 'OTHER ASSET') {
      return 'ASSET'
    }
    
    // Liabilities
    if (type === 'ACCOUNTS PAYABLE' || type === 'CREDIT CARD' || type === 'OTHER CURRENT LIABILITY' ||
        type === 'LONG TERM LIABILITY' || type === 'OTHER LIABILITY') {
      return 'LIABILITY'
    }
    
    // Equity
    if (type === 'EQUITY' || type === 'RETAINED EARNINGS') {
      return 'EQUITY'
    }
    
    // Default fallback
    return type || 'UNKNOWN'
  }

  // Build rows with account_id, account_type, account_subtype, Start, Activity, End
  const allAccountNames = new Set<string>()
  for (const name of startBalances.keys()) {
    allAccountNames.add(name)
  }
  for (const name of endBalances.keys()) {
    allAccountNames.add(name)
  }

  const rows: Array<{
    account_id: string
    account_name: string
    account_type: string
    account_subtype?: string
    Start: number
    Activity: number
    End: number
  }> = []

  for (const accountName of Array.from(allAccountNames).sort()) {
    const accountMeta = accountMap.get(accountName)
    if (!accountMeta) continue // Skip if account not found in accounts list

    const start = startBalances.get(accountName) ?? 0
    const end = endBalances.get(accountName) ?? 0
    const activity = end - start

    rows.push({
      account_id: accountMeta.accountId,
      account_name: accountName,
      account_type: mapAccountType(accountMeta.accountType),
      account_subtype: accountMeta.accountSubType,
      Start: start,
      Activity: activity,
      End: end,
    })
  }

  console.log('[buildTrialBalanceRollForward] RETURN', {
    asOfStart,
    asOfEnd,
    rowsCount: rows.length,
  })

  return {
    asOfStart,
    asOfEnd,
    rows,
  }
}

