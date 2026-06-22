export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server'
import { getActiveOrgId, getRangeFromDate, getRangeToDate } from '@/lib/active'
import { prisma } from '@/lib/db/prisma'

export async function GET() {
  try {
    const orgId = await getActiveOrgId()
    const from = await getRangeFromDate()
    const to = await getRangeToDate()
    
    console.log("[ACTIVE][HIT]", { orgId, from, to });
    
    let orgName = ''
    if (orgId) {
      const org = await prisma.org.findUnique({
        where: { id: orgId },
        select: { name: true },
      })
      orgName = org?.name || ''
    }
    
    return NextResponse.json({
      orgId: orgId || '',
      orgName,
      from: from || '',
      to: to || '',
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch active org/period' },
      { status: 500 }
    )
  }
}

