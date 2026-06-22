export type Role = 'admin' | 'user'

export type ScreenId =
  | 'home'
  | 'guide'
  | 'org'
  | 'reports'
  | 'projects'
  | 'reconciliations'
  | 'variance'
  | 'rules'
  | 'checklist'
  | 'calendar'
  | 'schedules'
  | 'admin'

export const ALL_SCREENS: ScreenId[] = [
  'home',
  'guide',
  'org',
  'reports',
  'projects',
  'reconciliations',
  'variance',
  'rules',
  'checklist',
  'calendar',
  'schedules',
  'admin',
]

export const DEFAULT_USER_SCREENS: ScreenId[] = ['home', 'guide', 'org', 'projects', 'checklist', 'calendar', 'schedules']

export function normalizeAllowedScreens(
  screens: string[] | null | undefined,
  role: Role,
): ScreenId[] {
  if (role === 'admin') return [...ALL_SCREENS]
  const valid = (screens || [])
    .map((s) => s.toLowerCase())
    .filter((s) => (ALL_SCREENS as string[]).includes(s)) as ScreenId[]
  if (!valid.length) return [...DEFAULT_USER_SCREENS]
  return Array.from(new Set(['guide', ...valid])) as ScreenId[]
}

export function canAccessScreen(role: Role, allowedScreens: ScreenId[], screen: ScreenId) {
  if (role === 'admin') return true
  return allowedScreens.includes(screen)
}
