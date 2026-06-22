import type { Prisma, User as DbUser } from '@prisma/client'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'
import { ALL_SCREENS, Role, ScreenId, canAccessScreen, normalizeAllowedScreens } from './access'
import { deriveUserName } from './userProfile'

export type AppUser = {
  id: string
  email: string
  user_name: string | null
  role: Role
  allowed_screens: ScreenId[]
  is_active: boolean
}

function toRole(role?: string | null): Role {
  return role === 'admin' ? 'admin' : 'user'
}

async function _getCurrentAppUser(): Promise<AppUser | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const email = (user.email || '').toLowerCase()
  const now = new Date()

  // Short-circuit DB unreachability with a graceful fallback user
  const fallbackUser = (): AppUser => ({
    id: user.id,
    email: email || user.id,
    user_name: deriveUserName(user),
    role: 'admin',
    allowed_screens: [...ALL_SCREENS],
    is_active: true,
  })

  let existing: DbUser | null = null
  try {
    existing = await prisma.user.findUnique({
      where: { id: user.id },
    })
  } catch (err) {
    console.error('[APP_USER] Failed to fetch user', err)
    return fallbackUser()
  }

  // If no record by id, try linking by email
  if (!existing && email) {
    try {
      const byEmail = await prisma.user.findFirst({
        where: { email },
      })
      if (byEmail) {
        existing = await prisma.user.update({
          where: { id: byEmail.id },
          data: { id: user.id },
        })
      }
    } catch (err) {
      console.error('[APP_USER] Failed to link user by email', err)
    }
  }

  const userName = deriveUserName(user)

  if (!existing) {
    const role: Role = 'admin'
    const allowed_screens: ScreenId[] = [...ALL_SCREENS]
    let created: DbUser
    try {
      created = await prisma.user.create({
        data: {
          id: user.id,
          email: email || user.id,
          user_name: userName,
          role,
          allowed_screens,
          is_active: true,
          last_login: now,
        },
      })
    } catch (err) {
      console.error('[APP_USER] Failed to create user record', err)
      return fallbackUser()
    }
    return {
      id: created.id,
      email: created.email,
      user_name: created.user_name ?? userName,
      role,
      allowed_screens,
      is_active: created.is_active,
    }
  }

  const updates: Prisma.UserUpdateInput = {}
  // Only update last_login once per day to avoid a DB write on every navigation
  const lastLogin = existing.last_login ? new Date(existing.last_login) : null
  if (!lastLogin || now.getTime() - lastLogin.getTime() > 86_400_000) {
    updates.last_login = now
  }
  if (email && existing.email !== email) updates.email = email
  if (userName && existing.user_name !== userName) updates.user_name = userName
  if (existing.role !== 'admin') {
    updates.role = 'admin'
    updates.allowed_screens = ALL_SCREENS
  } else if (JSON.stringify(existing.allowed_screens ?? []) !== JSON.stringify(ALL_SCREENS)) {
    updates.allowed_screens = ALL_SCREENS
  }

  let updated = existing
  if (Object.keys(updates).length > 0) {
    try {
      updated = await prisma.user.update({ where: { id: user.id }, data: updates })
    } catch (err) {
      console.error('[APP_USER] Failed to update user record', err)
      return fallbackUser()
    }
  }

  return {
    id: updated.id,
    email: updated.email,
    user_name: updated.user_name ?? userName,
    role: toRole(updated.role),
    allowed_screens: normalizeAllowedScreens(updated.allowed_screens, toRole(updated.role)),
    is_active: updated.is_active,
  }
}

// Deduplicate within a single React server request
export const getCurrentAppUser = cache(_getCurrentAppUser)

export async function requireAppUser(): Promise<AppUser> {
  const appUser = await getCurrentAppUser()
  if (!appUser) {
    throw new Error('UNAUTHENTICATED')
  }
  if (!appUser.is_active) {
    throw new Error('USER_DISABLED')
  }
  return appUser
}

export async function requireScreenAccess(screen: ScreenId): Promise<AppUser> {
  const user = await requireAppUser()
  if (!canAccessScreen(user.role, user.allowed_screens, screen)) {
    throw new Error('FORBIDDEN')
  }
  return user
}
