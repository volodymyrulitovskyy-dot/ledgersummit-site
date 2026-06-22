import { Request } from 'next/server'
import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { prisma } from '@/lib/db/prisma'
import { getUser } from '@/lib/auth/getUser'

/**
 * POST /api/explanations/[id]/comments - Add comment to explanation
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log("[EXPL-COMMENT] POST", { id: (await params).id });

    // Optional dev-only bypass (only in dev)
    const devBypass =
      process.env.NODE_ENV !== "production" &&
      req.headers.get("x-dev-bypass") === process.env.DEV_BYPASS_TOKEN;

    if (!devBypass) {
      try {
        await ensureUserApi()
      } catch (e: any) {
        if (e?.message === 'UNAUTHORIZED') {
          return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
        }
        throw e;
      }
    }

    const { id } = await params
    const body = await req.json().catch(() => ({ _err: "bad json" }))
    
    if ('_err' in body) {
      return Response.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    // Support both 'text' and 'body' for backward compatibility
    const commentText = body.text || body.body

    if (!commentText || typeof commentText !== 'string' || !commentText.trim()) {
      return Response.json(
        { error: 'Missing required field: text or body' },
        { status: 400 }
      )
    }

    // Get explanation to verify org access
    const explanation = await prisma.Explanation.findUnique({
      where: { id },
    })

    if (!explanation) {
      return Response.json({ error: 'Explanation not found' }, { status: 404 })
    }

    // Verify org access
    if (!devBypass) {
      try {
        await ensureOrgAccessApi(explanation.orgId)
      } catch (e: any) {
        if (e?.message === 'UNAUTHORIZED') {
          return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
        }
        if (e?.message === 'FORBIDDEN') {
          return Response.json({ error: "FORBIDDEN" }, { status: 403 });
        }
        throw e;
      }
    }

    // Check if period is locked (immutable history rule)
    // periodEnd is a DateTime field, parse it safely
    const periodEndDate = explanation.periodEnd instanceof Date 
      ? explanation.periodEnd 
      : new Date(explanation.periodEnd)
    
    if (!periodEndDate || isNaN(periodEndDate.getTime())) {
      return Response.json(
        { error: 'Invalid period date in explanation' },
        { status: 500 }
      )
    }

    const year = periodEndDate.getFullYear()
    const month = periodEndDate.getMonth() + 1
    
    const period = await prisma.Period.findFirst({
      where: {
        org_id: explanation.orgId,
        year,
        month,
      },
    })

    // If period exists and is locked (status = 'locked' or 'closed'), prevent adding comments
    if (period && (period.status === 'locked' || period.status === 'closed')) {
      return Response.json(
        { error: 'Period is locked. Comments cannot be added.' },
        { status: 403 }
      )
    }

    // Get user email for author (for response only - not stored in DB yet)
    const userData = devBypass ? null : await getUser()

    // Create comment
    const comment = await prisma.ExplanationComment.create({
      data: {
        explanationId: id,
        text: commentText.trim(),
      },
    })

    return Response.json({
      ok: true,
      comment: {
        id: comment.id,
        explanation_id: comment.explanationId,
        explanationId: comment.explanationId,
        body: comment.text,
        text: comment.text,
        author: userData?.email || 'Unknown',
        created_at: new Date().toISOString(), // Not stored in DB yet, generate timestamp
      },
    })
  } catch (e: any) {
    console.error("[EXPL-COMMENT] POST error", e);
    // Handle auth errors (safety net - should already be handled above)
    if (e?.message === 'UNAUTHORIZED') {
      return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    if (e?.message === 'FORBIDDEN') {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    return Response.json(
      { error: String(e?.message || e) },
      { status: 500 }
    )
  }
}

