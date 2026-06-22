import { NextResponse } from 'next/server'
import { getCurrentAppUser } from '@/lib/auth/appUser'

export async function POST() {
  const appUser = await getCurrentAppUser()
  if (!appUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ success: true, user: appUser })
}
