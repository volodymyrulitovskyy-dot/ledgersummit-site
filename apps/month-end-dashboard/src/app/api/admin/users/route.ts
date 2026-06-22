import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getCurrentAppUser } from '@/lib/auth/appUser'
import { ALL_SCREENS, DEFAULT_USER_SCREENS, ScreenId } from '@/lib/auth/access'

export async function POST(request: Request) {
  const admin = await getCurrentAppUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!admin.is_active || admin.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const role = body.role === 'admin' ? 'admin' : 'user'
  const allowed = Array.isArray(body.allowed_screens)
    ? (body.allowed_screens as string[]).map((s) => s.toLowerCase()).filter((s) => (ALL_SCREENS as string[]).includes(s))
    : []

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const allowed_screens: ScreenId[] =
    role === 'admin'
      ? [...ALL_SCREENS]
      : (allowed.length ? (Array.from(new Set(allowed)) as ScreenId[]) : [...DEFAULT_USER_SCREENS])

  const existingEmail = await prisma.user.findFirst({ where: { email } })
  if (existingEmail) {
    const updated = await prisma.user.update({
      where: { id: existingEmail.id },
      data: { role, allowed_screens, is_active: true },
    })
    return NextResponse.json({ user: updated, status: 'updated' })
  }

  const created = await prisma.user.create({
    data: {
      email,
      role,
      allowed_screens,
      is_active: true,
    },
  })

  return NextResponse.json({ user: created, status: 'created' })
}
