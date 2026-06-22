import { NextRequest, NextResponse } from 'next/server'
import { ensureUser } from '@/lib/auth/ensureUser'
import { qboFetchForOrg } from '@/lib/qbo/qboFetchForOrg'
import fs from 'fs'

function log(msg: string, data?: any) {
    const logMsg = `[${new Date().toISOString()}] ${msg} ${data ? JSON.stringify(data) : ''}\n`
    console.log(logMsg.trim())
    try {
        fs.appendFileSync('/tmp/variance-drill-down.log', logMsg)
    } catch (e) {
        // Ignore file write errors
    }
}

export async function GET(req: NextRequest) {
    try {
        await ensureUser()

        const { searchParams } = new URL(req.url)
        const orgId = searchParams.get('org_id')
        const accountId = searchParams.get('account_id') // QBO Account ID
        const accountName = searchParams.get('account_name')
        const currentPeriod = searchParams.get('current_period')
        const priorPeriod = searchParams.get('prior_period')

        log('[VARIANCE DRILL-DOWN] Request received:', { orgId, accountId, accountName, currentPeriod, priorPeriod })

        if (!orgId || !currentPeriod || !priorPeriod) {
            log('[VARIANCE DRILL-DOWN] Missing required parameters')
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
        }

        log('[VARIANCE DRILL-DOWN] Fetching for account:', { accountId, accountName, currentPeriod, priorPeriod })

        // If no account ID, try to look it up from Chart of Accounts
        let finalAccountId = accountId
        if (!finalAccountId && accountName) {
            log('[VARIANCE DRILL-DOWN] No account ID, looking up from Chart of Accounts...')
            finalAccountId = await lookupAccountId(orgId, accountName)
            log('[VARIANCE DRILL-DOWN] Lookup result:', finalAccountId)
        }

        if (!finalAccountId) {
            log('[VARIANCE DRILL-DOWN] Could not find account ID for:', accountName)
            return NextResponse.json({
                currentPeriod: {
                    date: currentPeriod,
                    balance: 0,
                    transactions: []
                },
                priorPeriod: {
                    date: priorPeriod,
                    balance: 0,
                    transactions: []
                },
                message: `Could not find QBO Account ID for "${accountName}"`
            })
        }

        // Fetch transactions for both periods
        const [currentTxns, priorTxns] = await Promise.all([
            fetchTransactionsForPeriod(orgId, finalAccountId, currentPeriod),
            fetchTransactionsForPeriod(orgId, finalAccountId, priorPeriod)
        ])

        log('[VARIANCE DRILL-DOWN] Results:', {
            currentCount: currentTxns.transactions.length,
            priorCount: priorTxns.transactions.length,
            currentBalance: currentTxns.netChange,
            priorBalance: priorTxns.netChange
        })

        return NextResponse.json({
            currentPeriod: {
                date: currentPeriod,
                balance: currentTxns.netChange || 0,
                transactions: currentTxns.transactions
            },
            priorPeriod: {
                date: priorPeriod,
                balance: priorTxns.netChange || 0,
                transactions: priorTxns.transactions
            }
        })
    } catch (error: any) {
        log('[VARIANCE DRILL-DOWN] Error:', error.message)
        return NextResponse.json({
            error: error.message,
            currentPeriod: { date: '', balance: 0, transactions: [] },
            priorPeriod: { date: '', balance: 0, transactions: [] }
        }, { status: 500 })
    }
}

