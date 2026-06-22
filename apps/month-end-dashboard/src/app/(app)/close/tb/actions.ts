'use server'

import { ensureUser } from '@/lib/auth/ensureUser'
import { ensureOrgAccess } from '@/lib/auth/ensureOrgAccess'
import { prisma } from '@/lib/db/prisma'
import { revalidatePath } from 'next/cache'
import { isoToUTCDateOnly } from '@/lib/dates/dateOnly'

interface TbLineRow {
  account_name: string
  balance: number
  account_number?: string
  debit?: number
  credit?: number
  account_type?: string
}

/**
 * Normalize CSV headers to handle variations
 */
function normalizeHeader(header: string): string {
  const normalized = header.trim().toLowerCase().replace(/[_\s-]+/g, '_')
  const mappings: Record<string, string> = {
    'accountname': 'account_name',
    'account_name': 'account_name',
    'acctname': 'account_name',
    'name': 'account_name',
    'accountnumber': 'account_number',
    'account_number': 'account_number',
    'acctnum': 'account_number',
    'acctno': 'account_number',
    'number': 'account_number',
    'balance': 'balance',
    'bal': 'balance',
    'debit': 'debit',
    'dr': 'debit',
    'credit': 'credit',
    'cr': 'credit',
    'accounttype': 'account_type',
    'account_type': 'account_type',
    'type': 'account_type',
    'accttype': 'account_type',
  }
  return mappings[normalized] || normalized
}

/**
 * Parse CSV content into rows
 */
function parseCSV(content: string): TbLineRow[] {
  const lines = content.split('\n').filter(line => line.trim())
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header row and one data row')
  }

  const headerLine = lines[0]
  const headers = headerLine.split(',').map(normalizeHeader)

  // Find required columns
  const accountNameIdx = headers.findIndex(h => h === 'account_name')
  const balanceIdx = headers.findIndex(h => h === 'balance')

  if (accountNameIdx === -1) {
    throw new Error('CSV must contain an "account_name" column (or variations like "Account Name", "AccountName")')
  }
  if (balanceIdx === -1) {
    throw new Error('CSV must contain a "balance" column')
  }

  const accountNumberIdx = headers.findIndex(h => h === 'account_number')
  const debitIdx = headers.findIndex(h => h === 'debit')
  const creditIdx = headers.findIndex(h => h === 'credit')
  const accountTypeIdx = headers.findIndex(h => h === 'account_type')

  const rows: TbLineRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    
    const accountName = values[accountNameIdx]?.trim()
    const balanceStr = values[balanceIdx]?.trim()

    if (!accountName || !balanceStr) {
      continue // Skip empty rows
    }

    const balance = parseFloat(balanceStr.replace(/[,$]/g, ''))
    if (isNaN(balance)) {
      continue // Skip invalid balance rows
    }

    const row: TbLineRow = {
      account_name: accountName,
      balance,
    }

    if (accountNumberIdx !== -1 && values[accountNumberIdx]) {
      row.account_number = values[accountNumberIdx].trim()
    }
    if (debitIdx !== -1 && values[debitIdx]) {
      const debit = parseFloat(values[debitIdx].replace(/[,$]/g, ''))
      if (!isNaN(debit)) {
        row.debit = debit
      }
    }
    if (creditIdx !== -1 && values[creditIdx]) {
      const credit = parseFloat(values[creditIdx].replace(/[,$]/g, ''))
      if (!isNaN(credit)) {
        row.credit = credit
      }
    }
    if (accountTypeIdx !== -1 && values[accountTypeIdx]) {
      row.account_type = values[accountTypeIdx].trim()
    }

    rows.push(row)
  }

  return rows
}

/**
 * Upload Trial Balance CSV
 */
export async function uploadTbCsvAction(
  orgId: string,
  rangeFromDate: string,
  rangeToDate: string,
  csvContent: string
) {
  const user = await ensureUser()
  await ensureOrgAccess(orgId)

  // Parse CSV
  const rows = parseCSV(csvContent)

  if (rows.length === 0) {
    return { error: 'CSV contains no valid rows' }
  }

  // Find existing snapshot
  const existingSnapshot = await prisma.tbSnapshot.findFirst({
    where: {
      org_id: orgId,
      range_from_date: isoToUTCDateOnly(rangeFromDate),
      range_to_date: isoToUTCDateOnly(rangeToDate),
      source: 'manual_csv',
    },
  })

  // Create or update snapshot
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
          source: 'manual_csv',
          imported_by_user_id: user.id,
          imported_at: new Date(),
        },
      })

  // Delete existing lines and insert new ones
  await prisma.tbLine.deleteMany({
    where: { snapshot_id: snapshot.id },
  })

  await prisma.tbLine.createMany({
    data: rows.map(row => ({
      snapshot_id: snapshot.id,
      account_number: row.account_number || null,
      account_name: row.account_name,
      account_type: row.account_type || null,
      debit: row.debit || null,
      credit: row.credit || null,
      balance: row.balance,
      currency: null,
      raw: null,
    })),
  })

  revalidatePath('/close')
  return { success: true, rowsImported: rows.length }
}

