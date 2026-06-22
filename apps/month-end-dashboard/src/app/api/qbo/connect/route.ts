import { NextRequest, NextResponse } from 'next/server'
import { ensureUserApi } from '@/lib/auth/ensureUserApi'
import { getActiveOrgId } from '@/lib/active'
import { generateQboAuthUrl } from '@/lib/qbo/oauth'
import { validateQboConfig } from '@/lib/qbo/config'

export async function GET(request: NextRequest) {
  try {
    // Validate QBO configuration first
    const configCheck = validateQboConfig()
    if (!configCheck.valid) {
      const errorMsg = `Missing required QBO environment variables: ${configCheck.missing.join(', ')}`
      console.error('[QBO Connect] Configuration error:', errorMsg)
      console.error('[QBO Connect] Env vars check:', {
        QBO_CLIENT_ID: process.env.QBO_CLIENT_ID ? 'SET' : 'MISSING',
        QBO_CLIENT_SECRET: process.env.QBO_CLIENT_SECRET ? 'SET' : 'MISSING',
        QBO_REDIRECT_URI: process.env.QBO_REDIRECT_URI || 'using default',
        QBO_ENV: process.env.QBO_ENV || 'using default (sandbox)',
      })
      
      return new NextResponse(
        `QBO Configuration Error: ${errorMsg}. Please check your .env file.`,
        { status: 500 }
      )
    }

    // Check authentication (API-safe)
    try {
      await ensureUserApi()
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') {
        return NextResponse.redirect(new URL('/auth', request.url))
      }
      throw err
    }

    const orgId = await getActiveOrgId()

    if (!orgId) {
      return NextResponse.redirect(new URL('/org', request.url))
    }

    // Generate OAuth URL with org_id as state
    const authUrl = generateQboAuthUrl(orgId)

    console.log('[QBO Connect] Redirecting to Intuit OAuth:', {
      orgId: orgId.substring(0, 8) + '...',
      authUrlLength: authUrl.length,
    })

    return NextResponse.redirect(authUrl)
  } catch (error: any) {
    console.error('[QBO Connect] Error:', error)
    const errorMessage = error.message || 'Unknown error'
    return new NextResponse(
      `QBO Connection Error: ${errorMessage}. Please check server logs for details.`,
      { status: 500 }
    )
  }
}

