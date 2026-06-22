/**
 * Ensure user has access to org (API-safe version)
 * Throws error if not authenticated or no access (to be caught and returned as 401/403)
 */
import { ensureUserApi } from './ensureUserApi'
import { prisma } from '@/lib/db/prisma'

export async function ensureOrgAccessApi(orgId: string) {
  const user = await ensureUserApi()
  
  // Check if user is a member of this org
  const orgMember = await prisma.orgMember.findFirst({
    where: {
      org_id: orgId,
      user_id: user.id,
    },
  })

  if (!orgMember) {
    throw new Error('FORBIDDEN')
  }

  return { user, orgMember }
}

