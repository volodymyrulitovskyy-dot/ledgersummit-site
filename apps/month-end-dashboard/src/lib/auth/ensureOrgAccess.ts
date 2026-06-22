import { redirect } from 'next/navigation'
import { ensureUser } from './ensureUser'
import { prisma } from '@/lib/db/prisma'

export async function ensureOrgAccess(orgId: string) {
  const user = await ensureUser()
  
  if (!user) {
    redirect('/auth')
  }

  // Check if user is a member of this org
  const orgMember = await prisma.orgMember.findFirst({
    where: {
      org_id: orgId,
      user_id: user.id,
    },
  })

  if (!orgMember) {
    redirect('/org')
  }

  return { user, orgMember }
}

