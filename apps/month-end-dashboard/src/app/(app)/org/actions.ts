'use server'

import { ensureUser } from '@/lib/auth/ensureUser'
import { prisma } from '@/lib/db/prisma'
import { setActiveOrgId, clearActivePeriodRange, clearRangeDates } from '@/lib/active'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createOrgAction(formData: FormData) {
  const user = await ensureUser()
  const name = formData.get('name') as string

  if (!name || name.trim().length === 0) {
    throw new Error('Org name is required')
  }

  // Create org and add user as admin
  const org = await prisma.org.create({
    data: {
      name: name.trim(),
      org_members: {
        create: {
          user_id: user.id,
          role: 'admin',
        },
      },
    },
  })

  // Set active org, clear period range and date ranges, and redirect
  await setActiveOrgId(org.id)
  await clearActivePeriodRange()
  await clearRangeDates()

  revalidatePath('/admin')
  revalidatePath('/close')
  redirect('/close')
}

export async function selectOrgAction(orgId: string) {
  const user = await ensureUser()

  // Verify access
  const orgMember = await prisma.orgMember.findFirst({
    where: {
      org_id: orgId,
      user_id: user.id,
    },
  })

  if (!orgMember) {
    throw new Error('Access denied')
  }

  // Set active org and clear period range and date ranges
  await setActiveOrgId(orgId)
  await clearActivePeriodRange()
  await clearRangeDates()

  revalidatePath('/admin')
  revalidatePath('/close')
  redirect('/close')
}

