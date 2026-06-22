/**
 * Get current user without redirecting (API-safe)
 * Returns null if not authenticated
 */
import { createClient } from '@/lib/supabase/server'

export async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user
}

