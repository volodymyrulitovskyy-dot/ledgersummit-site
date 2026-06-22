/**
 * QuickBooks Online OAuth flow
 */

import { qboConfig, getQboAuthUrl } from './config'

/**
 * Generate OAuth authorization URL
 */
export function generateQboAuthUrl(state: string): string {
  // Validate config before building URL
  if (!qboConfig.clientId) {
    throw new Error('QBO_CLIENT_ID is not set')
  }
  if (!qboConfig.redirectUri) {
    throw new Error('QBO_REDIRECT_URI is not set')
  }

  const params = new URLSearchParams({
    client_id: qboConfig.clientId,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: qboConfig.redirectUri,
    state,
  })

  const authUrl = `${getQboAuthUrl()}?${params.toString()}`

  // Log for debugging (redact client_id partially)
  const redactedClientId = qboConfig.clientId.length > 8 
    ? `${qboConfig.clientId.substring(0, 4)}...${qboConfig.clientId.substring(qboConfig.clientId.length - 4)}`
    : '***'
  console.log('[QBO OAuth] Building authorize URL:', {
    baseUrl: getQboAuthUrl(),
    clientId: redactedClientId,
    redirectUri: qboConfig.redirectUri,
    scope: 'com.intuit.quickbooks.accounting',
    state: state.substring(0, 8) + '...',
    fullUrl: authUrl.replace(qboConfig.clientId, redactedClientId),
  })

  return authUrl
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string, realmId: string) {
  const auth = Buffer.from(`${qboConfig.clientId}:${qboConfig.clientSecret}`).toString('base64')

  console.log('[QBO OAuth] Exchanging code for tokens:', {
    realmId,
    redirectUri: qboConfig.redirectUri,
    hasClientId: !!qboConfig.clientId,
    hasClientSecret: !!qboConfig.clientSecret,
  })

  const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: qboConfig.redirectUri,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('[QBO OAuth] Token exchange failed:', {
      status: response.status,
      error,
    })
    throw new Error(`Failed to exchange code for tokens: ${response.status} ${error}`)
  }

  const data = await response.json()
  console.log('[QBO OAuth] Token exchange successful:', {
    hasAccessToken: !!data.access_token,
    hasRefreshToken: !!data.refresh_token,
    expiresIn: data.expires_in,
    refreshExpiresIn: data.x_refresh_token_expires_in,
    tokenType: data.token_type,
    scope: data.scope,
  })

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in || 3600,
    x_refresh_token_expires_in: data.x_refresh_token_expires_in,
    token_type: data.token_type || 'Bearer',
    scope: data.scope,
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshQboTokens(refreshToken: string) {
  const auth = Buffer.from(`${qboConfig.clientId}:${qboConfig.clientSecret}`).toString('base64')

  console.log('[QBO OAuth] Refreshing token...')

  const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('[QBO OAuth] Token refresh failed:', {
      status: response.status,
      error,
    })
    throw new Error(`Failed to refresh tokens: ${response.status} ${error}`)
  }

  const data = await response.json()
  console.log('[QBO OAuth] Token refresh successful:', {
    hasAccessToken: !!data.access_token,
    hasRefreshToken: !!data.refresh_token,
    expiresIn: data.expires_in,
  })

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken, // May not be returned if same
    expires_in: data.expires_in || 3600,
    x_refresh_token_expires_in: data.x_refresh_token_expires_in,
    token_type: data.token_type || 'Bearer',
    scope: data.scope,
  }
}

