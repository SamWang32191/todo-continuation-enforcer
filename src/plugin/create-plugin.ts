import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin"

import { createEventHandler } from "./event-handler"
import { createNoopBackgroundTaskProbe } from "./adapters/background-task-probe"
import { createConsoleLogger } from "./adapters/logger"
import { createNoopMessageStore } from "./adapters/message-store"
import { createSdkSessionApi } from "./adapters/session-api"
import { createTodoContinuationEnforcer } from "../todo-continuation-enforcer"

export function createPlugin(): Plugin {
  const plugin: Plugin = async (ctx: PluginInput): Promise<Hooks> => {
    const enforcer = createTodoContinuationEnforcer({
      sessionApi: createSdkSessionApi(ctx),
      messageStore: createNoopMessageStore(),
      logger: createConsoleLogger(),
      backgroundTaskProbe: createNoopBackgroundTaskProbe(),
    })

    return {
      event: createEventHandler(enforcer.handleEvent),
    }
  }

  return plugin
}
