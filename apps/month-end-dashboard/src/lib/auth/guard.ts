import { redirect } from 'next/navigation'
import { requireScreenAccess } from './appUser'
import type { ScreenId } from './access'

export async function requireScreen(screen: ScreenId) {
  try {
    return await requireScreenAccess(screen)
  } catch (err: any) {
    const message = err?.message || ''
    if (message === 'UNAUTHENTICATED') redirect('/auth/login')
    if (message === 'USER_DISABLED') redirect('/access-denied')
    if (message === 'FORBIDDEN') redirect('/access-denied')
    throw err
  }
}
