import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Create Account | Month End Dashboard',
  description:
    'Create a Month End Dashboard account to manage the month-end close, run automated checks, track exceptions, and centralize period review for QuickBooks teams.',
}

import { AuthForm } from '../AuthForm'

export default function SignupPage() {
  return <AuthForm mode="signup" />
}
