import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/active'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    // Check if user has active org
    const activeOrgId = await getActiveOrgId()
    if (activeOrgId) {
      redirect('/close')
    } else {
      redirect('/org')
    }
  } else {
    redirect('/auth/login')
  }
}
