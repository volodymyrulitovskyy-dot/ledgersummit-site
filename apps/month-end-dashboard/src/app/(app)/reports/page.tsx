import { getActiveOrgId } from '@/lib/active'
import { ensureOrgAccess } from '@/lib/auth/ensureOrgAccess'
import { prisma } from '@/lib/db/prisma'
import { redirect } from 'next/navigation'
import { ReportsClient } from "./ReportsClient";
import { requireScreen } from '@/lib/auth/guard'

export default async function ReportsPage() {
  await requireScreen('reports')

  const activeOrgId = await getActiveOrgId()
  if (!activeOrgId) {
    redirect('/org')
  }

  await ensureOrgAccess(activeOrgId)

  const qboConnection = await prisma.qboConnection.findUnique({
    where: { org_id: activeOrgId },
    select: { realm_id: true },
  })

  return <ReportsClient hasQboConnection={!!qboConnection} />;
}
