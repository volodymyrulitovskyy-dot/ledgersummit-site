import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentAppUser } from '@/lib/auth/appUser'
import { detectAppVariant, getAppPath, getAppUrl } from '@/lib/supabase/authRedirect'

function getSafeNextPath(next: string | null) {
  if (!next || !next.startsWith('/')) return '/close'
  return next
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const variant = detectAppVariant(url.hostname, url.pathname)
  const safeNext = getAppPath(getSafeNextPath(url.searchParams.get('next')), variant)
  const appUrl = getAppUrl(variant)

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      await getCurrentAppUser().catch((err) => {
        console.error('[AUTH_CALLBACK] Failed to sync app user', err)
      })
      return NextResponse.redirect(new URL(safeNext, appUrl))
    }
  }

  return NextResponse.redirect(
    new URL(getAppPath('/auth/login?error=oauth_callback_failed', variant), appUrl)
  )
}
