import type { BackgroundTaskProbe } from "../plugin/adapters/background-task-probe"
import type { Logger } from "../plugin/adapters/logger"
import type { MessageStore } from "../plugin/adapters/message-store"
import type { SessionApi } from "../plugin/adapters/session-api"
import type { CountdownToast } from "../plugin/adapters/toast"

import { handleCleanupEvent } from "./cleanup"
import { runIdleCycle } from "./idle-cycle"
import { SessionStateStore } from "./session-state"

export type ContinuationEvent = {
  type: "session.idle" | "session.error" | "session.deleted" | "session.compacted" | "session.interrupt" | "session.stop"
  sessionID: string
  error?: { name?: string }
}

export type CancelNextContinuationResult = {
  status: "cancelled" | "no_pending"
}

export type CancelPendingWorkResult = CancelNextContinuationResult

export function createTodoContinuationHandler(args: {
  sessionApi: SessionApi
  messageStore: MessageStore
  logger: Logger
  backgroundTaskProbe: BackgroundTaskProbe
  toast: CountdownToast
  countdownSeconds: number
  skipAgents?: string[]
  isContinuationStopped?: (sessionID: string) => boolean
}) {
  const stateStore = new SessionStateStore()

  return {
    getState(sessionID: string) {
      return stateStore.getExistingState(sessionID)
    },

      async cancelNextContinuation(sessionID: string): Promise<CancelNextContinuationResult> {
        const state = stateStore.getExistingState(sessionID)

        if (!state?.pendingContinuation) {
          return { status: "no_pending" }
        }

        state.pendingContinuation = false
        state.countdownCancel?.()
        state.countdownCancel = undefined
        await args.toast.showCancelled("Continuation stopped.")

        return { status: "cancelled" }
    },

    async cancelPendingWork(sessionID: string): Promise<CancelPendingWorkResult> {
      return this.cancelNextContinuation(sessionID)
    },

    async handleEvent(event: ContinuationEvent): Promise<void> {
      if (event.type === "session.interrupt") {
        await this.cancelNextContinuation(event.sessionID)
        return
      }

      if (event.type === "session.deleted" || event.type === "session.compacted" || event.type === "session.error") {
        const cleanupEvent = event as Extract<ContinuationEvent, { type: "session.deleted" | "session.compacted" | "session.error" }>
        const state = event.type === "session.deleted" ? stateStore.getExistingState(event.sessionID) : stateStore.getState(event.sessionID)
        handleCleanupEvent({
          event: cleanupEvent,
          state,
          clearState: () => stateStore.clear(event.sessionID),
        })

        return
      }

      if (event.type !== "session.idle") {
        return
      }

      await runIdleCycle({
        sessionID: event.sessionID,
        state: stateStore.getState(event.sessionID),
        sessionApi: args.sessionApi,
        messageStore: args.messageStore,
        logger: args.logger,
        backgroundTaskProbe: args.backgroundTaskProbe,
        toast: args.toast,
        countdownSeconds: args.countdownSeconds,
        skipAgents: args.skipAgents,
        isContinuationStopped: args.isContinuationStopped,
      })
    },
  }
}
