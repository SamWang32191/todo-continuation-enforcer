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
  continuationStopped?: boolean
  pendingContinuation?: boolean
  isRecovering?: boolean
  countdownStartedAt?: number
  abortDetectedAt?: number
  lastIncompleteCount?: number
  lastInjectedAt?: number
  awaitingPostInjectionProgressCheck?: boolean
  inFlight?: boolean
  stagnationCount: number
  consecutiveFailures: number
  recentCompactionAt?: number
  recentCompactionEpoch?: number
  acknowledgedCompactionEpoch?: number
}
