export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled"

export interface Todo {
  content: string
  status: TodoStatus
  priority: string
  id?: string
}

export interface SessionState {
  countdownTimer?: ReturnType<typeof setTimeout>
  countdownInterval?: ReturnType<typeof setInterval>
  countdownCancel?: () => void
  pendingContinuation?: boolean
  abortDetectedAt?: number
  lastIncompleteCount?: number
  lastInjectedAt?: number
  inFlight?: boolean
  stagnationCount: number
  consecutiveFailures: number
  recentCompactionAt?: number
}
