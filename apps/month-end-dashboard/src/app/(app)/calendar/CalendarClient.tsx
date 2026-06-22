"use client"

import { useState } from 'react'
import CloseCalendar5DayClient from '@/components/close/CloseCalendar5DayClient'
import { TaskForm } from '../close/tasks/TaskForm'

type CloseTask = {
  id: string
  title: string
  description?: string | null
  owner_name?: string | null
  status?: string | null
  priority?: string | null
  due_date?: string | null
  computed_due_date?: string | null
}

export function CalendarClient({
  orgId,
  rangeFrom,
  rangeTo,
  tasks,
}: {
  orgId: string
  rangeFrom: string | null
  rangeTo: string | null
  tasks: CloseTask[]
}) {
  const [items, setItems] = useState<CloseTask[]>(tasks)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(data: any) {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        orgId,
        rangeFromDate: rangeFrom ?? new Date().toISOString().slice(0, 10),
        rangeToDate: rangeTo ?? new Date().toISOString().slice(0, 10),
        ...data,
      }
      const resp = await fetch('/api/close/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(text || 'Failed to create task')
      }
      const json = await resp.json()
      const newTask: CloseTask = json.task
      setItems((prev) => [newTask, ...prev])
      setModalOpen(false)
    } catch (err: any) {
      setError(err?.message || 'Failed to create task')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <CloseCalendar5DayClient
        rangeToISO={rangeTo ?? new Date().toISOString()}
        tasks={items}
        onAddTask={() => setModalOpen(true)}
      />

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-slate-900">Add task</div>
              <button
                className="text-sm text-slate-600 hover:text-slate-900"
                onClick={() => {
                  setModalOpen(false)
                  setError(null)
                }}
              >
                Close
              </button>
            </div>
            {error && (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            <div className="mt-3">
              <TaskForm
                onSubmit={handleAdd}
                onCancel={() => {
                  setModalOpen(false)
                  setError(null)
                }}
              />
              {saving && <div className="mt-2 text-xs text-slate-500">Saving…</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
