import { requireScreen } from '@/lib/auth/guard'
import { prisma } from '@/lib/db/prisma'
import { AdminUsersTable } from './AdminUsersTable'

export default async function AdminUsersPage() {
  await requireScreen('admin')

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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Admin · Users</h1>
            <p className="text-sm text-slate-600">
              Manage roles, access, and allowed screens.
            </p>
          </div>
        </div>

        <AdminUsersTable users={users} />
      </div>
    </div>
  )
}
