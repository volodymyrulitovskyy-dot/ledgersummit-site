import { requireScreen } from '@/lib/auth/guard'
import { ensureUser } from '@/lib/auth/ensureUser'
import { prisma } from '@/lib/db/prisma'
import { AdminUsersTable } from './users/AdminUsersTable'
import { CreateOrgForm } from '@/app/(app)/org/CreateOrgForm'
import { OrgList } from '@/app/(app)/org/OrgList'
import { selectOrgAction } from '@/app/(app)/org/actions'
import { AdminTabs } from './AdminTabs'

export default async function AdminPage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string }>
}) {
    await requireScreen('admin')
    const user = await ensureUser()
    const params = await searchParams

    const initialTab = params.tab === 'org' ? 'org' as const : 'users' as const

    // Fetch users data
    const users = await prisma.user.findMany({
        orderBy: [{ created_at: 'asc' }],
        select: {
            id: true,
            email: true,
            user_name: true,
            role: true,
            is_active: true,
            allowed_screens: true,
            last_login: true,
            created_at: true,
        },
    })

    // Fetch orgs data
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

    const orgs = orgMembers.map((om) => om.org)

    const usersContent = <AdminUsersTable users={users} />

    const orgContent = (
        <div className="space-y-6">
            {/* Create Org Form */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Create New Organization</h2>
                <CreateOrgForm />
            </div>

            {/* Org List */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Your Organizations</h2>
                {orgs.length === 0 ? (
                    <p className="text-slate-500">You don&apos;t belong to any organizations yet. Create one above.</p>
                ) : (
                    <OrgList orgs={orgs} selectOrg={selectOrgAction} />
                )}
            </div>
        </div>
    )

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Admin</h1>
                    <p className="text-sm text-slate-600 mt-1">
                        Manage users, roles, and organizations.
                    </p>
                </div>

                <AdminTabs
                    initialTab={initialTab}
                    usersContent={usersContent}
                    orgContent={orgContent}
                />
            </div>
        </div>
    )
}
