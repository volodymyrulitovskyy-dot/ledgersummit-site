/**
 * Server-side financial statements generation
 * Single source of truth for all reports
 */

import { prisma } from '@/lib/db/prisma'
import { isoToUTCDateOnly } from '@/lib/dates/dateOnly'
import { classifyAccount, isBalanceSheetAccount, isPLAccount, AccountCategory } from './accountClassification'
import { normalizeTbLine, NormalizedLine } from './normalize'

export interface TbLine {
  id: string
  account_name: string
  account_number: string | null
  account_type: string | null
  debit: number | null
  credit: number | null
  balance: number
  raw: any
}

export interface ReconciliationCheck {
  check: string
  passed: boolean
  variance?: number
  message: string
  topContributors?: Array<{ account_name: string; amount: number }>
}

export interface FinancialStatements {
  trialBalance: {
    lines: Array<{
      id: string
      account_name: string
      account_number: string | null
      debit: number | null
      credit: number | null
      balance: number
      category: AccountCategory
    }>
    totalDebit: number
    totalCredit: number
    totalNet: number
  }
  balanceSheet: {
    assets: NormalizedLine[]
    liabilities: NormalizedLine[]
    equity: NormalizedLine[]
    netIncome: number // From P&L
    totalAssets: number
    totalLiabilities: number
    totalEquity: number
    totalLiabilitiesAndEquity: number
    variance: number
    unreconciledOpeningBalances: number // Diagnostic: missing assets if BS doesn't balance
    hasOpeningBalanceEquity: boolean // Flag for non-GAAP account
    status: 'clean' | 'opening-issues' | 'out-of-balance' // BS readiness status
  }
  profitAndLoss: {
    revenue: NormalizedLine[]
    cogs: NormalizedLine[]
    operatingExpenses: NormalizedLine[]
    otherIncome: NormalizedLine[]
    otherExpense: NormalizedLine[]
    totalRevenue: number
    totalCogs: number
    grossProfit: number
    totalOperatingExpenses: number
    operatingIncome: number
    totalOtherIncome: number
    totalOtherExpense: number
    netIncome: number
  }
  cashFlow: {
    netIncome: number
    depreciation: number
    workingCapitalChanges: {
      arDelta: number
      apDelta: number
      inventoryDelta: number
      total: number
    }
    cashFromOperations: number
    cashFromInvesting: number
    cashFromFinancing: number
    netCashChange: number
    beginningCash: number
    endingCash: number
    hasPriorSnapshot: boolean
  }
  reconciliation: {
    checks: ReconciliationCheck[]
    allPassed: boolean
  }
}

/**
 * Get all financial statements for a given org and date range
 */
