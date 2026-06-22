import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { ensureUser } from '@/lib/auth/ensureUser'

export async function GET(req: NextRequest) {
    try {
        await ensureUser()

        const { searchParams } = new URL(req.url)
        const orgId = searchParams.get('org_id')
        const periodEnd = searchParams.get('period_end')

        if (!orgId) {
            return NextResponse.json({ error: 'org_id required' }, { status: 400 })
        }

        const where: any = { org_id: orgId }
        if (periodEnd) {
            where.period_end = new Date(periodEnd)
        }

        const reconciliations = await prisma.$queryRawUnsafe(`
      SELECT * FROM med2.reconciliations
      WHERE org_id = $1::uuid
      ${periodEnd ? `AND period_end = $2::date` : ''}
      ORDER BY created_at DESC
    `, orgId, ...(periodEnd ? [periodEnd] : []))

        return NextResponse.json({ reconciliations })
    } catch (error: any) {
        console.error('Error fetching reconciliations:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        await ensureUser()

        const body = await req.json()
        const {
            org_id,
            account_name,
            account_number,
            period_end,
            balance_per_books,
            balance_per_bank,
            variance,
            status = 'pending',
            notes,
        } = body

        if (!org_id || !account_name || !period_end) {
            return NextResponse.json(
                { error: 'org_id, account_name, and period_end are required' },
                { status: 400 }
            )
        }

        const result = await prisma.$queryRaw`
      INSERT INTO med2.reconciliations (
        org_id, account_name, account_number, period_end,
        balance_per_books, balance_per_bank, variance, status, notes
      ) VALUES (
        ${org_id}::uuid, ${account_name}, ${account_number},
        ${period_end}::date, ${balance_per_books}::decimal,
        ${balance_per_bank}::decimal, ${variance}::decimal,
        ${status}, ${notes}
      )
      RETURNING *
    `

        return NextResponse.json({ reconciliation: result }, { status: 201 })
    } catch (error: any) {
        console.error('Error creating reconciliation:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
