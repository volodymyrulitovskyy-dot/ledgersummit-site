/**
 * QuickBooks Online API client helper
 * Provides reusable functions for QBO API calls with automatic token refresh
 */

import { getQboBaseUrl } from './config'
import { getValidAccessToken } from './tokens'

/**
 * Get QBO API base URL based on environment
 */
export function getQboBaseUrlForEnv(env: 'sandbox' | 'production' = 'sandbox'): string {
  return env === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com'
}

/**
 * Get valid access token with realm_id and baseUrl
 * Automatically refreshes token if expired or expiring soon
 */
export async function getQboClient(orgId: string) {
  return await getValidAccessToken(orgId)
}

