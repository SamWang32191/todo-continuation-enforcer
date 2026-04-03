import type { Logger } from "../plugin/adapters/logger"
import { isAbortLikeError } from "./abort-detection"
import { cancelCountdownState } from "./countdown-state"
import type { SessionState } from "./types"

export type CleanupEvent = {
  type: "session.error" | "session.deleted" | "session.compacted" | "session.interrupt"
  sessionID: string
  error?: { name?: string }
}

export function handleCleanupEvent(args: {
  event: CleanupEvent
  state: SessionState | undefined
  clearState: () => void
  logger?: Logger
}): void {
  const { event, state } = args

  if (event.type === "session.interrupt") {
    cancelCountdownState(state)
    return
  }

  if (event.type === "session.deleted") {
    cancelCountdownState(state)
    args.clearState()
    return
  }

  if (event.type === "session.compacted") {
    if (state) {
      state.recentCompactionAt = Date.now()
    }
    cancelCountdownState(state)
    return
  }

  if (event.type === "session.error") {
    if (state && isAbortLikeError(event.error)) {
      state.abortDetectedAt = Date.now()
    }
    cancelCountdownState(state)
    args.logger?.warn("session error cleanup", { sessionID: event.sessionID, error: event.error })
  }
}
