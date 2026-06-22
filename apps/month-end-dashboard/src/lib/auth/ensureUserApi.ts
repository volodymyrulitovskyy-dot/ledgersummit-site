/**
 * Ensure user is authenticated (API-safe version)
 * Throws error if not authenticated (to be caught and returned as 401)
 */
import { getUser } from './getUser'

export async function ensureUserApi() {
  const user = await getUser()
  if (!user) {
    throw new Error('UNAUTHORIZED')
  }
  return user
}

