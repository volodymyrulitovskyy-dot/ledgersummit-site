'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useMemo, useRef, useState, useTransition } from 'react'
import type { Role, ScreenId } from '@/lib/auth/access'

type NavItem = {
  id: ScreenId
  label: string
  href: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'org', label: 'Organizations', href: '/org' },
  { id: 'home', label: 'Home', href: '/close' },
  { id: 'guide', label: 'Guide', href: '/guide' },
  { id: 'reports', label: 'Reports', href: '/reports' },
  { id: 'projects', label: 'Projects', href: '/projects' },
  { id: 'reconciliations', label: "Rec's", href: '/reconciliations' },
  { id: 'schedules', label: 'Schedules', href: '/schedules' },
  { id: 'variance', label: 'Variance', href: '/variance' },
  { id: 'rules', label: 'Rules', href: '/rules' },
  { id: 'checklist', label: 'Checklist', href: '/checklist' },
  { id: 'calendar', label: 'Calendar', href: '/calendar' },
  { id: 'admin', label: 'Admin', href: '/admin' },
]

type Props = {
  role: Role
  allowedScreens: ScreenId[]
  userName?: string | null
  userEmail?: string | null
}

type PillStyle = { left: number; width: number; opacity: number }

export function AppNav({ role, allowedScreens, userName, userEmail }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isPending, startTransition] = useTransition()

  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<ScreenId, HTMLAnchorElement>>(new Map())
  const [pill, setPill] = useState<PillStyle>({ left: 0, width: 0, opacity: 0 })

  const visibleItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) =>
        role === 'admin' || allowedScreens.includes(item.id)
      ),
    [role, allowedScreens]
  )

  const activeId = useMemo(
    () => visibleItems.find((item) => pathname?.startsWith(item.href))?.id ?? null,
    [pathname, visibleItems]
  )

  const measureItem = useCallback((id: ScreenId) => {
    const el = itemRefs.current.get(id)
    const container = containerRef.current
    if (!el || !container) return null
    const cRect = container.getBoundingClientRect()
    const eRect = el.getBoundingClientRect()
    return { left: eRect.left - cRect.left, width: eRect.width }
  }, [])

  const handleMouseEnter = useCallback(
    (id: ScreenId) => {
      const m = measureItem(id)
      if (m) setPill({ left: m.left, width: m.width, opacity: 1 })
    },
    [measureItem]
  )

  const handleContainerLeave = useCallback(() => {
    if (activeId) {
      const m = measureItem(activeId)
      if (m) setPill({ left: m.left, width: m.width, opacity: 1 })
    } else {
      setPill((p) => ({ ...p, opacity: 0 }))
    }
  }, [activeId, measureItem])

  const setRef = useCallback(
    (id: ScreenId) => (el: HTMLAnchorElement | null) => {
      if (el) itemRefs.current.set(id, el)
      else itemRefs.current.delete(id)
    },
    []
  )

  const handleLogout = () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    startTransition(async () => {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => { })
      router.push('/auth/login')
      router.refresh()
    })
  }

  return (
    <nav className="mb-6 border-b border-sky-800 bg-sky-700 text-white">
      <div className="flex flex-nowrap items-center gap-2 px-2 py-1.5">
        {/* Nav items container — relative so the pill can be positioned */}
        <div
          ref={containerRef}
          className="relative flex min-w-0 flex-1 gap-1 whitespace-nowrap overflow-x-auto"
          onMouseLeave={handleContainerLeave}
        >
          {/* Sliding highlight pill */}
          <div
            className="absolute top-0 h-full rounded-lg pointer-events-none"
            style={{
              left: pill.left,
              width: pill.width,
              opacity: pill.opacity,
              background: 'rgba(255,255,255,0.15)',
              transition: 'left 300ms cubic-bezier(.4,0,.2,1), width 250ms cubic-bezier(.4,0,.2,1), opacity 200ms ease',
              willChange: 'left, width, opacity',
            }}
          />
          {visibleItems.map((item) => {
            const isActive = pathname?.startsWith(item.href)
            return (
              <Link
                key={item.href}
                ref={setRef(item.id)}
                href={item.href}
                onMouseEnter={() => handleMouseEnter(item.id)}
                className={`relative z-10 inline-flex min-w-[104px] items-center justify-center rounded-lg px-3 py-1 text-[13px] transition-colors duration-150 ${isActive
                  ? 'text-white font-bold'
                  : 'text-white/80 font-medium hover:text-white'
                  }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs whitespace-nowrap">
          {(userName || userEmail) && (
            <span className="max-w-[180px] truncate text-white/80">
              {userName || userEmail}
            </span>
          )}
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut || isPending}
            className="rounded-md border border-white/40 bg-white/10 px-2.5 py-1 font-semibold text-white transition-colors duration-200 hover:bg-white/20 disabled:opacity-60"
          >
            {isLoggingOut || isPending ? 'Signing out…' : 'Logout'}
          </button>
        </div>
      </div>
    </nav>
  )
}
