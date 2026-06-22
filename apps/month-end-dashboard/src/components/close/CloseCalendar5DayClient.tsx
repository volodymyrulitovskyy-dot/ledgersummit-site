"use client"

import { CloseCalendar5Day } from './CloseCalendar5Day'
import { assignDueDateAction } from '@/app/(app)/calendar/actions'

export default function CloseCalendar5DayClient({
  rangeToISO,
  tasks,
  onAddTask,
}: {
  rangeToISO: string
  tasks: any[]
  onAddTask?: () => void
}) {
  return (
    <CloseCalendar5Day
      rangeToISO={rangeToISO}
      tasks={tasks}
      onAssignDueDate={assignDueDateAction}
      onAddTask={onAddTask}
    />
  )
}
