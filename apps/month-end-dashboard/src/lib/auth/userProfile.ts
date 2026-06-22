type AuthLikeUser = {
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}

const NAME_KEYS = ['user_name', 'full_name', 'name', 'preferred_username'] as const

export function normalizeUserName(value: string | null | undefined) {
  if (!value) return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized ? normalized.slice(0, 80) : null
}

function humanizeEmailLocalPart(email: string | null | undefined) {
  if (!email) return null
  const localPart = email.split('@')[0]?.trim()
  if (!localPart) return null

  const normalized = localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return null

  return normalized
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

export function deriveUserName(user: AuthLikeUser) {
  const metadata = user.user_metadata || {}

  for (const key of NAME_KEYS) {
    const value = metadata[key]
    if (typeof value === 'string') {
      const normalized = normalizeUserName(value)
      if (normalized) return normalized
    }
  }

  return humanizeEmailLocalPart(user.email)
}
