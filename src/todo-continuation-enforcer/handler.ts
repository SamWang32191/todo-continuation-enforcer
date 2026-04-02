import type { BackgroundTaskProbe } from "../plugin/adapters/background-task-probe"
import type { Logger } from "../plugin/adapters/logger"
import type { MessageStore } from "../plugin/adapters/message-store"
import type { SessionApi } from "../plugin/adapters/session-api"
import type { CountdownToast } from "../plugin/adapters/toast"

import { runCountdown } from "./countdown"
import { injectContinuation } from "./continuation-injection"
import { hasPendingQuestion } from "./pending-question-detection"
import { resolveMessageInfo } from "./resolve-message-info"
import { shouldContinueOnIdle } from "./idle-event"
import { isAbortLikeError } from "./abort-detection"
import { SessionStateStore } from "./session-state"
import { commitStagnationState, previewStagnationState } from "./stagnation-detection"

export type ContinuationEvent = {
  type: "session.idle" | "session.error" | "session.deleted" | "session.compacted" | "session.interrupt"
  sessionID: string
  error?: { name?: string }
}

export type CancelNextContinuationResult = {
  status: "cancelled" | "no_pending"
}

export function createTodoContinuationHandler(args: {
  sessionApi: SessionApi
  messageStore: MessageStore
  logger: Logger
  backgroundTaskProbe: BackgroundTaskProbe
  toast: CountdownToast
  countdownSeconds: number
  skipAgents?: string[]
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

      state.continuationStopped = true
      state.pendingContinuation = false
      state.countdownCancel?.()
      await args.toast.showCancelled("Next continuation cancelled.")

      return { status: "cancelled" }
    },

    async handleEvent(event: ContinuationEvent): Promise<void> {
      if (event.type === "session.interrupt") {
        await this.cancelNextContinuation(event.sessionID)
        return
      }

      if (event.type === "session.deleted") {
        stateStore.clear(event.sessionID)
        return
      }

      const state = stateStore.getState(event.sessionID)

      if (event.type === "session.compacted") {
        state.recentCompactionAt = Date.now()
        if (state.countdownCancel) {
          state.countdownCancel()
        }

        return
      }

      if (event.type === "session.error") {
        if (isAbortLikeError(event.error)) {
          state.abortDetectedAt = Date.now()
        }

        if (state.countdownCancel) {
          state.countdownCancel()
        }

        return
      }

      if (event.type !== "session.idle") {
        return
      }

      if (state.inFlight) {
        return
      }

      state.inFlight = true
      state.countdownStartedAt = Date.now()

      try {
        const now = Date.now()
        const todos = await args.sessionApi.getTodos(event.sessionID)
        const messageInfo = await resolveMessageInfo({
          sessionID: event.sessionID,
          sessionApi: args.sessionApi,
          messageStore: args.messageStore,
        })

        const decision = await shouldContinueOnIdle({
          sessionID: event.sessionID,
          state: { ...state, inFlight: false },
          todos,
          now,
          hasPendingQuestion: hasPendingQuestion(messageInfo),
          hasRunningBackgroundTask: args.backgroundTaskProbe.hasRunningTask(event.sessionID),
          isContinuationStopped: Boolean(state.continuationStopped),
          agent: messageInfo?.agent,
          skipAgents: args.skipAgents,
        })

        if (!decision.shouldInject) {
          args.logger.debug("skip continuation", decision)
          return
        }

        const stagnationPreview = previewStagnationState(state, decision.incompleteCount)

        if (!stagnationPreview.shouldContinue) {
          args.logger.warn("skip continuation due to stagnation", {
            sessionID: event.sessionID,
            stagnationCount: state.stagnationCount,
          })
          return
        }

        state.pendingContinuation = true

        const countdownCompleted = await runCountdown({
          seconds: args.countdownSeconds,
          incompleteCount: decision.incompleteCount,
          state,
          toast: args.toast,
        })

        if (!countdownCompleted || !stateStore.getExistingState(event.sessionID)) {
          return
        }

        const freshTodos = await args.sessionApi.getTodos(event.sessionID)
        const freshMessageInfo = await resolveMessageInfo({
          sessionID: event.sessionID,
          sessionApi: args.sessionApi,
          messageStore: args.messageStore,
        })

        const freshDecision = await shouldContinueOnIdle({
          sessionID: event.sessionID,
          state: { ...state, inFlight: false },
          todos: freshTodos,
          now: Date.now(),
          hasPendingQuestion: hasPendingQuestion(freshMessageInfo),
          hasRunningBackgroundTask: args.backgroundTaskProbe.hasRunningTask(event.sessionID),
          isContinuationStopped: Boolean(state.continuationStopped),
          agent: freshMessageInfo?.agent,
          skipAgents: args.skipAgents,
        })

        if (!freshDecision.shouldInject) {
          args.logger.debug("skip continuation after recheck", freshDecision)
          return
        }

        if (state.continuationStopped) {
          args.logger.debug("skip continuation due to user cancel", { sessionID: event.sessionID })
          return
        }

        state.pendingContinuation = false

        await injectContinuation({
          sessionID: event.sessionID,
          sessionApi: args.sessionApi,
          todos: freshTodos,
          agent: freshMessageInfo?.agent,
          model: freshMessageInfo?.model,
        })

        commitStagnationState(state, stagnationPreview)
        state.lastInjectedAt = Date.now()
        state.awaitingPostInjectionProgressCheck = true
        state.consecutiveFailures = 0
      } catch (error) {
        state.consecutiveFailures += 1
        args.logger.warn("continuation flow failed", {
          sessionID: event.sessionID,
          error,
        })
      } finally {
        if (stateStore.getExistingState(event.sessionID)) {
          state.inFlight = false
          state.countdownCancel = undefined
          state.continuationStopped = false
          state.pendingContinuation = false
        }
      }
    },
  }
}
