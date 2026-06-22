/**
 * Seed script to create sample trial balance data for November 2025
 * Run with: npx tsx scripts/seed-trial-balance.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    // Get org ID from command line or use default
    const orgId = process.argv[2] || '48587219-8c9a-4828-a172-8f26c382a91b'

    console.log(`Creating trial balance for org: ${orgId}`)
    console.log('Period: November 2025 (2025-11-01 to 2025-11-30)')

    // Sample trial balance accounts with realistic balances
    const accounts = [
        // Assets
        { name: 'Cash', number: '1010', type: 'Bank', balance: 45230.50 },
        { name: 'Accounts Receivable (A/R)', number: '84', type: 'Accounts Receivable', balance: 3107.52 },
        { name: 'Undeposited Funds', number: '1200', type: 'Other Current Asset', balance: 2062.52 },
        { name: 'Inventory Asset', number: '1300', type: 'Other Current Asset', balance: 15420.00 },
        { name: 'Prepaid Expenses', number: '1400', type: 'Other Current Asset', balance: 3200.00 },
        { name: 'Equipment', number: '1500', type: 'Fixed Asset', balance: 25000.00 },
        { name: 'Accumulated Depreciation', number: '1510', type: 'Fixed Asset', balance: -5000.00 },

        // Liabilities
        { name: 'Accounts Payable (A/P)', number: '2000', type: 'Accounts Payable', balance: -8450.25 },
        { name: 'Loan Payable', number: '2100', type: 'Long Term Liability', balance: -4000.00 },
        { name: 'Credit Card', number: '2200', type: 'Credit Card', balance: -1250.75 },

        // Equity
        { name: 'Opening Balance Equity', number: '3000', type: 'Equity', balance: -50000.00 },
        { name: 'Retained Earnings', number: '3100', type: 'Equity', balance: -15000.00 },

        // Income
        { name: 'Design Income', number: '4000', type: 'Income', balance: -12500.00 },
        { name: 'Sales', number: '4100', type: 'Income', balance: -8200.00 },
        { name: 'Services', number: '4200', type: 'Income', balance: -5300.00 },

        // Expenses
        { name: 'Advertising', number: '6000', type: 'Expense', balance: 850.00 },
        { name: 'Auto', number: '6100', type: 'Expense', balance: 425.50 },
        { name: 'Bank Charges', number: '6200', type: 'Expense', balance: 45.00 },
        { name: 'Meals and Entertainment', number: '6300', type: 'Expense', balance: 320.75 },
        { name: 'Office Supplies', number: '6400', type: 'Expense', balance: 280.00 },
        { name: 'Rent or Lease', number: '6500', type: 'Expense', balance: 2000.00 },
        { name: 'Repairs and Maintenance', number: '6600', type: 'Expense', balance: 450.00 },
        { name: 'Utilities', number: '6700', type: 'Expense', balance: 380.00 },
        { name: 'Payroll Expenses', number: '6800', type: 'Expense', balance: 5500.00 },
    ]

    // Create trial balance snapshot for November 2025
    const snapshot = await prisma.tbSnapshot.create({
        data: {
            org_id: orgId,
            range_from_date: new Date('2025-11-01'),
            range_to_date: new Date('2025-11-30'),
            source: 'manual_csv',
            imported_at: new Date(),
        },
    })

    console.log(`✅ Created trial balance snapshot: ${snapshot.id}`)

    // Create trial balance lines
    for (const account of accounts) {
        const debit = account.balance > 0 ? account.balance : null
        const credit = account.balance < 0 ? Math.abs(account.balance) : null

        await prisma.tbLine.create({
            data: {
                snapshot_id: snapshot.id,
                account_number: account.number,
                account_name: account.name,
                account_type: account.type,
                debit: debit,
                credit: credit,
                balance: account.balance,
                currency: 'USD',
            },
        })
    }

    console.log(`✅ Created ${accounts.length} trial balance lines`)

    // Also create for October 2025 (prior period) with slightly different balances
    const snapshotOct = await prisma.tbSnapshot.create({
        data: {
            org_id: orgId,
            range_from_date: new Date('2025-10-01'),
            range_to_date: new Date('2025-10-31'),
            source: 'manual_csv',
            imported_at: new Date(),
        },
    })

    console.log(`✅ Created October trial balance snapshot: ${snapshotOct.id}`)

    // Create October balances (slightly different for variance)
    for (const account of accounts) {
        // Reduce balances by 5-15% for prior period
        const variance = 0.85 + Math.random() * 0.1 // 85-95% of Nov balance
        const octBalance = account.balance * variance
        const debit = octBalance > 0 ? octBalance : null
        const credit = octBalance < 0 ? Math.abs(octBalance) : null

        await prisma.tbLine.create({
            data: {
                snapshot_id: snapshotOct.id,
                account_number: account.number,
                account_name: account.name,
                account_type: account.type,
                debit: debit,
                credit: credit,
                balance: octBalance,
                currency: 'USD',
            },
        })
    }

    console.log(`✅ Created ${accounts.length} October trial balance lines`)

    console.log(`\n🎉 Trial balance data created successfully!`)
    console.log(`\nYou now have trial balance data for:`)
    console.log(`  - November 2025 (${accounts.length} accounts)`)
    console.log(`  - October 2025 (${accounts.length} accounts)`)
    console.log(`\nRefresh your browser to see the charts!`)
}

main()
    .catch((e) => {
        console.error('Error:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
