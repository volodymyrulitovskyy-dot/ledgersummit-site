export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'

export default function AuthRedirect() {
  redirect('/auth/login')
}

