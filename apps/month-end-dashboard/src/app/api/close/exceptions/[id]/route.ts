import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { revalidatePath } from 'next/cache'
import { getCurrentAppUser } from '@/lib/auth/appUser'

export async function PATCH(request: NextRequest) {
  try {
    console.log("[PATCH_HIT]", request.method, request.url)
    const appUser = await getCurrentAppUser()
    console.log("[PATCH_AUTH]", { hasUser: !!appUser, email: appUser?.email, role: appUser?.role })
    if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!appUser.is_active) return NextResponse.json({ error: 'User disabled' }, { status: 403 })

    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)
    const exceptionId = parts[parts.indexOf('exceptions') + 1] ?? null
    if (!exceptionId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const body = await request.json()
    console.log("[PATCH_BODY]", JSON.stringify(body, null, 2))

    const exception = await prisma.exception.findUnique({
      where: { id: exceptionId },
      include: { comments: { select: { id: true } } },
    })
    if (!exception) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const updateData: any = {}

    const isAdmin = appUser.role === 'admin'
    const isOwner = (exception.owner_user_id || '') === appUser.id

    if (!isAdmin) {
      if (!isOwner) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (body.owner_user_id !== undefined || body.owner_name !== undefined || body.assignToMe) {
        return NextResponse.json({ error: 'Owner changes require admin' }, { status: 403 })
      }
    }

    if (body.owner_user_id !== undefined) {
      updateData.owner_user_id = body.owner_user_id || null
      updateData.owner_name = body.owner_name || null
    } else if (body.assignToMe) {
      updateData.owner_user_id = appUser.id
      updateData.owner_name = appUser.email
    }

    if (body.status !== undefined) {
      updateData.status = body.status
      if (body.status === 'resolved') {
        if (!body.resolved_reason || !body.resolved_reason.trim()) {
          return NextResponse.json({ error: 'Resolved reason required' }, { status: 400 })
        }
        const hasComment = body.comment && body.comment.trim()
        const hasExisting = exception.comments.length > 0
        if (!hasComment && !hasExisting) {
          return NextResponse.json({ error: 'Comment required when resolving' }, { status: 400 })
        }
        updateData.resolved_reason = body.resolved_reason.trim()
        updateData.resolved_at = new Date()
        if (hasComment) {
          await prisma.exceptionComment.create({
            data: {
              exception_id: exceptionId,
              org_id: exception.org_id,
              user_id: appUser.id,
              user_email: appUser.email,
              text: body.comment.trim(),
            },
          })
        }
      } else {
        updateData.resolved_reason = null
        updateData.resolved_at = null
      }
    }

    if (body.resolved_reason !== undefined) {
      updateData.resolved_reason = body.resolved_reason || null
      if (body.resolved_reason && body.status === 'resolved' && !updateData.resolved_at) {
        updateData.resolved_at = new Date()
      }
    }

    if (body.owner_name !== undefined && body.owner_user_id === undefined) {
      updateData.owner_name = body.owner_name || null
    }

    console.log("[PATCH_UPDATE_DATA]", JSON.stringify(updateData, null, 2))

    const updated = await prisma.exception.update({
      where: { id: exceptionId },
      data: updateData,
      select: {
        id: true,
        status: true,
        resolved_at: true,
        resolved_reason: true,
        owner_name: true,
        owner_user_id: true,
        snapshot_id: true,
        org_id: true,
        severity: true,
      },
    })
    console.log("[PATCH_UPDATED]", updated)

    revalidatePath('/close')
    return NextResponse.json({ success: true, exception: updated })
  } catch (error: any) {
    console.error('[PATCH_EXCEPTION_ERROR]', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update exception' },
      { status: 500 }
    )
  }
}
