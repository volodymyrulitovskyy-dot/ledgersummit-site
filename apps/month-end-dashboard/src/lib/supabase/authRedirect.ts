const DIGITALOCEAN_HOST = 'month-end-dashboard3-4by9b.ondigitalocean.app'
const LEDGERSUMMIT_HOST = 'ledgersummit.com'
const LEDGERSUMMIT_BASE_PATH = '/tools/month-end-dashboard'

const DIGITALOCEAN_APP_URL = `https://${DIGITALOCEAN_HOST}`
const LEDGERSUMMIT_APP_URL = `https://${LEDGERSUMMIT_HOST}${LEDGERSUMMIT_BASE_PATH}`

export type AppVariant = 'digitalocean' | 'ledgersummit'

export function detectAppVariant(hostname: string, pathname = '/'): AppVariant {
  if (hostname === LEDGERSUMMIT_HOST || pathname.startsWith(LEDGERSUMMIT_BASE_PATH)) {
    return 'ledgersummit'
  }

  return 'digitalocean'
}

export function getOAuthCallbackUrl(variant: AppVariant): string {
  return variant === 'ledgersummit'
    ? `${LEDGERSUMMIT_APP_URL}/auth/callback`
    : `${DIGITALOCEAN_APP_URL}/auth/callback`
}

export function getAppPath(path: string, variant: AppVariant): string {
  if (!path.startsWith('/')) {
    return getAppPath(`/${path}`, variant)
  }

  if (variant === 'ledgersummit') {
    return path.startsWith(LEDGERSUMMIT_BASE_PATH) ? path : `${LEDGERSUMMIT_BASE_PATH}${path}`
  }

  return path
}

export function getAppUrl(variant: AppVariant): string {
  return variant === 'ledgersummit' ? LEDGERSUMMIT_APP_URL : DIGITALOCEAN_APP_URL
}
