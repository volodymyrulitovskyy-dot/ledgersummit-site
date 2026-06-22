import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { orgId, snapshotId, rule } = body || {}
    if (!orgId || !snapshotId || !rule) {
      return NextResponse.json({ error: 'Missing orgId, snapshotId, or rule' }, { status: 400 })
    }

    const snapshot = await prisma.tbSnapshot.findUnique({
      where: { id: snapshotId, org_id: orgId },
      include: { tb_lines: true },
    })
    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
    }

    const lines = snapshot.tb_lines || []
    const matches: any[] = []
    for (const l of lines) {
      const name = (l.account_name || '').toLowerCase()
      const matchText = (rule.account_match || '').toLowerCase()
      const inScope =
        rule.scope === 'ACCOUNT_MATCH'
          ? matchText && name.includes(matchText)
          : true
      if (!inScope) continue

      const bal = Number(l.balance ?? 0)
      const absBal = Math.abs(bal)
      let shouldFlag = false

      if (rule.threshold_abs != null && absBal > Number(rule.threshold_abs)) shouldFlag = true
      if (rule.threshold_pos != null && bal > Number(rule.threshold_pos)) shouldFlag = true
      if (rule.threshold_neg != null && bal < Number(rule.threshold_neg)) shouldFlag = true

      if (shouldFlag) {
        matches.push({ account_name: l.account_name, balance: bal })
      }
    }

    return NextResponse.json({
      success: true,
      count: matches.length,
      sampleAccounts: matches.slice(0, 5),
    })
  } catch (err: any) {
    console.error('[RULE_PREVIEW_ERROR]', err)
    return NextResponse.json({ error: err.message || 'Failed to preview rule' }, { status: 500 })
  }
}
