/**
 * QuickBooks Online API client
 */

import { getQboBaseUrl } from './config'
import { getValidAccessToken } from './tokens'

export interface QboTrialBalanceLine {
  Header?: {
    Name?: string
    ReportName?: string
    StartPeriod?: string
    EndPeriod?: string
  }
  Rows?: {
    Row?: Array<{
      group?: string
      ColData?: Array<{
        value?: string
        id?: string
      }>
      Rows?: {
        Row?: Array<{
          group?: string
          ColData?: Array<{
            value?: string
            id?: string
          }>
          Rows?: {
            Row?: Array<any>
          }
        }>
      }
    }>
  }
}

export interface QboAccount {
  Id?: string
  Name?: string
  AccountType?: string
  AccountSubType?: string
  CurrentBalance?: number
}

/**
 * Fetch Trial Balance from QBO for a date range
 */
export async function fetchQboTrialBalance(
  orgId: string,
  realmId: string,
  startDate: string, // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
) {
  const accessToken = await getValidAccessToken(orgId)
  const baseUrl = getQboBaseUrl()

  // QBO Reports API endpoint for Trial Balance
  const url = `${baseUrl}/v3/company/${realmId}/reports/TrialBalance?start_date=${startDate}&end_date=${endDate}&minorversion=65`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to fetch Trial Balance: ${response.status} ${error}`)
  }

  const data: QboTrialBalanceLine = await response.json()
  return data
}

/**
 * Parse QBO Trial Balance response into normalized TB lines
 * Recursively walks nested Rows.Row structures to extract all account rows
 */
export function parseQboTrialBalance(data: QboTrialBalanceLine): Array<{
  account_name: string
  account_number?: string
  account_type?: string
  debit?: number
  credit?: number
  balance: number
}> {
  const lines: Array<{
    account_name: string
    account_number?: string
    account_type?: string
    debit?: number
    credit?: number
    balance: number
  }> = []

  /**
   * Recursively extract rows with ColData from nested Row structures
   */
  function extractRows(rows: Array<{
    group?: string
    ColData?: Array<{
      value?: string
      id?: string
    }>
    Rows?: {
      Row?: Array<{
        group?: string
        ColData?: Array<{
          value?: string
          id?: string
        }>
        Rows?: {
          Row?: Array<any>
        }
      }>
    }
  }>): void {
    if (!rows) return

    for (const row of rows) {
      // If this row has ColData, it's an account row - parse it
      if (row.ColData && row.ColData.length >= 4) {
        const accountName = row.ColData[0]?.value?.trim()
        if (!accountName) {
          continue
        }

        // QBO Trial Balance format:
        // ColData[0] = Account name
        // ColData[1] = Account number (optional)
        // ColData[2] = Debit
        // ColData[3] = Credit
        // ColData[4] = Balance

        // Parse numeric values (QBO returns as strings)
        const debit = parseFloat(row.ColData[2]?.value?.replace(/,/g, '') || '0')
        const credit = parseFloat(row.ColData[3]?.value?.replace(/,/g, '') || '0')
        const balance = parseFloat(row.ColData[4]?.value?.replace(/,/g, '') || '0')

        lines.push({
          account_name: accountName,
          account_number: row.ColData[1]?.value?.trim() || undefined,
          account_type: undefined, // QBO TB doesn't include account type in this report
          debit: debit !== 0 ? debit : undefined,
          credit: credit !== 0 ? credit : undefined,
          balance,
        })
      }

      // If this row has nested Rows.Row, recurse into it
      if (row.Rows?.Row) {
        extractRows(row.Rows.Row)
      }
    }
  }

  // Start extraction from top-level rows
  if (data.Rows?.Row) {
    extractRows(data.Rows.Row)
  }

  return lines
}

