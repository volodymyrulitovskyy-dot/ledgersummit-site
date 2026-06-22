import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Sign In | Month End Dashboard',
  description:
    'Sign in to Month End Dashboard to connect QuickBooks, monitor close status, resolve exceptions, and complete reconciliations in one audit-ready workflow.',
}

import { AuthForm } from '../AuthForm'

export default function LoginPage() {
  return <AuthForm mode="login" />
}
