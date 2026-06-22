'use client'

import { useMemo, useState } from 'react'
import { ALL_SCREENS, DEFAULT_USER_SCREENS, ScreenId } from '@/lib/auth/access'

type UserRow = {
  id: string
  email: string
  user_name: string | null
  role: string
  is_active: boolean
  allowed_screens: string[]
  last_login: string | Date | null
  created_at: string | Date | null
}

type Props = {
  users: UserRow[]
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return 'Request failed'
}

export function AdminUsersTable({ users }: Props) {
  const [rows, setRows] = useState<UserRow[]>(users)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user')
  const [adding, setAdding] = useState(false)

  const screenOptions = useMemo(() => ALL_SCREENS, [])

  const updateRow = (id: string, patch: Partial<UserRow>) => {
    setRows((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)))
  }

  const toggleScreen = (id: string, screen: ScreenId) => {
    setRows((prev) =>
      prev.map((u) => {
        if (u.id !== id) return u
        const has = (u.allowed_screens || []).includes(screen)
        const nextScreens = has
          ? u.allowed_screens.filter((s) => s !== screen)
          : [...(u.allowed_screens || []), screen]
        return { ...u, allowed_screens: nextScreens }
      })
    )
  }

  const resetScreens = (id: string, role: string) => {
    updateRow(id, {
      allowed_screens: role === 'admin' ? [...ALL_SCREENS] : [...DEFAULT_USER_SCREENS],
    })
  }

  const addUser = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!email) {
      setMessage('Email is required')
      return
    }
    setAdding(true)
    setMessage(null)
    try {
      const resp = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          role: newRole,
          allowed_screens: newRole === 'admin' ? ALL_SCREENS : DEFAULT_USER_SCREENS,
        }),
      })
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(text || 'Failed to add user')
      }
      const json = await resp.json()
      const user: UserRow = json.user
      setRows((prev) => {
        const others = prev.filter((u) => u.id !== user.id)
        return [user, ...others]
      })
      setNewEmail('')
      setNewRole('user')
      setMessage(json.status === 'updated' ? 'User updated' : 'User created')
    } catch (err: unknown) {
      setMessage(getErrorMessage(err))
    } finally {
      setAdding(false)
    }
  }

  const saveRow = async (id: string) => {
    const row = rows.find((u) => u.id === id)
    if (!row) return
    setSavingId(id)
    setMessage(null)
    try {
      const resp = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: row.role,
          is_active: row.is_active,
          allowed_screens:
            row.role === 'admin'
              ? ALL_SCREENS
              : (row.allowed_screens && row.allowed_screens.length > 0
                  ? row.allowed_screens
                  : DEFAULT_USER_SCREENS),
        }),
      })
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(text || 'Failed to save user')
      }
      setMessage('Saved')
    } catch (err: unknown) {
      setMessage(getErrorMessage(err))
    } finally {
      setSavingId(null)
    }
  }

  const formatDate = (d: string | Date | null) => {
    if (!d) return '—'
    const date = d instanceof Date ? d : new Date(d)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleString()
  }

  return (
    <div className="space-y-3">
      {message && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          {message}
        </div>
      )}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col gap-3">
        <div className="text-base font-semibold text-slate-900">Add user</div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="email"
            placeholder="user@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="w-64 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as 'admin' | 'user')}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="button"
            onClick={addUser}
            disabled={adding}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {adding ? 'Adding…' : 'Add user'}
          </button>
        </div>
        <div className="text-xs text-slate-500">
          New users must still sign up via /auth; role and access will apply on first login.
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full table-auto border-separate border-spacing-0">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Email</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Role</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Active</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Allowed screens</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Last login</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-4 py-3 text-sm text-slate-900">{u.user_name || '—'}</td>
                <td className="px-4 py-3 text-sm text-slate-900">{u.email}</td>
                <td className="px-4 py-3 text-sm">
                  <select
                    value={u.role === 'admin' ? 'admin' : 'user'}
                    onChange={(e) => {
                      const nextRole = e.target.value === 'admin' ? 'admin' : 'user'
                      updateRow(u.id, {
                        role: nextRole,
                        allowed_screens: nextRole === 'admin' ? [...ALL_SCREENS] : [...DEFAULT_USER_SCREENS],
                      })
                    }}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={u.is_active}
                    onChange={(e) => updateRow(u.id, { is_active: e.target.checked })}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {screenOptions.map((screen) => {
                      const checked = (u.allowed_screens || []).includes(screen)
                      return (
                        <label key={screen} className="flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={u.role === 'admin'}
                            onChange={() => toggleScreen(u.id, screen)}
                          />
                          <span>{screen}</span>
                        </label>
                      )
                    })}
                  </div>
                  {u.role !== 'admin' && (
                    <button
                      type="button"
                      onClick={() => resetScreens(u.id, u.role)}
                      className="mt-2 text-xs text-blue-600 hover:text-blue-500"
                    >
                      Reset defaults
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">{formatDate(u.last_login)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => saveRow(u.id)}
                    disabled={savingId === u.id}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {savingId === u.id ? 'Saving…' : 'Save'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
