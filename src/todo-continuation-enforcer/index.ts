import type { BackgroundTaskProbe } from "../plugin/adapters/background-task-probe"
import type { Logger } from "../plugin/adapters/logger"
import type { MessageStore } from "../plugin/adapters/message-store"
import type { SessionApi } from "../plugin/adapters/session-api"

import { createTodoContinuationHandler } from "./handler"

export function createTodoContinuationEnforcer(args: {
  sessionApi: SessionApi
  messageStore?: MessageStore
  logger: Logger
  backgroundTaskProbe: BackgroundTaskProbe
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
    countdownSeconds: args.countdownSeconds ?? 2,
    skipAgents: args.skipAgents,
  })
}
