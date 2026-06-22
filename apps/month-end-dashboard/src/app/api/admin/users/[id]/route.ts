import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getCurrentAppUser } from '@/lib/auth/appUser'
import { ALL_SCREENS, DEFAULT_USER_SCREENS, ScreenId } from '@/lib/auth/access'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const admin = await getCurrentAppUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!admin.is_active || admin.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userId = params.id
  const body = await request.json()
  const { role, is_active, allowed_screens } = body || {}

  const updates: any = {}
  if (role === 'admin' || role === 'user') updates.role = role
  if (typeof is_active === 'boolean') updates.is_active = is_active

  if (Array.isArray(allowed_screens)) {
    const normalized = (allowed_screens as string[])
      .map((s) => s.toLowerCase())
      .filter((s) => (ALL_SCREENS as string[]).includes(s))
    updates.allowed_screens = normalized as ScreenId[]
  }

  if (updates.role === 'admin') {
    updates.allowed_screens = [...ALL_SCREENS]
  } else if (updates.role === 'user' && updates.allowed_screens == null) {
    updates.allowed_screens = [...DEFAULT_USER_SCREENS]
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updates,
  })

  return NextResponse.json({ user: updated })
}
