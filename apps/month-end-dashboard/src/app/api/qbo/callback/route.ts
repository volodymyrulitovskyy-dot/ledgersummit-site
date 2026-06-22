import { NextRequest, NextResponse } from 'next/server'
import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { exchangeCodeForTokens } from '@/lib/qbo/oauth'
import { storeQboTokens } from '@/lib/qbo/tokens'
import { ensureOrgAccessApi } from '@/lib/auth/ensureOrgAccessApi'

export async function GET(request: NextRequest) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.url

    // Check authentication (API-safe)
    try {
      await ensureUserApi()
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') {
        return NextResponse.redirect(new URL('/auth', baseUrl))
      }
      throw err
    }

    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state') // org_id
    const realmId = searchParams.get('realmId')
    const error = searchParams.get('error')

    if (error) {
      return NextResponse.redirect(new URL(`/close?error=qbo_oauth_error&message=${encodeURIComponent(error)}`, baseUrl))
    }

    if (!code || !state || !realmId) {
      return NextResponse.redirect(new URL('/close?error=qbo_callback_missing_params', baseUrl))
    }

    // Verify user has access to this org (API-safe)
    try {
      await ensureOrgAccessApi(state)
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') {
        return NextResponse.redirect(new URL('/auth', baseUrl))
      }
      if (err.message === 'FORBIDDEN') {
        return NextResponse.redirect(new URL('/org', baseUrl))
      }
      throw err
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, realmId)

    // Store tokens
    await storeQboTokens(state, realmId, tokens)

    return NextResponse.redirect(new URL('/close?qbo_connected=true', baseUrl))
  } catch (error: any) {
    console.error('QBO callback error:', error)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.url
    return NextResponse.redirect(new URL(`/close?error=qbo_callback_failed&message=${encodeURIComponent(error.message)}`, baseUrl))
  }
}

