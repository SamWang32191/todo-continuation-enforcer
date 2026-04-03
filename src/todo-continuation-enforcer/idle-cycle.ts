import type { BackgroundTaskProbe } from "../plugin/adapters/background-task-probe"
import type { Logger } from "../plugin/adapters/logger"
import type { MessageStore } from "../plugin/adapters/message-store"
import type { SessionApi } from "../plugin/adapters/session-api"
import type { CountdownToast } from "../plugin/adapters/toast"

import { injectContinuation } from "./continuation-injection"
import { hasPendingQuestion } from "./pending-question-detection"
import { resolveMessageInfo } from "./resolve-message-info"
import { shouldContinueOnIdle } from "./idle-event"
import { runCountdown } from "./countdown"
import { commitStagnationState, previewStagnationState } from "./stagnation-detection"
import type { SessionState } from "./types"

export async function runIdleCycle(args: {
  sessionID: string
  state: SessionState
  sessionApi: SessionApi
  messageStore: MessageStore
  logger: Logger
  backgroundTaskProbe: BackgroundTaskProbe
  toast: CountdownToast
  countdownSeconds: number
  skipAgents?: string[]
  isContinuationStopped?: (sessionID: string) => boolean
}): Promise<void> {
  const { sessionID, state } = args

  if (args.isContinuationStopped?.(sessionID) || state.inFlight) {
    return
  }

  state.inFlight = true
  try {
    await runOneIdlePass(args, state)
  } catch (error) {
    state.consecutiveFailures += 1
    args.logger.warn("continuation flow failed", { sessionID, error })
  } finally {
    state.inFlight = false
    state.countdownCancel = undefined
    state.pendingContinuation = false
  }
}

async function runOneIdlePass(args: Parameters<typeof runIdleCycle>[0], state: SessionState): Promise<void> {
  const { sessionID } = args
  const now = Date.now()
  const todos = await args.sessionApi.getTodos(sessionID)
  const messageInfo = await resolveMessageInfo({ sessionID, sessionApi: args.sessionApi, messageStore: args.messageStore })
  const decision = await shouldContinueOnIdle({
    state: { ...state, inFlight: false },
    todos,
    now,
    hasPendingQuestion: hasPendingQuestion(messageInfo),
    hasRunningBackgroundTask: args.backgroundTaskProbe.hasRunningTask(sessionID),
    isContinuationStopped: args.isContinuationStopped?.(sessionID) ?? false,
    agent: messageInfo?.agent,
    skipAgents: args.skipAgents,
  })

  if (!decision.shouldInject) {
    args.logger.debug("skip continuation", decision)
    return
  }

  const stagnationPreview = previewStagnationState(state, decision.incompleteCount)
  if (!stagnationPreview.shouldContinue) {
    args.logger.warn("skip continuation due to stagnation", { sessionID, stagnationCount: state.stagnationCount })
    return
  }

  if (args.isContinuationStopped?.(sessionID)) {
    return
  }

  state.pendingContinuation = true
  const countdownCompleted = await runCountdown({ seconds: args.countdownSeconds, incompleteCount: decision.incompleteCount, state, toast: args.toast })
  if (!countdownCompleted) {
    return
  }

  if (!state.pendingContinuation) {
    args.logger.debug("skip continuation after countdown cancel")
    return
  }

  const freshTodos = await args.sessionApi.getTodos(sessionID)
  const freshMessageInfo = await resolveMessageInfo({ sessionID, sessionApi: args.sessionApi, messageStore: args.messageStore })
  const freshDecision = await shouldContinueOnIdle({
    state: { ...state, inFlight: false },
    todos: freshTodos,
    now: Date.now(),
    hasPendingQuestion: hasPendingQuestion(freshMessageInfo),
    hasRunningBackgroundTask: args.backgroundTaskProbe.hasRunningTask(sessionID),
    isContinuationStopped: args.isContinuationStopped?.(sessionID) ?? false,
    agent: freshMessageInfo?.agent,
    skipAgents: args.skipAgents,
  })

  if (!freshDecision.shouldInject || args.isContinuationStopped?.(sessionID)) {
    args.logger.debug("skip continuation after recheck", freshDecision)
    return
  }

  if (!state.pendingContinuation) {
    args.logger.debug("skip continuation after recheck cancel")
    return
  }

  state.pendingContinuation = false
  await injectContinuation({ sessionID, sessionApi: args.sessionApi, todos: freshTodos, agent: freshMessageInfo?.agent, model: freshMessageInfo?.model })
  commitStagnationState(state, stagnationPreview)
  state.lastInjectedAt = Date.now()
  state.consecutiveFailures = 0
}
