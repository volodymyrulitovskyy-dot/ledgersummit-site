"use client"

import React, { useMemo, useState } from 'react'

type Task = {
  id: string
  title: string
  description?: string | null
  owner_name?: string | null
  status?: string | null
  priority?: string | null
  due_date?: string | null
  computed_due_date?: string | null
}

type Day = {
  key: string
  label: string
  iso: string
  date: Date
}

function parseISODateLocal(iso?: string | null): Date | null {
  if (!iso || typeof iso !== 'string') return null
  const s = iso.slice(0, 10)
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function nextBusinessDay(from: Date) {
  const dt = new Date(from)
  dt.setDate(dt.getDate() + 1)
  while (dt.getDay() === 0 || dt.getDay() === 6) {
    dt.setDate(dt.getDate() + 1)
  }
  return dt
}

function buildDays(rangeToISO: string): Day[] {
  const anchor = parseISODateLocal(rangeToISO) ?? new Date()
  const days: Day[] = []
  let cursor = nextBusinessDay(anchor)
  for (let i = 1; i <= 5; i++) {
    const iso = cursor.toISOString().slice(0, 10)
    days.push({
      key: `day${i}`,
      label: `Day ${i}`,
      iso,
      date: new Date(cursor),
    })
    cursor = nextBusinessDay(cursor)
  }
  return days
}

export type CloseCalendar5DayProps = {
  rangeToISO: string
  tasks: Task[]
  onAddTask?: () => void
  onAssignDueDate?: (taskId: string, dueDateISO: string) => Promise<void> | void
}

export function CloseCalendar5Day({ rangeToISO, tasks, onAddTask, onAssignDueDate }: CloseCalendar5DayProps) {
  const safeTasks = Array.isArray(tasks) ? tasks : []
  const days = useMemo(() => buildDays(rangeToISO), [rangeToISO])

  const buckets = useMemo(() => {
    const byKey: Record<string, Task[]> = {}
    for (const day of days) byKey[day.key] = []
    const noDue: Task[] = []
    for (const t of safeTasks) {
      const iso = t.computed_due_date || t.due_date
      const dt = parseISODateLocal(iso)
      if (!dt) {
        noDue.push(t)
        continue
      }
      const key = days.find((d) => d.iso === dt.toISOString().slice(0, 10))?.key
      if (key) byKey[key].push(t)
      else noDue.push(t)
    }
    return { byKey, noDue }
  }, [safeTasks, days])

  const [showNoDueAll, setShowNoDueAll] = useState(false)
  const toggleNoDue = () => setShowNoDueAll((v) => !v)

  const assignQuick = async (taskId: string, iso: string) => {
    if (!onAssignDueDate) return
    await onAssignDueDate(taskId, iso)
  }

  const renderTask = (t: Task) => (
    <div key={t.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-sm font-semibold text-slate-900">{t.title}</div>
      {t.description && <div className="text-xs text-slate-600">{t.description}</div>}
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>{t.owner_name || 'Unassigned'}</span>
        {t.priority && <span className="rounded-full bg-slate-100 px-2 py-0.5">{t.priority}</span>}
        {t.status && <span className="rounded-full bg-slate-100 px-2 py-0.5">{t.status}</span>}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">5-Day Close Calendar</h2>
          <p className="text-sm text-slate-600">
            Based on the business days after your range end. Assign tasks quickly to Day 1–5.
          </p>
        </div>
        {onAddTask && (
          <button
            onClick={onAddTask}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Add task
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        {days.map((day) => {
          const list = Array.isArray(buckets.byKey[day.key]) ? buckets.byKey[day.key] : []
          const safeList = list.slice(0, 4)
          const hasOverflow = list.length > 4
          return (
            <div key={day.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="text-sm font-semibold text-slate-900">{day.label}</div>
              <div className="text-xs text-slate-500">{day.iso}</div>
              <div className="space-y-2">
                {safeList.map(renderTask)}
                {hasOverflow && (
                  <div className="text-xs text-slate-500">+{list.length - 4} more</div>
                )}
                {list.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-500">
                    No tasks
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">No due date</div>
          <button
            type="button"
            onClick={toggleNoDue}
            className="text-xs font-medium text-slate-600 hover:text-slate-800"
          >
            {showNoDueAll ? 'Show less' : 'Show all'}
          </button>
        </div>
        <div className="mt-2 space-y-2">
          { (showNoDueAll ? buckets.noDue : buckets.noDue.slice(0, 5)).map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <div>
                <div className="text-sm font-semibold text-slate-900">{t.title}</div>
                <div className="text-xs text-slate-500">{t.owner_name || 'Unassigned'}</div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  onChange={(e) => {
                    if (e.target.value) assignQuick(t.id, e.target.value)
                    e.target.value = ''
                  }}
                  defaultValue=""
                >
                  <option value="">Set due →</option>
                  {days.map((d) => (
                    <option key={d.key} value={d.iso}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          {buckets.noDue.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
              None without due dates
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
