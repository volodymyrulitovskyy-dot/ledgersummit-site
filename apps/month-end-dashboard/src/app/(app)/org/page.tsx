import { getActiveOrgId, getRangeFromDate, getRangeToDate } from '@/lib/active'
import { requireScreen } from '@/lib/auth/guard'
import { ensureUser } from '@/lib/auth/ensureUser'
import { prisma } from '@/lib/db/prisma'
import { CreateOrgForm } from './CreateOrgForm'
import { OrgList } from './OrgList'
import { selectOrgAction } from './actions'
import { QboConnection } from '@/app/(app)/close/QboConnection'
import { isoToUTCDateOnly } from '@/lib/dates/dateOnly'

export default async function OrgPage() {
  await requireScreen('org')
  const user = await ensureUser()
  const activeOrgId = await getActiveOrgId()
  const rangeFromDate = await getRangeFromDate()
  const rangeToDate = await getRangeToDate()

  const orgMembers = await prisma.orgMember.findMany({
    where: { user_id: user.id },
    include: {
      org: {
        select: {
          id: true,
          name: true,
          created_at: true,
        },
      },
    },
    orderBy: { org: { created_at: 'desc' } },
  })

  const orgs = orgMembers.map((member) => member.org)
  const activeOrg = activeOrgId ? orgs.find((org) => org.id === activeOrgId) || null : null
  const qboConnection = activeOrgId
    ? await prisma.qboConnection.findUnique({
      where: { org_id: activeOrgId },
      select: { realm_id: true },
    })
    : null
  const tbSnapshot = activeOrgId
    ? await prisma.tbSnapshot.findFirst({
      where: rangeFromDate && rangeToDate
        ? {
          org_id: activeOrgId,
          range_from_date: isoToUTCDateOnly(rangeFromDate),
          range_to_date: isoToUTCDateOnly(rangeToDate),
        }
        : { org_id: activeOrgId },
      orderBy: { imported_at: 'desc' },
      select: { id: true },
    })
    : null

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-slate-900">Choose an organization</h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Select the organization you want to work in for this close, or create a new one to get started.
          </p>
        </div>

        {activeOrgId && activeOrg ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Active organization</h2>
              <p className="mt-2 text-sm text-slate-600">
                Managing QuickBooks connection for <span className="font-semibold text-slate-900">{activeOrg.name}</span>.
              </p>
            </div>

            <QboConnection
              orgId={activeOrgId}
              isConnected={!!qboConnection}
              realmId={qboConnection?.realm_id ?? null}
              hasSnapshot={!!tbSnapshot}
              rangeFromDate={rangeFromDate}
              rangeToDate={rangeToDate}
            />
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Create a new organization</h2>
          <CreateOrgForm />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Your organizations</h2>
          <div className="mt-4">
            {orgs.length === 0 ? (
              <p className="text-sm text-slate-500">
                You do not belong to any organizations yet. Create one above to continue.
              </p>
            ) : (
              <OrgList orgs={orgs} selectOrg={selectOrgAction} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
