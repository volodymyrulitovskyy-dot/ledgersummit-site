'use client'

import { useState } from 'react'

interface CloseTask {
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
}

interface TaskFormProps {
  task?: CloseTask
  onSubmit: (data: any) => Promise<void>
  onCancel: () => void
}

export function TaskForm({ task, onSubmit, onCancel }: TaskFormProps) {
  const [title, setTitle] = useState(task?.title || '')
  const [description, setDescription] = useState(task?.description || '')
  const [ownerName, setOwnerName] = useState(task?.owner_name || '')
  const [dueType, setDueType] = useState<'fixed' | 'workday'>(
    (task?.due_type as 'fixed' | 'workday') || 'fixed'
  )
  const [dueDate, setDueDate] = useState(
    task?.due_date ? new Date(task.due_date).toISOString().split('T')[0] : ''
  )
  const [dueWorkdayN, setDueWorkdayN] = useState<number>(
    task?.due_workday_n || 1
  )
  const [dueWorkdayAnchor, setDueWorkdayAnchor] = useState<'month_start' | 'month_end'>(
    (task?.due_workday_anchor as 'month_start' | 'month_end') || 'month_end'
  )
  const [dueOffsetDays, setDueOffsetDays] = useState<number>(
    task?.due_offset_days || 0
  )
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>(
    (task?.priority as 'low' | 'normal' | 'high') || 'normal'
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await onSubmit({
        title,
        description,
        ownerName,
        dueType,
        dueDate: dueType === 'fixed' ? dueDate : null,
        dueWorkdayN: dueType === 'workday' ? dueWorkdayN : null,
        dueWorkdayAnchor: dueType === 'workday' ? dueWorkdayAnchor : null,
        dueOffsetDays: dueType === 'workday' ? dueOffsetDays : 0,
        priority,
      })
    } catch (err: any) {
      setError(err.message || 'Failed to save task')
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">Title *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Owner</label>
        <input
          type="text"
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          placeholder="Name"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Due Date Type</label>
        <div className="flex gap-4">
          <label className="flex items-center">
            <input
              type="radio"
              name="dueType"
              value="fixed"
              checked={dueType === 'fixed'}
              onChange={(e) => setDueType(e.target.value as 'fixed' | 'workday')}
              className="mr-2"
            />
            Fixed Date
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="dueType"
              value="workday"
              checked={dueType === 'workday'}
              onChange={(e) => setDueType(e.target.value as 'fixed' | 'workday')}
              className="mr-2"
            />
            Workday Rule
          </label>
        </div>
      </div>

      {dueType === 'fixed' ? (
        <div>
          <label className="block text-sm font-medium text-gray-700">Due Date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
          />
        </div>
      ) : (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Anchor</label>
            <select
              value={dueWorkdayAnchor}
              onChange={(e) =>
                setDueWorkdayAnchor(e.target.value as 'month_start' | 'month_end')
              }
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            >
              <option value="month_end">Month End</option>
              <option value="month_start">Month Start</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Nth Workday{' '}
              {dueWorkdayAnchor === 'month_end'
                ? '(1 = last workday, 2 = second-to-last, etc.)'
                : '(1 = first workday, 2 = second, etc.)'}
            </label>
            <input
              type="number"
              value={dueWorkdayN}
              onChange={(e) => setDueWorkdayN(parseInt(e.target.value) || 1)}
              min="1"
              max="31"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Offset Days (can be negative)
            </label>
            <input
              type="number"
              value={dueOffsetDays}
              onChange={(e) => setDueOffsetDays(parseInt(e.target.value) || 0)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">Priority</label>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as 'low' | 'normal' | 'high')}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Saving...' : task ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  )
}
