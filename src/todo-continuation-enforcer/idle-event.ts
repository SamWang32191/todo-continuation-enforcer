import {
  ABORT_WINDOW_MS,
  CONTINUATION_COOLDOWN_MS,
  DEFAULT_SKIP_AGENTS,
  MAX_CONSECUTIVE_FAILURES,
} from "./constants"
import { getIncompleteCount } from "./todo"
import { isCompactionGuardActive } from "./compaction-guard"
import type { SessionState, Todo } from "./types"

export async function shouldContinueOnIdle(args: {
  sessionID: string
  state: SessionState
  todos: Todo[]
  now: number
  hasPendingQuestion: boolean
  hasRunningBackgroundTask: boolean
  isContinuationStopped: boolean
  agent?: string
  skipAgents?: string[]
}): Promise<{ shouldInject: boolean; reason?: string; incompleteCount: number }> {
  const incompleteCount = getIncompleteCount(args.todos)
  const skipAgents = args.skipAgents ?? DEFAULT_SKIP_AGENTS

  if (incompleteCount === 0) {
    return { shouldInject: false, reason: "no_incomplete_todos", incompleteCount }
  }

  if (args.hasPendingQuestion) {
    return { shouldInject: false, reason: "pending_question", incompleteCount }
  }

  if (args.hasRunningBackgroundTask) {
    return { shouldInject: false, reason: "background_task", incompleteCount }
  }

  if (args.isContinuationStopped) {
    return { shouldInject: false, reason: "stopped", incompleteCount }
  }

  if (args.agent && skipAgents.includes(args.agent)) {
    return { shouldInject: false, reason: "skip_agent", incompleteCount }
  }

  if (args.state.isRecovering) {
    return { shouldInject: false, reason: "recovering", incompleteCount }
  }

  if (args.state.inFlight) {
    return { shouldInject: false, reason: "in_flight", incompleteCount }
  }

  if (args.state.abortDetectedAt !== undefined && args.now - args.state.abortDetectedAt < ABORT_WINDOW_MS) {
    return { shouldInject: false, reason: "recent_abort", incompleteCount }
  }

  if (args.state.lastInjectedAt !== undefined && args.now - args.state.lastInjectedAt < CONTINUATION_COOLDOWN_MS) {
    return { shouldInject: false, reason: "cooldown", incompleteCount }
  }

  if (args.state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    return { shouldInject: false, reason: "too_many_failures", incompleteCount }
  }

  if (isCompactionGuardActive(args.state, args.now)) {
    return { shouldInject: false, reason: "compaction_guard", incompleteCount }
  }

  return { shouldInject: true, incompleteCount }
}
