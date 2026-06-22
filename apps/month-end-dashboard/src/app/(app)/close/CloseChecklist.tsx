'use client'

import { useState, useOptimistic, useTransition } from 'react'
import { createTask, updateTaskStatus, deleteTask, updateTask } from './tasks/actions'
import { TaskForm } from './tasks/TaskForm'
import { backfillTasksToRangeAction } from './tasks/backfill-action'
import { formatDateOnly } from '@/lib/dates/dateOnly'

interface CloseTask {
  id: string
  title: string
  description: string | null
  owner_name: string | null
  due_date: Date | string | null
  computed_due_date: Date | string | null
  due_type: string
  due_workday_n: number | null
  due_workday_anchor: string | null
  due_offset_days: number
  status: string
  priority: string
}

interface CloseChecklistProps {
  orgId: string
  rangeFromDate: string
  rangeToDate: string
  tasks: CloseTask[]
  unscopedTasks: CloseTask[]
}

export function CloseChecklist({
  orgId,
  rangeFromDate,
  rangeToDate,
  tasks: initialTasks,
  unscopedTasks,
}: CloseChecklistProps) {
  // Use optimistic updates for instant UI feedback
  const [optimisticTasks, updateOptimisticTasks] = useOptimistic(
    initialTasks,
    (state, optimisticValue: { id: string; action: 'update' | 'delete'; data?: Partial<CloseTask> }) => {
      if (optimisticValue.action === 'delete') {
        return state.filter(t => t.id !== optimisticValue.id)
      }
      if (optimisticValue.action === 'update' && optimisticValue.data) {
        return state.map(t =>
          t.id === optimisticValue.id
            ? { ...t, ...optimisticValue.data }
            : t
        )
      }
      return state
    }
  )

  const [isPending, startTransition] = useTransition()
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingTask, setEditingTask] = useState<CloseTask | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  async function handleCreateTask(data: any) {
    try {
      await createTask({
        orgId,
        rangeFromDate,
        rangeToDate,
        title: data.title,
        description: data.description,
        ownerName: data.ownerName,
        dueType: data.dueType || 'fixed',
        dueDate: data.dueDate,
        dueWorkdayN: data.dueWorkdayN,
        dueWorkdayAnchor: data.dueWorkdayAnchor,
        dueOffsetDays: data.dueOffsetDays || 0,
        priority: data.priority || 'normal',
      })
      setShowAddForm(false)
      window.location.reload()
    } catch (err) {
      console.error('Failed to create task:', err)
      throw err
    }
  }

  async function handleBackfill() {
    if (!confirm(`Assign ${unscopedTasks.length} unscoped task(s) to current range?`)) return

    setLoading('backfill')
    try {
      await backfillTasksToRangeAction(orgId, rangeFromDate, rangeToDate)
      window.location.reload()
    } catch (err) {
      console.error('Failed to backfill tasks:', err)
      setLoading(null)
    }
  }

  async function handleStatusChange(taskId: string, status: 'open' | 'in_progress' | 'blocked' | 'done') {
    // Optimistically update UI immediately
    startTransition(() => {
      updateOptimisticTasks({ id: taskId, action: 'update', data: { status } })
    })

    try {
      await updateTaskStatus(taskId, orgId, status)
      // Server action will trigger revalidation automatically
    } catch (err) {
      console.error('Failed to update status:', err)
      // UI will revert when page revalidates
    }
  }

  async function handleDelete(taskId: string) {
    if (!confirm('Are you sure you want to delete this task?')) return

    // Optimistically remove from UI immediately
    startTransition(() => {
      updateOptimisticTasks({ id: taskId, action: 'delete' })
    })

    try {
      await deleteTask(taskId, orgId)
      // Server action will trigger revalidation automatically
    } catch (err) {
      console.error('Failed to delete task:', err)
      // UI will revert when page revalidates
    }
  }

  async function handleUpdateTask(taskId: string, data: any) {
    // Optimistically update UI immediately
    startTransition(() => {
      updateOptimisticTasks({
        id: taskId,
        action: 'update',
        data: {
          title: data.title,
          description: data.description,
          owner_name: data.ownerName,
          due_type: data.dueType,
          priority: data.priority,
        }
      })
    })

    try {
      await updateTask({
        taskId,
        orgId,
        title: data.title,
        description: data.description,
        ownerName: data.ownerName,
        dueType: data.dueType,
        dueDate: data.dueDate,
        dueWorkdayN: data.dueWorkdayN,
        dueWorkdayAnchor: data.dueWorkdayAnchor,
        dueOffsetDays: data.dueOffsetDays,
        priority: data.priority,
      })
      setEditingTask(null)
      // Server action will trigger revalidation automatically
    } catch (err) {
      console.error('Failed to update task:', err)
      throw err
    }
  }

  function getPriorityColor(priority: string) {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800'
      case 'normal':
        return 'bg-yellow-100 text-yellow-800'
      case 'low':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'done':
        return 'bg-green-100 text-green-800'
      case 'in_progress':
        return 'bg-blue-100 text-blue-800'
      case 'blocked':
        return 'bg-red-100 text-red-800'
      case 'open':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  function formatDate(date: Date | string | null) {
    if (!date) return '—'
    // If it's already a string in YYYY-MM-DD format, use formatDateOnly
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) {
      return formatDateOnly(date)
    }
    // Otherwise, convert to ISO string first
    const iso = typeof date === 'string' ? date.split('T')[0] : date.toISOString().split('T')[0]
    return formatDateOnly(iso)
  }

  function getDueDateLabel(task: CloseTask) {
    const dateStr = formatDate(task.computed_due_date)
    if (task.due_type === 'workday') {
      const anchor = task.due_workday_anchor === 'month_start' ? 'Start' : 'End'
      const n = task.due_workday_n || 1
      const offset = task.due_offset_days || 0
      const offsetStr = offset !== 0 ? `, ${offset > 0 ? '+' : ''}${offset} days` : ''
      return `${dateStr} (Workday ${anchor}, #${n}${offsetStr})`
    }
    return `${dateStr} (Fixed)`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Close Checklist</h2>
        {!showAddForm && !editingTask && (
          <button
            onClick={() => setShowAddForm(true)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add Task
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <TaskForm
            onSubmit={handleCreateTask}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {/* Unscoped tasks section */}
      {unscopedTasks.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-yellow-800">
                Unscoped Tasks ({unscopedTasks.length})
              </h3>
              <p className="text-xs text-yellow-700 mt-1">
                Tasks created before date range scoping. Assign them to current range?
              </p>
            </div>
            <button
              onClick={handleBackfill}
              disabled={loading === 'backfill'}
              className="rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50"
            >
              {loading === 'backfill' ? 'Assigning...' : 'Assign to Current Range'}
            </button>
          </div>
        </div>
      )}

      {optimisticTasks.length === 0 && unscopedTasks.length === 0 && !showAddForm ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
          <p className="text-gray-500">No tasks yet. Add tasks for this close.</p>
        </div>
      ) : optimisticTasks.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Task
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Owner
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Due
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Priority
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {optimisticTasks.map((task) => {
                if (editingTask?.id === task.id) {
                  return (
                    <tr key={task.id} className="bg-blue-50">
                      <td colSpan={6} className="px-6 py-4">
                        <TaskForm
                          task={task}
                          onSubmit={(data) => handleUpdateTask(task.id, data)}
                          onCancel={() => setEditingTask(null)}
                        />
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={task.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(
                          task.status
                        )}`}
                      >
                        {task.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{task.title}</div>
                      {task.description && (
                        <div className="text-sm text-gray-500">{task.description}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                      {task.owner_name || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="text-gray-900">{formatDate(task.computed_due_date)}</div>
                      <div className="text-xs text-gray-500">
                        {task.due_type === 'workday'
                          ? `Workday (${task.due_workday_anchor === 'month_start' ? 'Start' : 'End'}, #${task.due_workday_n || 1})`
                          : 'Fixed'}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getPriorityColor(
                          task.priority
                        )}`}
                      >
                        {task.priority}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        {task.status !== 'done' && (
                          <button
                            onClick={() => handleStatusChange(task.id, 'done')}
                            disabled={loading === task.id}
                            className="text-green-600 hover:text-green-900 disabled:opacity-50"
                          >
                            Done
                          </button>
                        )}
                        {task.status !== 'in_progress' && (
                          <button
                            onClick={() => handleStatusChange(task.id, 'in_progress')}
                            disabled={loading === task.id}
                            className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                          >
                            In Progress
                          </button>
                        )}
                        {task.status !== 'blocked' && (
                          <button
                            onClick={() => handleStatusChange(task.id, 'blocked')}
                            disabled={loading === task.id}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                          >
                            Blocked
                          </button>
                        )}
                        <button
                          onClick={() => setEditingTask(task)}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(task.id)}
                          disabled={loading === task.id}
                          className="text-red-600 hover:text-red-900 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

