"use client"

import { useMemo, useState } from 'react'
import { TaskForm } from '../close/tasks/TaskForm'

type CloseTask = {
  id: string
  title: string
  description: string | null
  owner_name: string | null
  due_date: Date | string | null
  due_type: string
  due_workday_n: number | null
  due_workday_anchor: string | null
  due_offset_days: number
  status: string
  priority: string
  computed_due_date?: string | null
}

type Props = {
  orgId: string
  rangeFrom?: string | null
  rangeTo?: string | null
  tasks: CloseTask[]
}

export function ChecklistClient({ orgId, rangeFrom, rangeTo, tasks }: Props) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CloseTask | null>(null)
  const [items, setItems] = useState<CloseTask[]>(tasks)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusSaving, setStatusSaving] = useState<Record<string, boolean>>({})

  const sections: { title: string; statuses: string[] }[] = useMemo(
    () => [
      { title: 'Open', statuses: ['open', 'in_progress', 'blocked'] },
      { title: 'Done', statuses: ['done'] },
    ],
    []
  )

  async function saveTask(data: any) {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        orgId,
        rangeFromDate: rangeFrom ?? new Date().toISOString().slice(0, 10),
        rangeToDate: rangeTo ?? new Date().toISOString().slice(0, 10),
        ...data,
      }
      const resp = await fetch(editing ? `/api/close/tasks/${editing.id}` : '/api/close/tasks', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(text || 'Failed to save task')
      }
      const json = await resp.json()
      const newTask: CloseTask = json.task
      setItems((prev) => {
        const others = prev.filter((t) => t.id !== newTask.id)
        return [newTask, ...others]
      })
      setModalOpen(false)
      setEditing(null)
    } catch (err: any) {
      setError(err?.message || 'Failed to save task')
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(taskId: string, status: string) {
    setStatusSaving((prev) => ({ ...prev, [taskId]: true }))
    try {
      const resp = await fetch(`/api/close/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(text || 'Failed to update status')
      }
      const json = await resp.json()
      const updated: CloseTask = json.task
      setItems((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: updated.status } : t)))
    } catch (err: any) {
      setError(err?.message || 'Failed to update status')
    } finally {
      setStatusSaving((prev) => ({ ...prev, [taskId]: false }))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Checklist</h2>
          <p className="text-sm text-slate-600">Manage tasks for the active org.</p>
        </div>
        <button
          onClick={() => {
            setEditing(null)
            setModalOpen(true)
          }}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Add task
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {sections.map((sec) => {
          const list = items.filter((t) => sec.statuses.includes((t.status || '').toLowerCase()))
          return (
            <div key={sec.title} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold text-slate-900">{sec.title}</div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                  {list.length} tasks
                </div>
              </div>
              {list.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                  No tasks
                </div>
              ) : (
                <div className="space-y-2">
                  {list.map((t) => {
                    const dueStr = t.computed_due_date || (t.due_date ? String(t.due_date).slice(0, 10) : null)
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    const dueDate = dueStr ? new Date(dueStr + 'T00:00:00') : null
                    const isDone = (t.status || '').toLowerCase() === 'done'
                    const isOverdue = dueDate && !isDone && dueDate < today
                    const daysLate = dueDate && isOverdue
                      ? Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
                      : 0

                    return (
                      <div
                        key={t.id}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 hover:border-slate-300"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{t.title}</div>
                            {t.description && <div className="text-xs text-slate-600">{t.description}</div>}
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span>{t.owner_name || 'Unassigned'}</span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5">
                                <select
                                  value={t.status || 'open'}
                                  onChange={(e) => updateStatus(t.id, e.target.value)}
                                  className="bg-transparent text-xs"
                                  disabled={statusSaving[t.id]}
                                >
                                  <option value="open">Open</option>
                                  <option value="in_progress">In progress</option>
                                  <option value="blocked">Blocked</option>
                                  <option value="done">Done</option>
                                </select>
                              </span>
                              {t.priority && <span className="rounded-full bg-slate-100 px-2 py-0.5">{t.priority}</span>}
                              {dueStr && (
                                <span className={`rounded-full px-2 py-0.5 ${isOverdue ? 'bg-red-100 text-red-700 font-semibold' : 'bg-slate-100'}`}>
                                  Due: {dueStr}
                                </span>
                              )}
                              {isOverdue && daysLate > 0 && (
                                <span className="rounded-full bg-red-500 px-2 py-0.5 text-white font-semibold">
                                  {daysLate} day{daysLate !== 1 ? 's' : ''} late
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            className="text-xs text-slate-600 hover:text-slate-900"
                            onClick={() => {
                              setEditing(t)
                              setModalOpen(true)
                            }}
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-slate-900">
                {editing ? 'Edit task' : 'Add task'}
              </div>
              <button
                className="text-sm text-slate-600 hover:text-slate-900"
                onClick={() => {
                  setModalOpen(false)
                  setEditing(null)
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
                task={editing || undefined}
                onSubmit={saveTask}
                onCancel={() => {
                  setModalOpen(false)
                  setEditing(null)
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
