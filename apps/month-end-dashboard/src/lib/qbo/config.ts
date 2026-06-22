/**
 * QuickBooks Online OAuth configuration
 */

export const qboConfig = {
  clientId: process.env.QBO_CLIENT_ID || '',
  clientSecret: process.env.QBO_CLIENT_SECRET || '',
  redirectUri: process.env.QBO_REDIRECT_URI || 'http://localhost:3013/api/qbo/callback',
  environment: (process.env.QBO_ENV || 'sandbox') as 'sandbox' | 'production',
}

export const qboScopes = [
  'com.intuit.quickbooks.accounting',
]

export function getQboBaseUrl() {
  return qboConfig.environment === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com'
}

export function getQboAuthUrl() {
  return 'https://appcenter.intuit.com/connect/oauth2'
}

/**
 * Validate QBO configuration and return missing env vars
 */
export function validateQboConfig(): { valid: boolean; missing: string[] } {
  const missing: string[] = []
  
  if (!process.env.QBO_CLIENT_ID || !qboConfig.clientId) {
    missing.push('QBO_CLIENT_ID')
  }
  if (!process.env.QBO_CLIENT_SECRET || !qboConfig.clientSecret) {
    missing.push('QBO_CLIENT_SECRET')
  }
  if (!process.env.QBO_REDIRECT_URI && !qboConfig.redirectUri) {
    missing.push('QBO_REDIRECT_URI')
  }
  
  return {
    valid: missing.length === 0,
    missing,
  }
}