export async function getFinancialStatements(
  orgId: string,
  fromDate: string,
  toDate: string
): Promise<FinancialStatements> {
  // Get current TB snapshot
  const tbSnapshot = await prisma.tbSnapshot.findFirst({
    where: {
      org_id: orgId,
      range_from_date: isoToUTCDateOnly(fromDate),
      range_to_date: isoToUTCDateOnly(toDate),
      source: 'qbo',
    },
    include: {
      tb_lines: {
        orderBy: { account_name: 'asc' },
      },
    },
  })

  if (!tbSnapshot) {
    throw new Error('No trial balance snapshot found for the selected date range')
  }

  // Get prior snapshot for Cash Flow
  const priorSnapshot = await prisma.tbSnapshot.findFirst({
    where: {
      org_id: orgId,
      range_to_date: {
        lt: isoToUTCDateOnly(fromDate),
      },
      source: 'qbo',
    },
    include: {
      tb_lines: {
        orderBy: { account_name: 'asc' },
      },
    },
    orderBy: {
      range_to_date: 'desc',
    },
  })

  // Serialize TB lines (convert Decimal to number, include raw)
  const tbLines: TbLine[] = tbSnapshot.tb_lines.map((l) => ({
    id: l.id,
    account_name: l.account_name,
    account_number: l.account_number,
    account_type: l.account_type,
    debit: l.debit ? Number(l.debit) : null,
    credit: l.credit ? Number(l.credit) : null,
    balance: Number(l.balance),
    raw: l.raw,
  }))

  // Classify all accounts
  const classifiedLines = tbLines.map((line) => ({
    ...line,
    category: classifyAccount(line),
  }))

  // Build Trial Balance
  const totalDebit = classifiedLines.reduce((sum, l) => sum + Number(l.debit || 0), 0)
  const totalCredit = classifiedLines.reduce((sum, l) => sum + Number(l.credit || 0), 0)
  const totalNet = totalDebit - totalCredit

  // Build Balance Sheet (only BS accounts - STRICT filtering)
  // Explicitly exclude P&L accounts (revenue, expense, cogs)
  const bsLines = classifiedLines.filter((l) => {
    const isBS = isBalanceSheetAccount(l.category)
    const isPL = isPLAccount(l.category)
    // Double-check: if classified as both or misclassified, exclude from BS
    if (isPL) {
      return false // Never include P&L accounts in BS
    }
    return isBS
  })
  
  const assets = bsLines
    .filter((l) => l.category === 'asset')
    .map((l) => normalizeTbLine(l, 'asset'))
  const liabilities = bsLines
    .filter((l) => l.category === 'liability')
    .map((l) => normalizeTbLine(l, 'liability'))
  const equity = bsLines
    .filter((l) => l.category === 'equity')
    .map((l) => normalizeTbLine(l, 'equity'))

  // Build P&L (only P&L accounts)
  const plLines = classifiedLines.filter((l) => isPLAccount(l.category))
  const revenue = plLines
    .filter((l) => l.category === 'revenue')
    .map((l) => normalizeTbLine(l, 'revenue'))
  const cogs = plLines
    .filter((l) => l.category === 'cogs')
    .map((l) => normalizeTbLine(l, 'cogs'))
  const operatingExpenses = plLines
    .filter((l) => l.category === 'expense')
    .map((l) => normalizeTbLine(l, 'expense'))
  // For now, treat all revenue/expense as main categories (can refine later)
  const otherIncome: NormalizedLine[] = []
  const otherExpense: NormalizedLine[] = []

  // Calculate P&L totals
  const totalRevenue = revenue.reduce((sum, l) => sum + l.normalized_balance, 0)
  const totalCogs = cogs.reduce((sum, l) => sum + l.normalized_balance, 0)
  const grossProfit = totalRevenue - totalCogs
  const totalOperatingExpenses = operatingExpenses.reduce((sum, l) => sum + l.normalized_balance, 0)
  const operatingIncome = grossProfit - totalOperatingExpenses
  const totalOtherIncome = otherIncome.reduce((sum, l) => sum + l.normalized_balance, 0)
  const totalOtherExpense = otherExpense.reduce((sum, l) => sum + l.normalized_balance, 0)
  const netIncome = operatingIncome + totalOtherIncome - totalOtherExpense

  // Calculate Balance Sheet totals
  const totalAssets = assets.reduce((sum, l) => sum + l.normalized_balance, 0)
  const totalLiabilities = liabilities.reduce((sum, l) => sum + l.normalized_balance, 0)
  const openingEquity = equity.reduce((sum, l) => sum + l.normalized_balance, 0)
  const totalEquity = openingEquity + netIncome // Add current period net income
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity
  const variance = totalAssets - totalLiabilitiesAndEquity
  
  // Check for Opening Balance Equity (non-GAAP flag)
  const hasOpeningBalanceEquity = equity.some((l) => 
    l.account_name.toLowerCase().includes('opening balance equity')
  )
  
  // Calculate unreconciled opening balances (if BS doesn't balance)
  const unreconciledOpeningBalances = Math.abs(variance) > 0.01 
    ? (totalLiabilitiesAndEquity - totalAssets) 
    : 0
  
  // Determine BS readiness status
  let bsStatus: 'clean' | 'opening-issues' | 'out-of-balance' = 'clean'
  if (Math.abs(variance) > 0.01) {
    bsStatus = 'out-of-balance'
  } else if (hasOpeningBalanceEquity) {
    bsStatus = 'opening-issues'
  }

  // Build Cash Flow
  const priorTbLines = priorSnapshot
    ? priorSnapshot.tb_lines.map((l) => ({
        id: l.id,
        account_name: l.account_name,
        account_number: l.account_number,
        account_type: l.account_type,
        debit: l.debit ? Number(l.debit) : null,
        credit: l.credit ? Number(l.credit) : null,
        balance: Number(l.balance),
        raw: l.raw,
      }))
    : []

  // Find cash account
  const cashAccount = tbLines.find((line) => {
    const name = line.account_name.toLowerCase()
    return name.includes('cash') || name.includes('checking') || name.includes('bank')
  })
  const currentCash = Number(cashAccount?.balance || 0)
  const priorCash = Number(
    priorTbLines.find((line) => {
      const name = line.account_name.toLowerCase()
      return name.includes('cash') || name.includes('checking') || name.includes('bank')
    })?.balance || 0
  )

  // Find depreciation
  const depreciation = tbLines.find((line) => {
    const name = line.account_name.toLowerCase()
    return name.includes('depreciation') || name.includes('amortization')
  })
  const depreciationAmount = depreciation ? Math.abs(Number(depreciation.balance || 0)) : 0

  // Working capital changes
  const hasPriorSnapshot = priorTbLines.length > 0
  let arDelta = 0
  let apDelta = 0
  let inventoryDelta = 0

  if (hasPriorSnapshot) {
    const currentAR = Number(
      tbLines.find((line) => {
        const name = line.account_name.toLowerCase()
        return name.includes('account receivable') || name.includes('ar ')
      })?.balance || 0
    )
    const priorAR = Number(
      priorTbLines.find((line) => {
        const name = line.account_name.toLowerCase()
        return name.includes('account receivable') || name.includes('ar ')
      })?.balance || 0
    )
    arDelta = currentAR - priorAR

    const currentAP = Number(
      tbLines.find((line) => {
        const name = line.account_name.toLowerCase()
        return name.includes('account payable') || name.includes('ap ')
      })?.balance || 0
    )
    const priorAP = Number(
      priorTbLines.find((line) => {
        const name = line.account_name.toLowerCase()
        return name.includes('account payable') || name.includes('ap ')
      })?.balance || 0
    )
    apDelta = currentAP - priorAP

    const currentInventory = Number(
      tbLines.find((line) => {
        const name = line.account_name.toLowerCase()
        return name.includes('inventory')
      })?.balance || 0
    )
    const priorInventory = Number(
      priorTbLines.find((line) => {
        const name = line.account_name.toLowerCase()
        return name.includes('inventory')
      })?.balance || 0
    )
    inventoryDelta = currentInventory - priorInventory
  }

  const workingCapitalChange = -arDelta + apDelta - inventoryDelta
  const cashFromOperations = netIncome + depreciationAmount + workingCapitalChange
  const cashFromInvesting = 0 // Not available from TB
  const cashFromFinancing = 0 // Not available from TB
  const netCashChange = cashFromOperations + cashFromInvesting + cashFromFinancing

  // Reconciliation checks
  const checks: ReconciliationCheck[] = []

  // Check 1: Trial Balance balance
  const tbVariance = Math.abs(totalDebit - totalCredit)
  checks.push({
    check: 'Trial Balance',
    passed: tbVariance < 0.01,
    variance: tbVariance,
    message: tbVariance < 0.01
      ? 'Trial Balance balances (Debit = Credit)'
      : `Trial Balance does not balance: Debit (${totalDebit.toFixed(2)}) ≠ Credit (${totalCredit.toFixed(2)})`,
    topContributors: tbVariance >= 0.01
      ? classifiedLines
          .map((l) => ({
            account_name: l.account_name,
            amount: Math.abs(Number(l.debit || 0) - Number(l.credit || 0)),
          }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5)
      : undefined,
  })

  // Check 2: Balance Sheet balance
  checks.push({
    check: 'Balance Sheet',
    passed: Math.abs(variance) < 0.01,
    variance: variance,
    message: Math.abs(variance) < 0.01
      ? 'Balance Sheet balances (Assets = Liabilities + Equity)'
      : `Balance Sheet does not balance: Assets (${totalAssets.toFixed(2)}) ≠ Liabilities + Equity (${totalLiabilitiesAndEquity.toFixed(2)})`,
    topContributors: Math.abs(variance) >= 0.01
      ? [
          ...assets.map((l) => ({ account_name: l.account_name, amount: l.normalized_balance })),
          ...liabilities.map((l) => ({ account_name: l.account_name, amount: l.normalized_balance })),
          ...equity.map((l) => ({ account_name: l.account_name, amount: l.normalized_balance })),
        ]
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5)
      : undefined,
  })

  // Check 3: No account in both BS and P&L
  const bsAccountNames = new Set(bsLines.map((l) => l.account_name))
  const plAccountNames = new Set(plLines.map((l) => l.account_name))
  const overlap = Array.from(bsAccountNames).filter((name) => plAccountNames.has(name))
  checks.push({
    check: 'Account Classification',
    passed: overlap.length === 0,
    message: overlap.length === 0
      ? 'No account appears in both Balance Sheet and P&L'
      : `Accounts appear in both BS and P&L: ${overlap.join(', ')}`,
  })

  return {
    trialBalance: {
      lines: classifiedLines.map((l) => ({
        id: l.id,
        account_name: l.account_name,
        account_number: l.account_number,
        debit: l.debit,
        credit: l.credit,
        balance: l.balance,
        category: l.category,
      })),
      totalDebit,
      totalCredit,
      totalNet,
    },
    balanceSheet: {
      assets,
      liabilities,
      equity,
      netIncome,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity,
      variance,
      unreconciledOpeningBalances,
      hasOpeningBalanceEquity,
      status: bsStatus,
    },
    profitAndLoss: {
      revenue,
      cogs,
      operatingExpenses,
      otherIncome,
      otherExpense,
      totalRevenue,
      totalCogs,
      grossProfit,
      totalOperatingExpenses,
      operatingIncome,
      totalOtherIncome,
      totalOtherExpense,
      netIncome,
    },
    cashFlow: {
      netIncome,
      depreciation: depreciationAmount,
      workingCapitalChanges: {
        arDelta,
        apDelta,
        inventoryDelta,
        total: workingCapitalChange,
      },
      cashFromOperations,
      cashFromInvesting,
      cashFromFinancing,
      netCashChange,
      beginningCash: priorCash,
      endingCash: currentCash,
      hasPriorSnapshot,
    },
    reconciliation: {
      checks,
      allPassed: checks.every((c) => c.passed),
    },
  }
}

