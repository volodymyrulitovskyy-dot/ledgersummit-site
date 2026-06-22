import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { ensureUser } from '@/lib/auth/ensureUser'

export async function GET(req: NextRequest) {
    try {
        await ensureUser()

        const { searchParams } = new URL(req.url)
        const orgId = searchParams.get('org_id')
        const currentPeriod = searchParams.get('current_period')
        const priorPeriod = searchParams.get('prior_period')
        const threshold = parseFloat(searchParams.get('threshold') || '1000')

        if (!orgId || !currentPeriod || !priorPeriod) {
            return NextResponse.json({ error: 'org_id, current_period, and prior_period required' }, { status: 400 })
        }

        // Get TB snapshots for both periods
        const [currentSnapshot, priorSnapshot] = await Promise.all([
            prisma.tbSnapshot.findFirst({
                where: { org_id: orgId, range_to_date: new Date(currentPeriod) },
                include: { tb_lines: true },
            }),
            prisma.tbSnapshot.findFirst({
                where: { org_id: orgId, range_to_date: new Date(priorPeriod) },
                include: { tb_lines: true },
            }),
        ])

        if (!currentSnapshot || !priorSnapshot) {
            return NextResponse.json({ error: 'Trial balance not found for one or both periods' }, { status: 404 })
        }

        // Build account maps with balance and account_number (QBO account ID)
        const currentMap = new Map<string, { balance: number; account_number: string | null }>()
        const priorMap = new Map<string, { balance: number; account_number: string | null }>()

        for (const line of currentSnapshot.tb_lines) {
            const key = line.account_name.trim().toUpperCase()
            const balance = typeof line.balance === 'number' ? line.balance : parseFloat(String(line.balance))
            currentMap.set(key, { balance, account_number: line.account_number })
        }

        for (const line of priorSnapshot.tb_lines) {
            const key = line.account_name.trim().toUpperCase()
            const balance = typeof line.balance === 'number' ? line.balance : parseFloat(String(line.balance))
            priorMap.set(key, { balance, account_number: line.account_number })
        }

        // Calculate variances
        const variances: any[] = []
        const allAccounts = new Set([...currentMap.keys(), ...priorMap.keys()])

        for (const accountKey of allAccounts) {
            const currentData = currentMap.get(accountKey)
            const priorData = priorMap.get(accountKey)
            const currentBalance = currentData?.balance || 0
            const priorBalance = priorData?.balance || 0
            const varianceAmount = currentBalance - priorBalance

            // Use account_number from current period, fallback to prior period
            const accountId = currentData?.account_number || priorData?.account_number || null

            if (Math.abs(varianceAmount) >= threshold) {
                const variancePercent = priorBalance !== 0
                    ? (varianceAmount / Math.abs(priorBalance)) * 100
                    : 100

                variances.push({
                    id: `${orgId}-${accountKey}-${currentPeriod}`,
                    account_name: accountKey,
                    account_number: accountId, // Include QBO account ID for drill-down
                    current_balance: currentBalance,
                    prior_balance: priorBalance,
                    variance_amount: varianceAmount,
                    variance_percent: variancePercent,
                })
            }
        }

        // Sort by absolute variance descending
        variances.sort((a, b) => Math.abs(b.variance_amount) - Math.abs(a.variance_amount))

        return NextResponse.json({ variances })
    } catch (error: any) {
        console.error('Error calculating variances:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
