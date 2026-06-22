'use client'

import { useState } from 'react'

interface Org {
  id: string
  name: string
  created_at: Date
}

interface OrgListProps {
  orgs: Org[]
  selectOrg: (orgId: string) => Promise<void>
}

export function OrgList({ orgs, selectOrg }: OrgListProps) {
  const [selectingId, setSelectingId] = useState<string | null>(null)

  async function handleSelect(orgId: string) {
    setSelectingId(orgId)
    try {
      await selectOrg(orgId)
    } catch (err) {
      console.error('Failed to select org:', err)
      setSelectingId(null)
    }
  }

  return (
    <div className="space-y-2">
      {orgs.map((org) => (
        <div
          key={org.id}
          className="flex items-center justify-between rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
        >
          <div>
            <h3 className="font-medium text-gray-900">{org.name}</h3>
            <p className="text-sm text-gray-500">
              Created {new Date(org.created_at).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={() => handleSelect(org.id)}
            disabled={selectingId === org.id}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {selectingId === org.id ? 'Selecting...' : 'Select'}
          </button>
        </div>
      ))}
    </div>
  )
}

