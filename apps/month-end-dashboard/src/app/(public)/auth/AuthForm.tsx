'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import { normalizeUserName } from '@/lib/auth/userProfile'
import { detectAppVariant, getOAuthCallbackUrl } from '@/lib/supabase/authRedirect'

type Mode = 'login' | 'signup'

const BENEFITS = [
  'Catch issues early instead of at review',
  'Know exactly who owns each task',
  'Track progress without chasing updates',
  'Keep a complete audit trail automatically',
] as const

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Connect QuickBooks',
    description: 'Import your financial data in minutes.',
  },
  {
    step: '02',
    title: 'Run checks',
    description: 'Instantly flag variances and missing support.',
  },
  {
    step: '03',
    title: 'Resolve exceptions',
    description: 'Assign owners and track progress in real time.',
  },
  {
    step: '04',
    title: 'Reconcile and sign off',
    description: 'Close with a complete audit trail.',
  },
] as const

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return 'An error occurred'
}

export function AuthForm({ mode: initialMode }: { mode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()
  const searchParams = useSearchParams()
  const redirectTo = searchParams?.get('redirect') || (mode === 'signup' ? '/guide' : '/close')

  const toggleMode = () => {
    setMode((prev) => (prev === 'login' ? 'signup' : 'login'))
    setError(null)
    setMessage(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (mode === 'signup') {
        const userName = normalizeUserName(email.split('@')[0] || 'New User')

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              user_name: userName,
              full_name: userName,
            },
          },
        })
        if (error) throw error

        if (!data.session) {
          setMessage('Account created. Check your email to confirm sign-in, then return to the app.')
          return
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }

      await fetch('/api/auth/sync', { method: 'POST' }).catch(() => {})

      router.push(redirectTo)
      router.refresh()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const variant = detectAppVariant(window.location.hostname, window.location.pathname)

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: getOAuthCallbackUrl(variant),
        },
      })

      if (error) throw error
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Unable to start OAuth sign-in.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.12),_transparent_24%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1540px] items-center">
        <div className="grid w-full items-center gap-8 lg:grid-cols-[minmax(0,1.18fr)_minmax(360px,420px)] xl:gap-12">
          <div className="space-y-6">
            <section className="rounded-[32px] border border-slate-200/80 bg-white/85 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur lg:p-8">
              <div className="max-w-[680px] space-y-5">
                <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-800">
                  Month End Dashboard
                </span>
                <h1 className="max-w-[13ch] text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                  A structured close with clear control and no surprises.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-600">
                  Connect QuickBooks, automatically detect anomalies, track exceptions, and complete your close with a clean audit trail.
                </p>
                <p className="text-sm text-slate-500">Built for controllers, accountants, and finance teams.</p>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <div className="text-2xl font-bold tracking-tight text-slate-950">Live Close Dashboard</div>
                    <p className="text-sm text-slate-600">Track issues, ownership, and financial impact in real time.</p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-slate-200 bg-slate-50 px-6 py-5">
                    <div>
                      <div className="text-3xl font-bold tracking-tight text-slate-950">Close Dashboard</div>
                      <div className="mt-1 text-sm text-slate-500">Overview of exceptions, impact, and close status.</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-700">From 11/01/2025</div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-700">To 11/30/2025</div>
                      <div className="rounded-2xl bg-slate-950 px-4 py-3 font-semibold text-white">Refresh (QBO)</div>
                    </div>
                  </div>

                  <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                    <span className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white">Overview</span>
                    <span className="px-5 py-2 text-sm font-medium text-slate-500">Workflow</span>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(253,224,71,0.18),_transparent_48%),#ffffff] p-6 shadow-sm">
                      <div className="text-lg font-semibold text-slate-950">Open Issues</div>
                      <div className="mt-1 text-sm text-slate-500">Flagged exceptions still in progress</div>
                      <div className="mt-6 flex min-h-[240px] items-center justify-center">
                        <div className="relative h-52 w-52 rounded-full bg-[conic-gradient(#86efac_0_68%,#fde68a_68%_100%)] p-9">
                          <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white text-center">
                            <div className="text-2xl font-bold text-slate-900">14</div>
                            <div className="text-sm text-slate-500">Open issues</div>
                            <div className="mt-1 text-xs text-slate-400">Across 46 accounts</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(253,224,71,0.18),_transparent_48%),#ffffff] p-6 shadow-sm">
                      <div className="text-lg font-semibold text-slate-950">Exception Impact</div>
                      <div className="mt-1 text-sm text-slate-500">Financial impact under review</div>
                      <div className="mt-6 flex min-h-[240px] items-center justify-center">
                        <div className="relative h-52 w-52 rounded-full bg-[conic-gradient(#bbf7d0_0_12%,#fde68a_12%_100%)] p-9">
                          <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white text-center">
                            <div className="text-2xl font-bold text-slate-900">$75,126</div>
                            <div className="text-sm text-slate-500">Exception impact</div>
                            <div className="mt-1 text-xs text-slate-400">Of $84,535 total activity</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(253,224,71,0.18),_transparent_48%),#ffffff] p-6 shadow-sm">
                      <div className="text-lg font-semibold text-slate-950">Closed Issues</div>
                      <div className="mt-1 text-sm text-slate-500">Resolved before signoff</div>
                      <div className="mt-6 flex min-h-[240px] items-center justify-center">
                        <div className="relative h-52 w-52 rounded-full bg-[conic-gradient(#fde68a_0_100%)] p-9">
                          <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white text-center">
                            <div className="text-2xl font-bold text-slate-900">0</div>
                            <div className="text-sm text-slate-500">Closed issues</div>
                            <div className="mt-1 text-xs text-slate-400">Open: 14 · Closed: 0</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
            </section>

            <section className="space-y-4">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight text-slate-950">Why finance teams use this</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {BENEFITS.map((item) => (
                  <article key={item} className="flex items-start gap-3 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500" />
                    <p className="text-sm leading-6 text-slate-700">{item}</p>
                  </article>
                ))}
              </div>
            </section>

            <section id="how-it-works" className="space-y-4 rounded-[28px] border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">How it works</h2>
                <p className="text-sm text-slate-300">Simple flow, fewer handoffs, stronger close control.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {HOW_IT_WORKS.map((item) => (
                  <article key={item.step} className="rounded-2xl border border-white/10 bg-white/6 p-4">
                    <div className="text-sm font-semibold text-sky-200">{item.step}</div>
                    <h3 className="mt-2 text-base font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{item.description}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="self-start lg:sticky lg:top-6">
            <div
              id="auth-card"
              className="rounded-[32px] border border-slate-200/80 bg-white px-6 py-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] lg:px-8 lg:py-8"
            >
              <div className="space-y-2 text-center">
                <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                  {mode === 'signup' ? 'Continue with Google' : 'Continue with Google'}
                </h2>
                <p className="text-sm leading-6 text-slate-600">
                  Use Google for the fastest setup, or switch to email if you prefer.
                </p>
              </div>

              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={() => handleOAuth('google')}
                  disabled={loading}
                  className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
                >
                  Continue with Google
                </button>
                <p className="text-center text-xs font-medium text-slate-500">No credit card required</p>
              </div>

              <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                <div className="h-px flex-1 bg-slate-200" />
                Use email
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <form className="space-y-5" onSubmit={handleSubmit}>
                {error && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    {error}
                  </div>
                )}
                {message && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {message}
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                      Email
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1 block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                      Password
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="mt-1 block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
                >
                  {loading ? 'Working…' : 'Use email'}
                </button>

                <div className="text-center text-sm text-slate-600">
                  <button
                    type="button"
                    onClick={toggleMode}
                    className="font-semibold text-slate-950 hover:text-slate-700"
                  >
                    {mode === 'signup' ? 'Already have an account? Sign in' : "Need an account? Sign up"}
                  </button>
                </div>
              </form>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
