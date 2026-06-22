import { cookies } from 'next/headers'

const ACTIVE_ORG_ID_COOKIE = 'active_org_id'
const ACTIVE_PERIOD_FROM_ID_COOKIE = 'active_period_from_id'
const ACTIVE_PERIOD_TO_ID_COOKIE = 'active_period_to_id'
const RANGE_FROM_DATE_COOKIE = 'range_from_date'
const RANGE_TO_DATE_COOKIE = 'range_to_date'

export async function getActiveOrgId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(ACTIVE_ORG_ID_COOKIE)?.value || null
}

export async function setActiveOrgId(orgId: string) {
  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_ORG_ID_COOKIE, orgId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })
}

export async function clearActiveOrgId() {
  const cookieStore = await cookies()
  cookieStore.delete(ACTIVE_ORG_ID_COOKIE)
}

// Legacy function for backwards compatibility (uses to_id)
export async function getActivePeriodId(): Promise<string | null> {
  return getActivePeriodToId()
}

export async function setActivePeriodId(periodId: string) {
  await setActivePeriodToId(periodId)
}

export async function clearActivePeriodId() {
  await clearActivePeriodRange()
}

// New period range functions
export async function getActivePeriodFromId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(ACTIVE_PERIOD_FROM_ID_COOKIE)?.value || null
}

export async function setActivePeriodFromId(periodId: string) {
  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_PERIOD_FROM_ID_COOKIE, periodId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })
}

export async function getActivePeriodToId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(ACTIVE_PERIOD_TO_ID_COOKIE)?.value || null
}

export async function setActivePeriodToId(periodId: string) {
  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_PERIOD_TO_ID_COOKIE, periodId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })
}

export async function clearActivePeriodRange() {
  const cookieStore = await cookies()
  cookieStore.delete(ACTIVE_PERIOD_FROM_ID_COOKIE)
  cookieStore.delete(ACTIVE_PERIOD_TO_ID_COOKIE)
}

// Date range functions (single range)
export async function getRangeFromDate(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(RANGE_FROM_DATE_COOKIE)?.value || null
}

export async function setRangeFromDate(dateISO: string) {
  const cookieStore = await cookies()
  cookieStore.set(RANGE_FROM_DATE_COOKIE, dateISO, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })
}

export async function getRangeToDate(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(RANGE_TO_DATE_COOKIE)?.value || null
}

export async function setRangeToDate(dateISO: string) {
  const cookieStore = await cookies()
  cookieStore.set(RANGE_TO_DATE_COOKIE, dateISO, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })
}

export async function clearRangeDates() {
  const cookieStore = await cookies()
  cookieStore.delete(RANGE_FROM_DATE_COOKIE)
  cookieStore.delete(RANGE_TO_DATE_COOKIE)
}

