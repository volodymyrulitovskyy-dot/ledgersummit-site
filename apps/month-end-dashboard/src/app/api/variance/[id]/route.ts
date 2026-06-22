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
        const { explanation } = body

        // For now, store in a simple table or return success
        // In production, you'd save to variance_details table

        return NextResponse.json({ success: true, explanation })
    } catch (error: any) {
        console.error('Error saving variance explanation:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
