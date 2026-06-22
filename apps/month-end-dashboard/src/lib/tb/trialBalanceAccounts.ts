import { priorDay } from '@/lib/dates/dateOnly'
import { getTrialBalanceReport } from '@/lib/qbo/reports'
import { parseTrialBalanceReport } from '@/lib/qbo/parseTrialBalanceReport'

export type TrialBalanceAccountRow = {
  accountId: string
  accountName: string
  accountNumber?: string
  beginning: number
  debit: number
  credit: number
  ending: number
}

type QboReport = any

function collectAccountRows(report: QboReport): any[] {
  const rows = report?.Rows?.Row
  const stack = Array.isArray(rows) ? [...rows] : rows ? [rows] : []
  const out: any[] = []

  while (stack.length) {
    const node = stack.shift()
    const cd = node?.ColData
    const hasAcctId = typeof cd?.[0]?.id === 'string' && cd[0].id.length > 0
    if (Array.isArray(cd) && cd.length >= 2 && hasAcctId) {
      out.push(node)
    }
    const kids = node?.Rows?.Row
    if (kids) stack.push(...(Array.isArray(kids) ? kids : [kids]))
  }

  return out
}

function buildAccountNumberMap(report: QboReport): Map<string, string> {
  const map = new Map<string, string>()
  for (const row of collectAccountRows(report)) {
    const cd = row?.ColData || []
    const accountId = String(cd?.[0]?.id ?? '').trim()
    const accountNumber = String(cd?.[1]?.value ?? '').trim()
    if (accountId && accountNumber) {
      map.set(accountId, accountNumber)
    }
  }
  return map
}

function addToBeginningMap(
  map: Map<string, number>,
  row: { accountId: string; accountName: string; ending_tb: number },
) {
  const idKey = (row.accountId || '').trim()
  const nameKey = (row.accountName || '').trim()
  if (idKey && !map.has(idKey)) map.set(idKey, row.ending_tb)
  if (nameKey && !map.has(nameKey)) map.set(nameKey, row.ending_tb)
}

export async function fetchTrialBalanceAccounts(
  orgId: string,
  fromDate: string,
  toDate: string,
): Promise<{ accounts: TrialBalanceAccountRow[]; asOfBeginning: string | null; asOfEnding: string }> {
  // Fetch current and prior-day TBs in parallel
  const prior = priorDay(fromDate)
  const [endingReport, beginningReport] = await Promise.all([
    getTrialBalanceReport(orgId, fromDate, toDate),
    getTrialBalanceReport(orgId, prior, prior),
  ])

  const parsedEnding = parseTrialBalanceReport(endingReport)
  const parsedBeginning = beginningReport ? parseTrialBalanceReport(beginningReport) : null

  const beginMap = new Map<string, number>()
  if (parsedBeginning?.rows?.length) {
    for (const row of parsedBeginning.rows) {
      addToBeginningMap(beginMap, row)
    }
  }

  const accountNumberMap = buildAccountNumberMap(endingReport)
  // If prior report had numbers not present in ending, include them
  const beginNumberMap = buildAccountNumberMap(beginningReport)
  for (const [key, val] of beginNumberMap.entries()) {
    if (!accountNumberMap.has(key)) accountNumberMap.set(key, val)
  }

  const accounts: TrialBalanceAccountRow[] = parsedEnding.rows.map((row: any) => {
    const idKey = (row.accountId || '').trim()
    const nameKey = (row.accountName || '').trim()
    const beginning = beginMap.get(idKey) ?? beginMap.get(nameKey) ?? 0
    const ending = beginning + (row.debit || 0) - (row.credit || 0)

    return {
      accountId: row.accountId || nameKey,
      accountName: row.accountName,
      accountNumber: accountNumberMap.get(idKey) || undefined,
      beginning,
      debit: row.debit || 0,
      credit: row.credit || 0,
      ending,
    }
  })

  return {
    accounts,
    asOfBeginning: parsedBeginning ? prior : null,
    asOfEnding: toDate,
  }
}
