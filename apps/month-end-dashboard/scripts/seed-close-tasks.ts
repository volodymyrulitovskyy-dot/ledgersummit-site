/**
 * Seed script to populate typical month-end close activities for a 5-day close cycle
 * Run this with: npx tsx scripts/seed-close-tasks.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    // Get org ID from command line or use default
    const orgId = process.argv[2] || '48587219-8c9a-4828-a172-8f26c382a91b'

    // Get period dates - default to current month
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1 // January = 1
    const rangeFromDate = new Date(year, month - 1, 1) // First day of month
    const rangeToDate = new Date(year, month, 0) // Last day of month

    console.log(`Populating tasks for org: ${orgId}`)
    console.log(`Period: ${rangeFromDate.toISOString().split('T')[0]} to ${rangeToDate.toISOString().split('T')[0]}`)

    // Delete existing tasks for this period
    await prisma.closeTask.deleteMany({
        where: {
            org_id: orgId,
            range_from_date: rangeFromDate,
            range_to_date: rangeToDate,
        },
    })

    // Typical 5-day close activities
    const tasks = [
        // Day 1 - Month End (Workday 1)
        {
            title: 'Close All Subledgers',
            description: 'Ensure all subledgers (AR, AP, Inventory, Fixed Assets) are closed and reconciled',
            dueType: 'workday' as const,
            dueWorkdayN: 1,
            dueWorkdayAnchor: 'month_end' as const,
            priority: 'high' as const,
            ownerName: 'Controller',
        },
        {
            title: 'Record Payroll Accruals',
            description: 'Calculate and record payroll accruals for the period',
            dueType: 'workday' as const,
            dueWorkdayN: 1,
            dueWorkdayAnchor: 'month_end' as const,
            priority: 'high' as const,
            ownerName: 'Payroll Manager',
        },
        {
            title: 'Bank Reconciliations',
            description: 'Reconcile all bank accounts to month-end statements',
            dueType: 'workday' as const,
            dueWorkdayN: 1,
            dueWorkdayAnchor: 'month_end' as const,
            priority: 'high' as const,
            ownerName: 'Senior Accountant',
        },
        {
            title: 'Record Depreciation',
            description: 'Calculate and record monthly depreciation expense',
            dueType: 'workday' as const,
            dueWorkdayN: 1,
            dueWorkdayAnchor: 'month_end' as const,
            priority: 'normal' as const,
            ownerName: 'Fixed Assets Accountant',
        },

        // Day 2 - Workday 2
        {
            title: 'Complete All Journal Entries',
            description: 'Post all standard and non-standard journal entries for the period',
            dueType: 'workday' as const,
            dueWorkdayN: 2,
            dueWorkdayAnchor: 'month_end' as const,
            priority: 'high' as const,
            ownerName: 'Controller',
        },
        {
            title: 'Reconcile Intercompany Accounts',
            description: 'Reconcile all intercompany balances and resolve differences',
            dueType: 'workday' as const,
            dueWorkdayN: 2,
            dueWorkdayAnchor: 'month_end' as const,
            priority: 'high' as const,
            ownerName: 'Senior Accountant',
        },
        {
            title: 'Review Prepaid/Accrual Schedules',
            description: 'Review and update all prepaid and accrual schedules',
            dueType: 'workday' as const,
            dueWorkdayN: 2,
            dueWorkdayAnchor: 'month_end' as const,
            priority: 'normal' as const,
            ownerName: 'Staff Accountant',
        },
        {
            title: 'Revenue Recognition Review',
            description: 'Review revenue recognition and ensure compliance with ASC 606',
            dueType: 'workday' as const,
            dueWorkdayN: 2,
            dueWorkdayAnchor: 'month_end' as const,
            priority: 'high' as const,
            ownerName: 'Revenue Accountant',
        },

        // Day 3 - Workday 3
        {
            title: 'Complete Balance Sheet Reconciliations',
            description: 'Reconcile all balance sheet accounts and resolve discrepancies',
            dueType: 'workday' as const,
            dueWorkdayN: 3,
            dueWorkdayAnchor: 'month_end' as const,
            priority: 'high' as const,
            ownerName: 'Controller',
        },
        {
            title: 'Flux Analysis - Income Statement',
            description: 'Perform variance analysis on P&L vs budget and prior period',
            dueType: 'workday' as const,
            dueWorkdayN: 3,
            dueWorkdayAnchor: 'month_end' as const,
            priority: 'high' as const,
            ownerName: 'FP&A Analyst',
        },
        {
            title: 'Review A/R Aging',
            description: 'Review accounts receivable aging and ensure proper bad debt reserves',
            dueType: 'workday' as const,
            dueWorkdayN: 3,
            dueWorkdayAnchor: 'month_end' as const,
            priority: 'normal' as const,
            ownerName: 'AR Manager',
        },
        {
            title: 'Inventory Reconciliation',
            description: 'Reconcile inventory subledger to general ledger',
            dueType: 'workday' as const,
            dueWorkdayN: 3,
            dueWorkdayAnchor: 'month_end' as const,
            priority: 'normal' as const,
            ownerName: 'Cost Accountant',
        },

        // Day 4 - Workday 4
        {
            title: 'Financial Statements - Draft',
            description: 'Prepare draft financial statements (Balance Sheet, P&L, Cash Flow)',
            dueType: 'workday' as const,
            dueWorkdayN: 4,
            dueWorkdayAnchor: 'month_end' as const,
            priority: 'high' as const,
            ownerName: 'Controller',
        },
        {
            title: 'Management Commentary Draft',
            description: 'Prepare draft management commentary for financial results',
            dueType: 'workday' as const,
            dueWorkdayN: 4,
            dueWorkdayAnchor: 'month_end' as const,
            priority: 'high' as const,
            ownerName: 'CFO',
        },
        {
            title: 'Review Key Metrics & KPIs',
            description: 'Calculate and review key performance indicators and metrics',
            dueType: 'workday' as const,
            dueWorkdayN: 4,
            dueWorkdayAnchor: 'month_end' as const,
            priority: 'normal' as const,
            ownerName: 'FP&A Manager',
        },
        {
            title: 'Tax Provision Calculation',
            description: 'Calculate monthly tax provision and reconcile tax accounts',
            dueType: 'workday' as const,
            dueWorkdayN: 4,
            dueWorkdayAnchor: 'month_end' as const,
            priority: 'normal' as const,
            ownerName: 'Tax Accountant',
        },

        // Day 5 - Workday 5 (Final Review)
        {
            title: 'Final Review - Financial Statements',
            description: 'CFO final review and approval of financial statements',
            dueType: 'workday' as const,
            dueWorkdayN: 5,
            dueWorkdayAnchor: 'month_end' as const,
            priority: 'high' as const,
            ownerName: 'CFO',
        },
        {
            title: 'Board Package Preparation',
            description: 'Compile board package with financials, commentary, and KPIs',
            dueType: 'workday' as const,
            dueWorkdayN: 5,
            dueWorkdayAnchor: 'month_end' as const,
            priority: 'high' as const,
            ownerName: 'Controller',
        },
        {
            title: 'Close Books in ERP',
            description: 'Perform hard close in ERP system to lock the period',
            dueType: 'workday' as const,
            dueWorkdayN: 5,
            dueWorkdayAnchor: 'month_end' as const,
            priority: 'high' as const,
            ownerName: 'Controller',
        },
        {
            title: 'Distribute Financial Reports',
            description: 'Distribute final financial reports to all stakeholders',
            dueType: 'workday' as const,
            dueWorkdayN: 5,
            dueWorkdayAnchor: 'month_end' as const,
            priority: 'normal' as const,
            ownerName: 'Senior Accountant',
        },
    ]

    console.log(`Creating ${tasks.length} tasks...`)

    for (const task of tasks) {
        await prisma.closeTask.create({
            data: {
                org_id: orgId,
                range_from_date: rangeFromDate,
                range_to_date: rangeToDate,
                title: task.title,
                description: task.description,
                owner_name: task.ownerName,
                due_type: task.dueType,
                due_workday_n: task.dueWorkdayN,
                due_workday_anchor: task.dueWorkdayAnchor,
                priority: task.priority,
                status: 'open',
                computed_due_date: null, // Will be computed by the app
            },
        })
    }

    console.log('✅ Successfully created all tasks!')
    console.log('\nTasks created:')
    tasks.forEach((task, i) => {
        console.log(`  ${i + 1}. ${task.title} (Day ${task.dueWorkdayN}, ${task.priority} priority)`)
    })
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
