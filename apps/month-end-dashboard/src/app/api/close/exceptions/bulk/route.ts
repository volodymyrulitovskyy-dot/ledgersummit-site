import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { revalidatePath } from 'next/cache'
import { getCurrentAppUser } from '@/lib/auth/appUser'

export async function PATCH(req: Request) {
  try {
    const appUser = await getCurrentAppUser()
    if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!appUser.is_active) return NextResponse.json({ error: 'User disabled' }, { status: 403 })

    const body = await req.json()
    const { ids, owner_name, owner_user_id, status, comment, resolved_reason } = body || {}
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'No ids provided' }, { status: 400 })
    }

    const isAdmin = appUser.role === 'admin'
    if (!isAdmin && (owner_name !== undefined || owner_user_id !== undefined)) {
      return NextResponse.json({ error: 'Owner changes require admin' }, { status: 403 })
    }

    if (!isAdmin) {
      const countOwned = await prisma.exception.count({
        where: { id: { in: ids }, owner_user_id: appUser.id },
      })
      if (countOwned !== ids.length) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const updateData: any = {}
    if (owner_name !== undefined) updateData.owner_name = owner_name || null
    if (owner_user_id !== undefined) updateData.owner_user_id = owner_user_id || null
    if (status !== undefined) {
      updateData.status = status
      if (status === 'resolved') {
        if (!resolved_reason || !resolved_reason.trim()) {
          return NextResponse.json({ error: 'Resolved reason required' }, { status: 400 })
        }
        updateData.resolved_reason = resolved_reason.trim()
        updateData.resolved_at = new Date()
        if (!comment || !comment.trim()) {
          const existingWithComments = await prisma.exception.count({
            where: { id: { in: ids }, comments: { some: {} } },
          })
          if (existingWithComments === 0) {
            return NextResponse.json({ error: 'Comment required when resolving' }, { status: 400 })
          }
        }
      } else {
        updateData.resolved_reason = null
        updateData.resolved_at = null
      }
    }

    await prisma.exception.updateMany({
      where: { id: { in: ids } },
      data: updateData,
    })

    if (comment && comment.trim()) {
      const exceptions = await prisma.exception.findMany({
        where: { id: { in: ids } },
        select: { id: true, org_id: true },
      })
      await prisma.exceptionComment.createMany({
        data: exceptions.map((ex) => ({
          exception_id: ex.id,
          org_id: ex.org_id,
          user_id: appUser.id,
          user_email: appUser.email ?? null,
          text: comment.trim(),
        })),
        skipDuplicates: true,
      })
    }

    revalidatePath('/close')
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[BULK_EXCEPTION_ERROR]', error)
    return NextResponse.json({ error: error.message || 'Failed to update exceptions' }, { status: 500 })
  }
}
