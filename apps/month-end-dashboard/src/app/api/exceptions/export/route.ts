import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { ensureUser } from '@/lib/auth/ensureUser'
import * as XLSX from 'xlsx'

export async function GET(req: NextRequest) {
    try {
        await ensureUser()

        const { searchParams } = new URL(req.url)
        const orgId = searchParams.get('org_id')
        const snapshotId = searchParams.get('snapshot_id')
        const format = searchParams.get('format') || 'json'

        if (!orgId) {
            return NextResponse.json({ error: 'org_id required' }, { status: 400 })
        }

        // Get exceptions
        const where: any = { org_id: orgId }
        if (snapshotId) {
            where.snapshot_id = snapshotId
        }

        const exceptions = await prisma.exception.findMany({
            where,
            include: {
                rule: { select: { id: true, name: true, severity: true } },
            },
            orderBy: [{ severity: 'desc' }, { created_at: 'desc' }],
        })

        if (format === 'excel' || format === 'xlsx') {
            // Export to Excel
            const data = exceptions.map(ex => ({
                'Account Name': ex.account_name || '',
                'Account Number': ex.account_number || '',
                'Balance': typeof ex.balance === 'number' ? ex.balance : parseFloat(String(ex.balance || 0)),
                'Severity': ex.severity,
                'Status': ex.status,
                'Rule': ex.rule?.name || '',
                'Owner': ex.owner_name || '',
                'Title': ex.title || '',
                'Details': ex.details || '',
                'Created': ex.created_at ? new Date(ex.created_at).toLocaleDateString() : '',
            }))

            const worksheet = XLSX.utils.json_to_sheet(data)
            const workbook = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Exceptions')

            const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

            return new NextResponse(buffer, {
                headers: {
                    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'Content-Disposition': `attachment; filename="exceptions-${new Date().toISOString().split('T')[0]}.xlsx"`,
                },
            })
        }

        return NextResponse.json({ exceptions })
    } catch (error: any) {
        console.error('Error exporting exceptions:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
