"use client"

import { useState } from 'react'

type Props = {
  overview: React.ReactNode
  workflow: React.ReactNode
}

export function CloseTabs({ overview, workflow }: Props) {
  const [tab, setTab] = useState<'overview' | 'workflow'>('overview')

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'workflow', label: 'Workflow' },
  ] as const

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
        {tabs.map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                'px-4 py-2 text-sm rounded-full transition-all duration-200 transform',
                'scale-80 hover:scale-135',
                active
                  ? 'bg-slate-900 text-white shadow ring-4 ring-slate-900/70 font-bold'
                  : 'text-slate-600 hover:bg-slate-100 ring-1 ring-slate-200 font-medium',
              ].join(' ')}
              type="button"
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div>{tab === 'overview' ? overview : workflow}</div>
    </div>
  )
}