async function lookupAccountId(orgId: string, accountName: string): Promise<string | null> {
    try {
        log('[VARIANCE DRILL-DOWN] Querying Chart of Accounts for:', accountName)

        const accountsData = await qboFetchForOrg(orgId, '/query', {
            query: `SELECT Id, Name, FullyQualifiedName FROM Account WHERE Name='${accountName.replace(/'/g, "\\'")}' MAXRESULTS 1`,
            minorversion: '65',
        })

        const accounts = accountsData?.QueryResponse?.Account
        const account = Array.isArray(accounts) ? accounts[0] : accounts

        if (account?.Id) {
            log('[VARIANCE DRILL-DOWN] Found account:', { id: account.Id, name: account.Name })
            return account.Id
        }

        // Try case-insensitive search
        const accountsDataCaseInsensitive = await qboFetchForOrg(orgId, '/query', {
            query: 'SELECT Id, Name, FullyQualifiedName FROM Account MAXRESULTS 1000',
            minorversion: '65',
        })

        const allAccounts = accountsDataCaseInsensitive?.QueryResponse?.Account
        const accountsArray = Array.isArray(allAccounts) ? allAccounts : (allAccounts ? [allAccounts] : [])

        const match = accountsArray.find((acct: any) =>
            acct.Name?.toUpperCase() === accountName.toUpperCase()
        )

        if (match?.Id) {
            log('[VARIANCE DRILL-DOWN] Found account (case-insensitive):', { id: match.Id, name: match.Name })
            return match.Id
        }

        log('[VARIANCE DRILL-DOWN] No matching account found')
        return null
    } catch (error: any) {
        log('[VARIANCE DRILL-DOWN] Error looking up account:', error.message)
        return null
    }
}

async function fetchTransactionsForPeriod(orgId: string, accountId: string, periodEnd: string) {
    try {
        // Calculate period start (first day of the month)
        const endDate = new Date(periodEnd)
        const startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
        const periodStart = startDate.toISOString().split('T')[0]

        log('[VARIANCE DRILL-DOWN] Calling QBO GeneralLedger:', {
            accountId,
            from: periodStart,
            to: periodEnd
        })

        // Fetch GeneralLedger report directly from QBO
        const glData = await qboFetchForOrg(orgId, '/reports/GeneralLedger', {
            start_date: periodStart,
            end_date: periodEnd,
            account: accountId,
            minorversion: '65',
        })

        log('[VARIANCE DRILL-DOWN] QBO response received, parsing...')

        // Parse transactions from the GeneralLedger report
        const transactions = parseGeneralLedgerTransactions(glData)
        const netChange = transactions.reduce((sum, t) => sum + t.amount, 0)

        log('[VARIANCE DRILL-DOWN] Parsed transactions:', {
            count: transactions.length,
            netChange
        })

        return { transactions, netChange }
    } catch (error: any) {
        log(`[VARIANCE DRILL-DOWN] Error fetching for account ${accountId}:`, error.message)
        return { transactions: [], netChange: 0 }
    }
}

function parseGeneralLedgerTransactions(glData: any): Array<{
    date: string
    description: string
    debit: number | null
    credit: number | null
    amount: number
}> {
    const transactions: any[] = []

    try {
        const rows = glData?.Rows?.Row || []
        log('[VARIANCE DRILL-DOWN] Parsing GL data, rows count:', Array.isArray(rows) ? rows.length : (rows ? 1 : 0))

        // Helper to extract row data
        function extractRows(rows: any[]): void {
            for (const row of rows) {
                if (row.type === 'Section') {
                    // Recurse into section rows
                    extractRows(row?.Rows?.Row || [])
                } else if (row.type === 'Data') {
                    const cols = row.ColData || []

                    // GeneralLedger columns: Date, Transaction Type, Num, Name, Memo/Description, Split, Amount, Balance
                    const date = cols[0]?.value || ''
                    const txnType = cols[1]?.value || ''
                    const num = cols[2]?.value || ''
                    const name = cols[3]?.value || ''
                    const memo = cols[4]?.value || ''
                    const amountStr = cols[6]?.value || ''

                    const amount = amountStr ? parseFloat(amountStr.replace(/[^0-9.-]/g, '')) : 0

                    // Build description
                    const description = [txnType, num, name, memo]
                        .filter(Boolean)
                        .join(' - ')
                        .substring(0, 100) || 'Transaction'

                    if (date && amount !== 0) {
                        transactions.push({
                            date,
                            description,
                            debit: amount > 0 ? amount : null,
                            credit: amount < 0 ? Math.abs(amount) : null,
                            amount
                        })
                    }
                }
            }
        }

        extractRows(Array.isArray(rows) ? rows : [rows])
    } catch (error) {
        console.error('[VARIANCE DRILL-DOWN] Error parsing transactions:', error)
    }

    return transactions
}
