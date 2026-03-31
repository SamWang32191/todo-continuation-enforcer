import type { BackgroundTaskProbe } from "../plugin/adapters/background-task-probe"
import type { Logger } from "../plugin/adapters/logger"
import type { MessageStore } from "../plugin/adapters/message-store"
import type { SessionApi } from "../plugin/adapters/session-api"
import type { CountdownToast } from "../plugin/adapters/toast"

import { COUNTDOWN_SECONDS } from "./constants"
import { createTodoContinuationHandler } from "./handler"
import { createNoopCountdownToast } from "../plugin/adapters/toast"

export function createTodoContinuationEnforcer(args: {
  sessionApi: SessionApi
  messageStore?: MessageStore
  logger: Logger
  backgroundTaskProbe: BackgroundTaskProbe
  toast?: CountdownToast
  countdownSeconds?: number
  skipAgents?: string[]
}) {
  return createTodoContinuationHandler({
    sessionApi: args.sessionApi,
    messageStore: args.messageStore ?? {
      async findLatestMessageInfo() {
        return undefined
      },
    },
    logger: args.logger,
    backgroundTaskProbe: args.backgroundTaskProbe,
    toast: args.toast ?? createNoopCountdownToast(),
    countdownSeconds: args.countdownSeconds ?? COUNTDOWN_SECONDS,
    skipAgents: args.skipAgents,
  })
}
