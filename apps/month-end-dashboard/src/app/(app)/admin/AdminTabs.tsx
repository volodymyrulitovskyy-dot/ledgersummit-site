'use client'

import { useState } from 'react'

type Tab = 'users' | 'org'

type Props = {
    initialTab: Tab
    usersContent: React.ReactNode
    orgContent: React.ReactNode
}

const TABS: { id: Tab; label: string }[] = [
    { id: 'users', label: 'Users' },
    { id: 'org', label: 'Organization' },
]

export function AdminTabs({ initialTab, usersContent, orgContent }: Props) {
    const [activeTab, setActiveTab] = useState<Tab>(initialTab)

    return (
        <div className="space-y-6">
            {/* Tab bar */}
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${activeTab === tab.id
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div>
                {activeTab === 'users' && usersContent}
                {activeTab === 'org' && orgContent}
            </div>
        </div>
    )
}
