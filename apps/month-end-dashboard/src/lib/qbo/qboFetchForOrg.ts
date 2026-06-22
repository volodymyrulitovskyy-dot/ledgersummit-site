/**
 * Fetch QBO JSON using orgId + relative path (e.g., "/reports/ProfitAndLoss")
 * and query parameters (e.g., { start_date, end_date, minorversion }).
 * 
 * Ported from old app, adapted to use new app's token management.
 */

import { getQboClient } from './client'

export type QboQuery = Record<string, string | number | boolean | undefined>
type QboFetchInit = RequestInit & { suppressErrorLog?: boolean }

function extractQboErrorMessage(json: unknown, status: number): string {
  if (!json || typeof json !== 'object') return `QBO request failed (${status})`
  const obj = json as Record<string, unknown>
  const fault = obj.Fault as Record<string, unknown> | undefined
  const errors = Array.isArray(fault?.Error) ? fault?.Error : undefined
  const firstError = (errors?.[0] ?? null) as Record<string, unknown> | null
  const message = firstError?.Message
  if (typeof message === 'string' && message.trim()) return message
  const generic = obj.message
  if (typeof generic === 'string' && generic.trim()) return generic
  return `QBO request failed (${status})`
}

/**
 * Fetch QBO JSON using orgId + relative path (e.g., "/reports/ProfitAndLoss")
 * and query parameters (e.g., { start_date, end_date, minorversion }).
 */
export async function qboFetchForOrg(
  orgId: string,
  path: string,
  query: QboQuery = {},
  init: QboFetchInit = {}
) {
  const client = await getQboClient(orgId)
  const base = `${client.baseUrl}/v3/company/${client.realm_id}`
  const url = new URL(`${base}${path}`)

  for (const [k, v] of Object.entries(query || {})) {
    if (v === undefined) continue
    url.searchParams.set(k, String(v))
  }

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${client.access_token}`)
  headers.set('Accept', 'application/json')

  const method = init.method || 'GET'
  const body = init.body
  
  const resp = await fetch(url.toString(), { ...init, method, headers, body })
  const text = await resp.text()

  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // non-json is fine for error fallback
  }

  if (!resp.ok) {
    if (!init.suppressErrorLog) {
      // Log QBO error details for unexpected failures
      console.error("[QBO] non-200", {
        status: resp.status,
        text,
        url: resp.url || url.toString(),
      })
    }
    
    const msg = extractQboErrorMessage(json, resp.status)
    throw new Error(msg)
  }

  return json
}
