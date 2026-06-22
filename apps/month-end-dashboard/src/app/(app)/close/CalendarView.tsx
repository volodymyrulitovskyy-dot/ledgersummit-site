'use client'

import { formatDateOnly } from '@/lib/dates/dateOnly'

interface CloseTask {
  id: string
  title: string
  description: string | null
  owner_name: string | null
  computed_due_date: Date | string | null
  status: string
  priority: string
}

interface CalendarViewProps {
  tasks: CloseTask[]
}

export function CalendarView({ tasks }: CalendarViewProps) {
  // Group tasks by computed due date
  const tasksByDate = new Map<string, CloseTask[]>()
  const noDueDate: CloseTask[] = []

  tasks.forEach((task) => {
    if (task.computed_due_date) {
      const date = new Date(task.computed_due_date).toISOString().split('T')[0]
      if (!tasksByDate.has(date)) {
        tasksByDate.set(date, [])
      }
      tasksByDate.get(date)!.push(task)
    } else {
      noDueDate.push(task)
    }
  })

  // Sort dates
  const sortedDates = Array.from(tasksByDate.keys()).sort()

  function formatDate(dateString: string) {
    // dateString is already in YYYY-MM-DD format from the Map key
    const date = formatDateOnly(dateString)
    // Add weekday by parsing the ISO string
    const [year, month, day] = dateString.split('-').map(Number)
    const dateObj = new Date(Date.UTC(year, month - 1, day))
    const weekday = dateObj.toLocaleDateString('en-US', {
      weekday: 'short',
      timeZone: 'UTC',
    })
    return `${weekday}, ${date}`
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

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Calendar</h2>

      {/* Tasks grouped by due date */}
      {sortedDates.length === 0 && noDueDate.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
          <p className="text-gray-500">No tasks with due dates.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map((date) => {
            const dateTasks = tasksByDate.get(date) || []
            return (
              <div key={date} className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">{formatDate(date)}</h3>
                <div className="space-y-2">
                  {dateTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between rounded border border-gray-100 bg-gray-50 p-3"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{task.title}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(
                              task.status
                            )}`}
                          >
                            {task.status.replace('_', ' ')}
                          </span>
                        </div>
                        {task.description && (
                          <p className="mt-1 text-sm text-gray-500">{task.description}</p>
                        )}
                        {task.owner_name && (
                          <p className="mt-1 text-xs text-gray-400">Owner: {task.owner_name}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* No due date group */}
          {noDueDate.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">No due date</h3>
              <div className="space-y-2">
                {noDueDate.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between rounded border border-gray-100 bg-gray-50 p-3"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{task.title}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(
                            task.status
                          )}`}
                        >
                          {task.status.replace('_', ' ')}
                        </span>
                      </div>
                      {task.description && (
                        <p className="mt-1 text-sm text-gray-500">{task.description}</p>
                      )}
                      {task.owner_name && (
                        <p className="mt-1 text-xs text-gray-400">Owner: {task.owner_name}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

