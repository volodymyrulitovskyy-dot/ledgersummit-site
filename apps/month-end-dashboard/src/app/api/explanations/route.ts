import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'
import { prisma } from "@/lib/db/prisma"

/**
 * GET /api/explanations - Get explanation for org/period/account
 * POST /api/explanations - Create new explanation
 */
export async function GET(req: Request) {
  try {
    console.log("[EXPL] GET", req.url);
    
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

    const { searchParams } = new URL(req.url)

    const orgId = searchParams.get('orgId')
    const period = searchParams.get('period')
    const accountId = searchParams.get('accountId')
    const ruleId = searchParams.get('ruleId')

    if (!orgId || !period || !accountId) {
      return Response.json(
        { error: 'Missing required parameters: orgId, period, accountId' },
        { status: 400 }
      )
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) {
      return Response.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // Verify org access
    if (!devBypass) {
      try {
        await ensureOrgAccessApi(orgId)
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

    // Find Explanation by orgId, periodEnd, accountId, and optional ruleId
    // Parse period safely: convert YYYY-MM-DD to Date at end-of-day UTC
    const periodEndDate = new Date(period + 'T23:59:59.999Z')
    
    const where: any = {
      orgId: orgId,
      periodEnd: periodEndDate,
      accountId: accountId,
    }
    
    // ruleId is nullable - if provided, match it; if null, match null
    if (ruleId) {
      where.ruleId = ruleId
    } else {
      where.ruleId = null
    }

    console.log("[EXPL] querying Explanation", { where });

    // Fetch explanation by key
    const explanation = await prisma.Explanation.findFirst({
      where,
      include: {
        comments: {
          orderBy: { id: 'desc' },
          take: 20,
        },
      },
    })

    // Check if period is locked
    const periodDate = new Date(period + 'T00:00:00Z')
    const year = periodDate.getFullYear()
    const month = periodDate.getMonth() + 1
    
    const periodRecord = await prisma.Period.findFirst({
      where: {
        org_id: orgId,
        year,
        month,
      },
    })

    const isPeriodLocked = periodRecord && (periodRecord.status === 'locked' || periodRecord.status === 'closed')

    // Note: We still need to check period locked status but it requires org_id field
    // The periodRecord query uses org_id which is the database column name

    if (!explanation) {
      return Response.json(
        { error: "NOT_FOUND", message: "No explanation found" },
        { status: 404 }
      )
    }

    return Response.json({
      ok: true,
      explanation: {
        id: explanation.id,
        orgId: explanation.orgId,
        period: explanation.periodEnd.toISOString().split('T')[0],
        accountId: explanation.accountId,
        ruleId: explanation.ruleId,
        text: explanation.text,
      },
      comments: explanation.comments.map((c) => ({
        id: c.id,
        explanationId: c.explanationId,
        text: c.text,
      })),
      periodLocked: isPeriodLocked,
    })
  } catch (e: any) {
    console.error("[EXPL] GET error", e);
    // Handle auth errors (safety net - should already be handled above)
    if (e?.message === 'UNAUTHORIZED') {
      return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    if (e?.message === 'FORBIDDEN') {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("[EXPL] POST body", body);
    
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

    const { orgId, periodEnd, period, accountId, ruleId, text, comment } = body

    // Support both period and periodEnd (if period is provided, treat it as periodEnd)
    const finalPeriodEnd = periodEnd || period
    
    if (!orgId || !finalPeriodEnd || !accountId) {
      return Response.json(
        { error: 'Missing required fields: orgId, period/periodEnd, accountId' },
        { status: 400 }
      )
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(finalPeriodEnd)) {
      return Response.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // Verify org access
    if (!devBypass) {
      try {
        await ensureOrgAccessApi(orgId)
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

    // Parse period safely: convert YYYY-MM-DD to Date at end-of-day UTC
    const periodEndDate = new Date(finalPeriodEnd + 'T23:59:59.999Z')

    // Check if explanation already exists (upsert pattern)
    const where: any = {
      orgId: orgId,
      periodEnd: periodEndDate,
      accountId: accountId,
    }
    if (ruleId) {
      where.ruleId = ruleId
    } else {
      where.ruleId = null
    }

    const existing = await prisma.Explanation.findFirst({
      where,
    })

    let explanation
    if (existing) {
      // Update existing explanation
      explanation = await prisma.Explanation.update({
        where: { id: existing.id },
        data: {
          text: typeof text === 'string' ? text : existing.text,
        },
        include: {
          comments: {
            orderBy: { id: 'desc' },
            take: 20,
          },
        },
      })
    } else {
      // Create new explanation
      explanation = await prisma.Explanation.create({
        data: {
          orgId: orgId,
          periodEnd: periodEndDate,
          accountId: accountId,
          ruleId: ruleId || null,
          text: typeof text === 'string' ? text : '',
        },
        include: {
          comments: {
            orderBy: { id: 'desc' },
            take: 20,
          },
        },
      })
    }

    // Add comment if provided
    if (typeof comment === 'string' && comment.trim() && explanation) {
      await prisma.ExplanationComment.create({
        data: {
          explanationId: explanation.id,
          text: comment.trim(),
        },
      })
      
      // Reload to include new comment
      explanation = await prisma.Explanation.findUnique({
        where: { id: explanation.id },
        include: {
          comments: {
            orderBy: { id: 'desc' },
            take: 20,
          },
        },
      })!
    }

    return Response.json({
      ok: true,
      explanation: {
        id: explanation.id,
        orgId: explanation.orgId,
        period: explanation.periodEnd.toISOString().split('T')[0],
        accountId: explanation.accountId,
        ruleId: explanation.ruleId,
        text: explanation.text,
      },
      comments: explanation.comments.map((c) => ({
        id: c.id,
        explanationId: c.explanationId,
        text: c.text,
      })),
    })
  } catch (e: any) {
    console.error("[EXPL] POST error", e);
    // Handle auth errors (safety net - should already be handled above)
    if (e?.message === 'UNAUTHORIZED') {
      return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    if (e?.message === 'FORBIDDEN') {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

