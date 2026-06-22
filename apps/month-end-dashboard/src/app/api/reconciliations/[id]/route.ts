import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { ensureUser } from '@/lib/auth/ensureUser'

export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        await ensureUser()
        const params = await context.params

        const body = await req.json()
        const { status, reconciled_by, reconciled_at, notes, balance_per_books, balance_per_bank } = body

        const updates: string[] = []
        const values: any[] = []
        let paramIndex = 1

        if (status !== undefined) {
            updates.push(`status = $${paramIndex++}`)
            values.push(status)
        }
        if (reconciled_by !== undefined) {
            updates.push(`reconciled_by = $${paramIndex++}`)
            values.push(reconciled_by)
        }
        if (reconciled_at !== undefined) {
            updates.push(`reconciled_at = $${paramIndex++}::timestamptz`)
            values.push(reconciled_at)
        }
        if (notes !== undefined) {
            updates.push(`notes = $${paramIndex++}`)
            values.push(notes)
        }
        if (balance_per_books !== undefined) {
            updates.push(`balance_per_books = $${paramIndex++}::decimal`)
            values.push(balance_per_books)
        }
        if (balance_per_bank !== undefined) {
            updates.push(`balance_per_bank = $${paramIndex++}::decimal`)
            values.push(balance_per_bank)
        }

        if (updates.length === 0) {
            return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
        }

        updates.push(`updated_at = NOW()`)
        values.push(params.id)

        const query = `
      UPDATE med2.reconciliations
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}::uuid
      RETURNING *
    `

        const result = await prisma.$queryRawUnsafe(query, ...values)

        return NextResponse.json({ reconciliation: result })
    } catch (error: any) {
        console.error('Error updating reconciliation:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function DELETE(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        await ensureUser()
        const params = await context.params

        await prisma.$queryRaw`
      DELETE FROM med2.reconciliations
      WHERE id = ${params.id}::uuid
    `

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error deleting reconciliation:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
