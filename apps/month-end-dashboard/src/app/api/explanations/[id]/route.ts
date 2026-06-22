import { NextRequest, NextResponse } from 'next/server'
import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { prisma } from '@/lib/db/prisma'

/**
 * PUT /api/explanations/[id] - Update explanation status
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureUserApi()

    const { id } = await params
    const body = await request.json()
    const { status } = body

    if (!status) {
      return NextResponse.json(
        { error: 'Missing required field: status' },
        { status: 400 }
      )
    }

    // Get explanation to verify org access
    const explanation = await prisma.explanation.findUnique({
      where: { id },
    })

    if (!explanation) {
      return NextResponse.json({ error: 'Explanation not found' }, { status: 404 })
    }

    // Verify org access
    await ensureOrgAccessApi(explanation.org_id)

    // Check if period is locked (immutable history rule)
    const periodDate = explanation.period
    const year = periodDate.getFullYear()
    const month = periodDate.getMonth() + 1
    
    const period = await prisma.period.findFirst({
      where: {
        org_id: explanation.org_id,
        year,
        month,
      },
    })

    // If period exists and is locked (status = 'locked' or 'closed'), prevent updates
    if (period && (period.status === 'locked' || period.status === 'closed')) {
      return NextResponse.json(
        { error: 'Period is locked. Explanations cannot be modified.' },
        { status: 403 }
      )
    }

    // Update explanation
    const updated = await prisma.explanation.update({
      where: { id },
      data: { status },
      include: {
        explanation_comments: {
          orderBy: { created_at: 'asc' },
        },
        explanation_attachments: {
          orderBy: { uploaded_at: 'desc' },
        },
      },
    })

    return NextResponse.json({
      ok: true,
      explanation: {
        id: updated.id,
        org_id: updated.org_id,
        period: updated.period.toISOString().split('T')[0],
        account_id: updated.account_id,
        rule_id: updated.rule_id,
        status: updated.status,
        created_at: updated.created_at.toISOString(),
        updated_at: updated.updated_at.toISOString(),
        comments: updated.explanation_comments.map((c) => ({
          id: c.id,
          explanation_id: c.explanation_id,
          author: c.author,
          body: c.body,
          created_at: c.created_at.toISOString(),
        })),
        attachments: updated.explanation_attachments.map((a) => ({
          id: a.id,
          explanation_id: a.explanation_id,
          filename: a.filename,
          url: a.url,
          uploaded_at: a.uploaded_at.toISOString(),
        })),
      },
    })
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (err.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json(
      { error: err.message || 'Failed to update explanation' },
      { status: 500 }
    )
  }
}

