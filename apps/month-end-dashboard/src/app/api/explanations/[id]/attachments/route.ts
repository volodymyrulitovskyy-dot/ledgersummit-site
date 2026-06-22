import { NextRequest, NextResponse } from 'next/server'
import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { prisma } from '@/lib/db/prisma'

/**
 * POST /api/explanations/[id]/attachments - Upload attachment to explanation
 * 
 * Note: This is a simplified implementation. In production, you'd want to:
 * - Upload to S3/Cloud Storage
 * - Generate signed URLs
 * - Handle file size limits
 * - Validate file types
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureUserApi()

    const { id } = await params

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

    // If period exists and is locked (status = 'locked' or 'closed'), prevent adding attachments
    if (period && (period.status === 'locked' || period.status === 'closed')) {
      return NextResponse.json(
        { error: 'Period is locked. Attachments cannot be added.' },
        { status: 403 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // For now, we'll store a placeholder URL
    // In production, upload to S3/Cloud Storage and get the actual URL
    const filename = file.name
    const url = `/api/explanations/${id}/attachments/${filename}` // Placeholder

    // Create attachment record
    const attachment = await prisma.explanationAttachment.create({
      data: {
        explanation_id: id,
        filename,
        url,
      },
    })

    return NextResponse.json({
      ok: true,
      attachment: {
        id: attachment.id,
        explanation_id: attachment.explanation_id,
        filename: attachment.filename,
        url: attachment.url,
        uploaded_at: attachment.uploaded_at.toISOString(),
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
      { error: err.message || 'Failed to upload attachment' },
      { status: 500 }
    )
  }
}

