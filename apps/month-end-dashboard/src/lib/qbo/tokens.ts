/**
 * QuickBooks Online token management
 */

import { prisma } from '@/lib/db/prisma'
import { qboConfig, getQboAuthUrl } from './config'
import { refreshQboTokens } from './oauth'

export interface QboTokenData {
  access_token: string
  refresh_token: string
  expires_in: number
  x_refresh_token_expires_in?: number
  token_type?: string
  scope?: string
}

/**
 * Get valid access token for an org, refreshing if needed
 * Returns access_token, realm_id, and baseUrl
 */
export async function getValidAccessToken(orgId: string): Promise<{
  access_token: string
  realm_id: string
  baseUrl: string
}> {
  const connection = await prisma.qboConnection.findUnique({
    where: { org_id: orgId },
  })

  if (!connection) {
    throw new Error('No QBO connection found for this organization')
  }

  // Check if token is expired (refresh 2 minutes before expiry)
  const now = new Date()
  const refreshThreshold = new Date(connection.expires_at.getTime() - 2 * 60 * 1000)

  let accessToken = connection.access_token

  if (now >= refreshThreshold) {
    console.log('[QBO Tokens] Token expired or expiring soon, refreshing...')
    // Refresh the token
    const newTokens = await refreshQboTokens(connection.refresh_token)
    
    await prisma.qboConnection.update({
      where: { org_id: orgId },
      data: {
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token || connection.refresh_token,
        expires_at: new Date(Date.now() + newTokens.expires_in * 1000),
        updated_at: new Date(),
      },
    })

    accessToken = newTokens.access_token
    console.log('[QBO Tokens] Token refreshed successfully')
  }

  const { getQboBaseUrl } = await import('./config')
  const baseUrl = getQboBaseUrl()

  return {
    access_token: accessToken,
    realm_id: connection.realm_id,
    baseUrl,
  }
}

/**
 * Store QBO tokens for an org
 */
export async function storeQboTokens(
  orgId: string,
  realmId: string,
  tokens: QboTokenData
) {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
  const refreshExpiresAt = tokens.x_refresh_token_expires_in
    ? new Date(Date.now() + tokens.x_refresh_token_expires_in * 1000)
    : null

  console.log('[QBO Tokens] Storing tokens for org:', {
    orgId: orgId.substring(0, 8) + '...',
    realmId,
    expiresAt: expiresAt.toISOString(),
    refreshExpiresAt: refreshExpiresAt?.toISOString(),
  })

  await prisma.qboConnection.upsert({
    where: { org_id: orgId },
    create: {
      org_id: orgId,
      realm_id: realmId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
    },
    update: {
      realm_id: realmId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date(),
    },
  })

  console.log('[QBO Tokens] Tokens stored successfully')
}

/**
 * Check if org has QBO connection
 */
export async function hasQboConnection(orgId: string): Promise<boolean> {
  const connection = await prisma.qboConnection.findUnique({
    where: { org_id: orgId },
  })
  return !!connection
}

/**
 * Get QBO connection info (without sensitive tokens)
 */
export async function getQboConnectionInfo(orgId: string) {
  const connection = await prisma.qboConnection.findUnique({
    where: { org_id: orgId },
    select: {
      id: true,
      org_id: true,
      realm_id: true,
      expires_at: true,
      created_at: true,
      updated_at: true,
    },
  })
  return connection
}

